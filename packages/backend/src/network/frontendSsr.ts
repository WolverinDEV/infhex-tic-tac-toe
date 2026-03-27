import { dehydrate, QueryClient } from '@tanstack/react-query'
import {
    FINISHED_GAMES_PAGE_SIZE,
    queryKeys
} from '@ih3t/shared'
import type {
    FinishedGamesArchiveView,
    LobbyInfo,
} from '@ih3t/shared'
import type express from 'express'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ApiQueryService, ApiRequestError } from './rest/apiQueryService'

interface FrontendSsrDependencies {
    apiQueryService: ApiQueryService
    ssrDistPath: string
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
        const requestUrl = new URL(req.originalUrl || req.url, `${req.protocol}://${req.get('host')}`)
        const accountResponse = await this.dependencies.apiQueryService.getAccount(req)
        const currentUser = accountResponse.user

        /* never assume shutdown in SSR */
        queryClient.setQueryData(queryKeys.serverShutdown, null)

        queryClient.setQueryData(queryKeys.account, accountResponse)
        if (currentUser) {
            try {
                queryClient.setQueryData(
                    queryKeys.accountPreferences,
                    await this.dependencies.apiQueryService.getAccountPreferences(req)
                )
            } catch (error: unknown) {
                if (!(error instanceof ApiRequestError)) {
                    throw error
                }
            }
        }

        await this.prefetchRouteData(queryClient, req, requestUrl, currentUser?.id ?? null)

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
        req: express.Request,
        requestUrl: URL,
        currentUserId: string | null
    ): Promise<void> {
        const path = requestUrl.pathname

        if (path === '/' || path.startsWith('/admin') || path === '/account/profile' || path.startsWith("/profile/")) {
            queryClient.setQueryData(queryKeys.availableSessions, sortLobbySessions(this.dependencies.apiQueryService.listSessions()))
        }

        if (path === '/leaderboard') {
            queryClient.setQueryData(queryKeys.leaderboard, await this.dependencies.apiQueryService.getLeaderboard(req))
        }

        const profileMatch = path.match(/^\/profile\/(?<id>[^/]+)|\/account\/profile$/)
        if (profileMatch) {
            const profileId = decodeURIComponent(profileMatch.groups?.["id"] ?? currentUserId ?? "")
            if (!profileId) {
                return
            }

            const [profile, statistics, recentGames] = await Promise.all([
                this.dependencies.apiQueryService.getProfile(profileId),
                this.dependencies.apiQueryService.getProfileStatistics(profileId),
                this.dependencies.apiQueryService.getProfileGames(profileId)
            ])

            if (profile) {
                queryClient.setQueryData(queryKeys.profile(profileId), profile)
            }

            if (statistics) {
                queryClient.setQueryData(queryKeys.profileStatistics(profileId), statistics)
            }

            if (recentGames) {
                queryClient.setQueryData(queryKeys.profileRecentGames(profileId), recentGames)
            }
        }

        if (path === '/games' || path === '/account/games') {
            const archiveView: FinishedGamesArchiveView = path.startsWith('/account/games') ? 'mine' : 'all'
            const page = parsePositiveInteger(requestUrl.searchParams.get('page')) ?? 1
            const baseTimestamp = parsePositiveInteger(requestUrl.searchParams.get('at'))

            if (baseTimestamp !== null) {
                try {
                    queryClient.setQueryData(
                        queryKeys.finishedGamesPage(archiveView, page, FINISHED_GAMES_PAGE_SIZE, baseTimestamp),
                        await this.dependencies.apiQueryService.getFinishedGames(req, {
                            view: archiveView,
                            page,
                            pageSize: FINISHED_GAMES_PAGE_SIZE,
                            baseTimestamp
                        })
                    )
                } catch (error: unknown) {
                    if (!(error instanceof ApiRequestError)) {
                        throw error
                    }
                }
            }
        }

        const finishedGameMatch = path.match(/^\/(?:account\/)?games\/([^/]+)$/)
        if (finishedGameMatch) {
            const gameId = decodeURIComponent(finishedGameMatch[1])
            const finishedGame = await this.dependencies.apiQueryService.getFinishedGame(gameId)
            if (finishedGame) {
                queryClient.setQueryData(queryKeys.finishedGame(gameId), finishedGame)
            }
        }

        const sandboxPositionMatch = path.match(/^\/sandbox\/([^/]+)$/)
        if (sandboxPositionMatch) {
            const positionId = decodeURIComponent(sandboxPositionMatch[1])
            const sandboxPosition = await this.dependencies.apiQueryService.getSandboxPosition(positionId)
            if (sandboxPosition) {
                queryClient.setQueryData(queryKeys.sandboxPosition(positionId), sandboxPosition)
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
}
