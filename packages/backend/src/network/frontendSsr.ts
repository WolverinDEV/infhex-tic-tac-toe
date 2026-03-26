import { dehydrate, QueryClient } from '@tanstack/react-query'
import {
    FINISHED_GAMES_PAGE_SIZE,
    queryKeys
} from '@ih3t/shared'
import type {
    AccountPreferencesResponse,
    AccountResponse,
    ProfileStatisticsResponse,
    FinishedGamesArchiveView,
    FinishedGameRecord,
    FinishedGamesPage,
    Leaderboard,
    LobbyInfo,
    ProfileResponse,
    SandboxPositionResponse,
    ProfileGamesResponse
} from '@ih3t/shared'
import type express from 'express'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AuthRepository } from '../auth/authRepository'
import type { AuthService } from '../auth/authService'
import type { EloRepository } from '../elo/eloRepository'
import type { LeaderboardService } from '../leaderboard/leaderboardService'
import type { GameHistoryRepository } from '../persistence/gameHistoryRepository'
import type { SandboxPositionService } from '../sandbox/sandboxPositionService'
import type { SessionManager } from '../session/sessionManager'

interface FrontendSsrDependencies {
    authRepository: AuthRepository
    authService: AuthService
    eloRepository: EloRepository
    ssrDistPath: string
    gameHistoryRepository: GameHistoryRepository
    leaderboardService: LeaderboardService
    sandboxPositionService: SandboxPositionService
    sessionManager: SessionManager
}

interface RenderAppModule {
    renderApp: (options: { url: string; dehydratedState?: unknown }) => string | Promise<string>
}

interface FrontendRenderResult {
    appHtml: string
    dehydratedState: unknown
    renderedAt: number
}

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnMount: false,
                refetchOnReconnect: false,
                refetchOnWindowFocus: false
            }
        }
    })
}

function sortLobbySessions(sessions: LobbyInfo[]) {
    return [...sessions].sort((leftSession, rightSession) => {
        const leftCanJoin = leftSession.startedAt === null && leftSession.players.length < 2
        const rightCanJoin = rightSession.startedAt === null && rightSession.players.length < 2

        if (leftCanJoin !== rightCanJoin) {
            return leftCanJoin ? -1 : 1
        }

        return (rightSession.startedAt ?? 0) - (leftSession.startedAt ?? 0)
    })
}

function parsePositiveInteger(value: string | null): number | null {
    if (!value) {
        return null
    }

    const parsedValue = Number.parseInt(value, 10)
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

export class FrontendSsrRenderer {
    private frontendServerRendererPromise: Promise<RenderAppModule['renderApp']> | null = null

    constructor(private readonly dependencies: FrontendSsrDependencies) { }

    async render(req: express.Request): Promise<FrontendRenderResult> {
        const renderedAt = Date.now()
        const queryClient = createQueryClient()
        const currentUser = await this.dependencies.authService.getUserFromRequest(req)
        const requestUrl = new URL(req.originalUrl || req.url, `${req.protocol}://${req.get('host')}`)
        const accountResponse: AccountResponse = {
            user: currentUser
        }

        /* never assume shutdown in SSR */
        queryClient.setQueryData(queryKeys.serverShutdown, null)

        queryClient.setQueryData(queryKeys.account, accountResponse)
        if (currentUser) {
            const accountPreferencesResponse: AccountPreferencesResponse = {
                preferences: await this.dependencies.authService.getUserPreferences(currentUser.id)
            }
            queryClient.setQueryData(queryKeys.accountPreferences, accountPreferencesResponse)
        }

        await this.prefetchRouteData(queryClient, requestUrl, currentUser?.id ?? null)

        const dehydratedState = dehydrate(queryClient)
        const renderApp = await this.getFrontendServerRenderer()
        const appHtml = await renderApp({
            url: `${requestUrl.pathname}${requestUrl.search}`,
            dehydratedState
        })

        return {
            appHtml,
            dehydratedState,
            renderedAt
        }
    }

    private async prefetchRouteData(
        queryClient: QueryClient,
        requestUrl: URL,
        currentUserId: string | null
    ): Promise<void> {
        const path = requestUrl.pathname

        if (path === '/' || path === '/admin') {
            queryClient.setQueryData(queryKeys.availableSessions, sortLobbySessions(this.dependencies.sessionManager.listLobbyInfo()))
        }

        if (path === '/leaderboard') {
            const leaderboard: Leaderboard = await this.dependencies.leaderboardService.getLeaderboardSnapshot(currentUserId)
            queryClient.setQueryData(queryKeys.leaderboard, leaderboard)
        }

        const publicProfileMatch = path.match(/^\/profile\/([^/]+)$/)
        if (publicProfileMatch) {
            const profileId = decodeURIComponent(publicProfileMatch[1])
            const profile = await this.dependencies.authRepository.getUserProfileById(profileId)
            if (profile) {
                const { email: _email, ...publicProfile } = profile

                const [
                    accountStatistics,
                    recentGames,
                ] = await Promise.all([
                    this.buildAccountStatistics(profileId),
                    this.dependencies.gameHistoryRepository.listFinishedGames({
                        page: 1,
                        pageSize: 10,
                        playerProfileId: profileId
                    })
                ])

                queryClient.setQueryData(
                    queryKeys.profile(profileId),
                    { user: publicProfile } satisfies ProfileResponse
                )
                queryClient.setQueryData(
                    queryKeys.profileStatistics(profileId),
                    { statistics: accountStatistics } satisfies ProfileStatisticsResponse
                )
                queryClient.setQueryData(
                    queryKeys.profileStatistics(profileId),
                    recentGames satisfies ProfileGamesResponse
                )
            }
        }

        if (path === '/games' || path === '/account/games') {
            const archiveView: FinishedGamesArchiveView = path.startsWith('/account/games') ? 'mine' : 'all'
            const page = parsePositiveInteger(requestUrl.searchParams.get('page')) ?? 1
            const baseTimestamp = parsePositiveInteger(requestUrl.searchParams.get('at'))

            if (baseTimestamp !== null && (archiveView === 'all' || currentUserId)) {
                const finishedGamesPage: FinishedGamesPage = await this.dependencies.gameHistoryRepository.listFinishedGames({
                    page,
                    pageSize: FINISHED_GAMES_PAGE_SIZE,
                    baseTimestamp,
                    playerProfileId: archiveView === 'mine' ? currentUserId ?? undefined : undefined
                })
                queryClient.setQueryData(
                    queryKeys.finishedGamesPage(archiveView, page, FINISHED_GAMES_PAGE_SIZE, baseTimestamp),
                    finishedGamesPage
                )
            }
        }

        const finishedGameMatch = path.match(/^\/(?:account\/)?games\/([^/]+)$/)
        if (finishedGameMatch) {
            const gameId = decodeURIComponent(finishedGameMatch[1])
            const finishedGame = await this.dependencies.gameHistoryRepository.getFinishedGame(gameId)
            if (finishedGame) {
                const finishedGameRecord: FinishedGameRecord = finishedGame
                queryClient.setQueryData(queryKeys.finishedGame(gameId), finishedGameRecord)
            }
        }

        const sandboxPositionMatch = path.match(/^\/sandbox\/([^/]+)$/)
        if (sandboxPositionMatch) {
            const positionId = decodeURIComponent(sandboxPositionMatch[1])
            const sandboxPosition = await this.dependencies.sandboxPositionService.loadPosition(positionId)
            if (sandboxPosition) {
                const sandboxPositionResponse: SandboxPositionResponse = {
                    id: positionId,
                    name: sandboxPosition.name,
                    gamePosition: sandboxPosition.gamePosition
                }
                queryClient.setQueryData(queryKeys.sandboxPosition(positionId), sandboxPositionResponse)
            }
        }
    }

    private async getFrontendServerRenderer(): Promise<RenderAppModule['renderApp']> {
        if (this.frontendServerRendererPromise) {
            return this.frontendServerRendererPromise
        }

        this.frontendServerRendererPromise = import(
            pathToFileURL(join(this.dependencies.ssrDistPath, 'entry-server.js')).href
        ).then((module: unknown) => {
            const renderApp = (module as Partial<RenderAppModule>).renderApp
            if (typeof renderApp !== 'function') {
                throw new Error('Frontend server bundle does not export renderApp().')
            }

            return renderApp
        }).catch((error: unknown) => {
            this.frontendServerRendererPromise = null
            throw error
        })

        return this.frontendServerRendererPromise
    }

    private async buildAccountStatistics(profileId: string): Promise<ProfileStatisticsResponse['statistics']> {
        const [gameStats, eloHistory, playerRating, leaderboardPlacement] = await Promise.all([
            this.dependencies.gameHistoryRepository.getPlayerProfileStatistics(profileId),
            this.dependencies.gameHistoryRepository.getPlayerEloHistory(profileId),
            this.dependencies.eloRepository.getPlayerRating(profileId),
            this.dependencies.eloRepository.getLeaderboardPlacement(profileId)
        ])

        return {
            totalGames: {
                played: gameStats.totalGamesPlayed,
                won: gameStats.totalGamesWon
            },
            rankedGames: {
                played: gameStats.rankedGamesPlayed,
                won: gameStats.rankedGamesWon,
                currentWinStreak: gameStats.currentRankedWinStreak,
                longestWinStreak: gameStats.longestRankedWinStreak
            },
            longestGamePlayedMs: gameStats.longestGamePlayedMs,
            longestGameByMoves: gameStats.longestGameByMoves,
            totalMovesMade: gameStats.totalMovesMade,
            eloHistory,
            elo: leaderboardPlacement?.eloScore ?? playerRating?.eloScore ?? 1000,
            worldRank: leaderboardPlacement?.rank ?? null
        }
    }
}
