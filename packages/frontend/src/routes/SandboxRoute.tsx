import {
    applyGameMove,
    cloneGameState,
    createStartedGameState,
    GameRuleError,
    type GameState,
    type SandboxGamePosition,
    type SandboxPlayerSlot,
    type SandboxPositionResponse,
    type SessionParticipant
} from '@ih3t/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'react-toastify'
import GameBoardCanvas from '../components/game-screen/GameBoardCanvas'
import useGameBoard from '../components/game-screen/useGameBoard'
import SandboxHud from '../components/sandbox/SandboxHud'
import SandboxImportModal from '../components/sandbox/SandboxImportModal'
import SandboxShareModal from '../components/sandbox/SandboxShareModal'
import SandboxTurnIndicator from '../components/sandbox/SandboxTurnIndicator'
import SandboxWelcomeModal from '../components/sandbox/SandboxWelcomeModal'
import SandboxWinnerBanner from '../components/sandbox/SandboxWinnerBanner'
import { useQueryAccount } from '../query/accountClient'
import { queryKeys } from '../query/queryDefinitions'
import { createSandboxPosition, fetchSandboxPosition, useQuerySandboxPosition } from '../query/sandboxClient'
import type { SandboxRouteState } from './sandboxRouteState'
import { playTilePlacedSound } from '../soundEffects'

interface SandboxSnapshot {
    positionName: string | null
    gameState: GameState
    gameHistory: GameState[]
}

const SANDBOX_PLAYERS: SessionParticipant[] = [
    {
        id: 'sandbox-player-1',
        displayName: 'Player 1',
        profileId: null,
        rating: { eloScore: 0, gameCount: 0 },
        ratingAdjustment: null,
        connection: { status: 'connected' }
    },
    {
        id: 'sandbox-player-2',
        displayName: 'Player 2',
        profileId: null,
        rating: { eloScore: 0, gameCount: 0 },
        ratingAdjustment: null,
        connection: { status: 'connected' }
    }
]

function createSandboxGameState() {
    return createStartedGameState(SANDBOX_PLAYERS.map((player) => player.id))
}

function normalizeSandboxPositionId(value: string | null | undefined) {
    const normalizedValue = value?.trim().toLowerCase() ?? ''
    return /^[a-z0-9]{7}$/.test(normalizedValue) ? normalizedValue : null
}

function extractSandboxPositionId(value: string) {
    const trimmedValue = value.trim()
    if (!trimmedValue) {
        return null
    }

    try {
        const url = new URL(trimmedValue)
        const pathSegments = url.pathname.split('/').filter(Boolean)
        if (pathSegments[0] === 'sandbox' && pathSegments[1]) {
            return normalizeSandboxPositionId(pathSegments[1])
        }
    } catch {
        // Fall back to treating the input as a raw position id.
    }

    return normalizeSandboxPositionId(trimmedValue)
}

function getSandboxPlayerSlot(playerId: string): SandboxPlayerSlot {
    return playerId === SANDBOX_PLAYERS[0]!.id ? 'player-1' : 'player-2'
}

function getSandboxPlayerId(playerSlot: SandboxPlayerSlot): string {
    return playerSlot === 'player-1' ? SANDBOX_PLAYERS[0]!.id : SANDBOX_PLAYERS[1]!.id
}

function buildSandboxGamePosition(gameState: GameState): SandboxGamePosition | null {
    if (!gameState.currentTurnPlayerId || gameState.placementsRemaining < 1) {
        return null
    }

    return {
        cells: gameState.cells.map((cell, index) => ({
            x: cell.x,
            y: cell.y,
            player: getSandboxPlayerSlot(cell.occupiedBy),
            moveId: index + 1
        })),
        currentTurnPlayer: getSandboxPlayerSlot(gameState.currentTurnPlayerId),
        placementsRemaining: gameState.placementsRemaining
    }
}

function restoreSandboxPosition(gamePosition: SandboxGamePosition) {
    const nextGameState = createSandboxGameState()
    const orderedCells = [...gamePosition.cells].sort((leftCell, rightCell) => leftCell.moveId - rightCell.moveId)
    const gameHistory: GameState[] = []

    for (const cell of orderedCells) {
        gameHistory.push(cloneGameState(nextGameState))
        applyGameMove(nextGameState, {
            playerId: getSandboxPlayerId(cell.player),
            x: cell.x,
            y: cell.y
        })
    }

    const expectedCurrentTurnPlayerId = getSandboxPlayerId(gamePosition.currentTurnPlayer)
    if (
        nextGameState.currentTurnPlayerId !== expectedCurrentTurnPlayerId
        || nextGameState.placementsRemaining !== gamePosition.placementsRemaining
    ) {
        throw new Error('Sandbox position is inconsistent.')
    }

    nextGameState.currentTurnExpiresAt = null
    nextGameState.playerTimeRemainingMs = {}

    return {
        gameState: nextGameState,
        gameHistory
    }
}

function getSandboxPositionKey(gameState: GameState) {
    const gamePosition = buildSandboxGamePosition(gameState)
    return gamePosition ? JSON.stringify(gamePosition) : null
}

function createSandboxSnapshot(gameState: GameState, gameHistory: readonly GameState[], positionName: string | null): SandboxSnapshot {
    return {
        positionName,
        gameState: cloneGameState(gameState),
        gameHistory: gameHistory.map((entry) => cloneGameState(entry))
    }
}

function SandboxRoute() {
    const location = useLocation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { positionId: routePositionId } = useParams<{ positionId?: string }>()
    const accountQuery = useQueryAccount({ enabled: true })
    const [gameState, setGameState] = useState(() => createSandboxGameState())
    const [gameHistory, setGameHistory] = useState<GameState[]>([])
    const [loadedSnapshot, setLoadedSnapshot] = useState<SandboxSnapshot | null>(null)
    const [isWelcomeModalVisible, setIsWelcomeModalVisible] = useState(() => !routePositionId)
    const [isWinnerBannerVisible, setIsWinnerBannerVisible] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [isImportingPosition, setIsImportingPosition] = useState(false)
    const [importModalError, setImportModalError] = useState<string | null>(null)
    const [isSharingPosition, setIsSharingPosition] = useState(false)
    const [shareModalError, setShareModalError] = useState<string | null>(null)
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)
    const [shareUrl, setShareUrl] = useState<string | null>(null)
    const [isCopyingShareUrl, setIsCopyingShareUrl] = useState(false)
    const cleanBoardStateRef = useRef(createSandboxGameState())
    const previousCellCountRef = useRef(gameState.cells.length)
    const lastLoadedPositionIdRef = useRef<string | null>(null)
    const lastInvalidRoutePositionIdRef = useRef<string | null>(null)
    const lastAppliedLocationKeyRef = useRef<string | null>(null)
    const normalizedRoutePositionId = normalizeSandboxPositionId(routePositionId)
    const routeInitialPosition = (location.state as SandboxRouteState | null)?.initialPosition ?? null

    const initialBoardState = loadedSnapshot?.gameState ?? cleanBoardStateRef.current
    const initialBoardStateKey = getSandboxPositionKey(initialBoardState)
    const currentBoardStateKey = getSandboxPositionKey(gameState)
    const currentPositionName = loadedSnapshot?.positionName ?? null
    const isAuthenticated = Boolean(accountQuery.data?.user)
    const localPlayerId = gameState.winner === null
        ? (gameState.currentTurnPlayerId ?? SANDBOX_PLAYERS[0]!.id)
        : null
    const canTakeBack = gameHistory.length > 0
    const canSharePosition =
        isAuthenticated
        && gameState.winner === null
        && currentBoardStateKey !== null
        && currentBoardStateKey !== initialBoardStateKey
    const routeSandboxPositionQuery = useQuerySandboxPosition(normalizedRoutePositionId, {
        enabled: Boolean(normalizedRoutePositionId)
    })
    const isRoutePositionLoading =
        Boolean(normalizedRoutePositionId)
        && routeSandboxPositionQuery.isFetching
        && lastLoadedPositionIdRef.current !== normalizedRoutePositionId

    const {
        canvasRef,
        canvasClassName,
        canvasHandlers,
        renderableCellCount,
        resetView
    } = useGameBoard({
        gameState: gameState,
        highlightedCells: gameState.winner?.cells ?? "last",
        localPlayerId,
        interactionEnabled: !isWelcomeModalVisible && !isWinnerBannerVisible && !isImportModalOpen && !isImportingPosition && !isShareModalOpen && !isRoutePositionLoading,
        onPlaceCell: gameState.winner === null ? handlePlaceCell : undefined
    })

    function applySandboxPosition(
        positionName: string,
        gamePosition: SandboxGamePosition,
        positionId: string | null
    ) {
        const { gameState: nextGameState, gameHistory: nextGameHistory } = restoreSandboxPosition(gamePosition)
        const nextLoadedSnapshot = createSandboxSnapshot(nextGameState, nextGameHistory, positionName)

        previousCellCountRef.current = nextGameState.cells.length
        lastLoadedPositionIdRef.current = positionId
        lastInvalidRoutePositionIdRef.current = null

        setLoadedSnapshot(nextLoadedSnapshot)
        setGameHistory(nextGameHistory)
        setGameState(nextGameState)
        setIsWinnerBannerVisible(false)
        setIsImportModalOpen(false)
        setImportModalError(null)
        setShareModalError(null)
        setIsShareModalOpen(false)
        resetView()
    }

    function applyLoadedSandboxPosition(response: SandboxPositionResponse) {
        applySandboxPosition(response.name, response.gamePosition, response.id)
    }

    function handlePlaceCell(x: number, y: number) {
        const actingPlayerId = gameState.currentTurnPlayerId ?? SANDBOX_PLAYERS[0]!.id
        const nextGameState = cloneGameState(gameState)

        try {
            applyGameMove(nextGameState, {
                playerId: actingPlayerId,
                x,
                y
            })

            setGameHistory((currentHistory) => [...currentHistory, cloneGameState(gameState)])
            setGameState(nextGameState)
            setIsWinnerBannerVisible(Boolean(nextGameState.winner))
        } catch (error) {
            const errorMessage = error instanceof GameRuleError
                ? error.message
                : 'This move is not legal in sandbox mode.'
            toast.error(errorMessage, {
                toastId: `sandbox:${errorMessage}`
            })
        }
    }

    useEffect(() => {
        const previousCellCount = previousCellCountRef.current
        if (gameState.cells.length > previousCellCount) {
            playTilePlacedSound()
        }

        previousCellCountRef.current = gameState.cells.length
    }, [gameState.cells.length])

    useEffect(() => {
        if (!routePositionId) {
            if (!routeInitialPosition) {
                setLoadedSnapshot(null)
            }
            setIsImportingPosition(false)
            lastLoadedPositionIdRef.current = null
            lastInvalidRoutePositionIdRef.current = null
            return
        }

        if (!normalizedRoutePositionId) {
            if (lastInvalidRoutePositionIdRef.current !== routePositionId) {
                lastInvalidRoutePositionIdRef.current = routePositionId
                toast.error('Sandbox position id is invalid.')
            }
            setIsImportingPosition(false)
            void navigate('/sandbox', { replace: true })
            return
        }

        if (lastLoadedPositionIdRef.current === normalizedRoutePositionId) {
            setIsImportingPosition(false)
            setIsWelcomeModalVisible(false)
            return
        }

        setIsImportingPosition(true)
        setIsWelcomeModalVisible(false)
    }, [navigate, normalizedRoutePositionId, routeInitialPosition, routePositionId])

    useEffect(() => {
        if (routePositionId || !routeInitialPosition) {
            return
        }

        if (lastAppliedLocationKeyRef.current === location.key) {
            return
        }

        lastAppliedLocationKeyRef.current = location.key
        applySandboxPosition(routeInitialPosition.name, routeInitialPosition.gamePosition, null)
        setIsWelcomeModalVisible(false)
    }, [location.key, routeInitialPosition, routePositionId])

    useEffect(() => {
        if (!normalizedRoutePositionId) {
            return
        }

        if (!routeSandboxPositionQuery.data) {
            return
        }

        if (lastLoadedPositionIdRef.current === normalizedRoutePositionId) {
            return
        }

        applyLoadedSandboxPosition(routeSandboxPositionQuery.data)
        setIsImportingPosition(false)
    }, [normalizedRoutePositionId, routeSandboxPositionQuery.data])

    useEffect(() => {
        if (!normalizedRoutePositionId) {
            return
        }

        if (!routeSandboxPositionQuery.error) {
            return
        }

        if (lastLoadedPositionIdRef.current === normalizedRoutePositionId) {
            return
        }

        toast.error(routeSandboxPositionQuery.error instanceof Error ? routeSandboxPositionQuery.error.message : 'Failed to load sandbox position.')
        lastLoadedPositionIdRef.current = null
        setIsImportingPosition(false)
        void navigate('/sandbox', { replace: true })
    }, [navigate, normalizedRoutePositionId, routeSandboxPositionQuery.error])

    const resetSandbox = () => {
        const nextGameState = loadedSnapshot
            ? cloneGameState(loadedSnapshot.gameState)
            : createSandboxGameState()
        const nextGameHistory = loadedSnapshot
            ? loadedSnapshot.gameHistory.map((entry) => cloneGameState(entry))
            : []

        previousCellCountRef.current = nextGameState.cells.length
        setGameHistory(nextGameHistory)
        setGameState(nextGameState)
        setIsWinnerBannerVisible(false)
        setShareUrl(null)
        setShareModalError(null)
        setIsShareModalOpen(false)
    }

    const takeBackMove = () => {
        const previousGameState = gameHistory[gameHistory.length - 1]
        if (!previousGameState) {
            return
        }

        previousCellCountRef.current = previousGameState.cells.length
        setGameHistory((currentHistory) => currentHistory.slice(0, -1))
        setGameState(cloneGameState(previousGameState))
        setIsWinnerBannerVisible(false)
        setShareUrl(null)
        setShareModalError(null)
        setIsShareModalOpen(false)
    }

    const sharePosition = async (name: string) => {
        const gamePosition = buildSandboxGamePosition(gameState)
        if (!gamePosition) {
            toast.error('Only active sandbox positions can be shared.')
            return
        }

        setShareModalError(null)
        setIsSharingPosition(true)
        try {
            const response = await createSandboxPosition(name, gamePosition)

            const nextSharedSnapshot = createSandboxSnapshot(gameState, gameHistory, response.name)
            const nextShareUrl = new URL(`/sandbox/${response.id}`, window.location.origin).toString()

            lastLoadedPositionIdRef.current = response.id
            setLoadedSnapshot(nextSharedSnapshot)
            setIsShareModalOpen(true)
            setShareUrl(nextShareUrl)

            if (routePositionId !== response.id) {
                void navigate(`/sandbox/${response.id}`, { replace: true })
            }
        } catch (error) {
            setShareModalError(error instanceof Error ? error.message : 'Failed to share sandbox position.')
        } finally {
            setIsSharingPosition(false)
        }
    }

    const copyShareUrl = async () => {
        if (!shareUrl) {
            return
        }

        if (!navigator.clipboard?.writeText) {
            toast.error('Clipboard access is not available in this browser.')
            return
        }

        setIsCopyingShareUrl(true)
        try {
            await navigator.clipboard.writeText(shareUrl)
            toast.success('Sandbox position link copied to clipboard.')
        } catch {
            toast.error('Failed to copy sandbox position link.')
        } finally {
            setIsCopyingShareUrl(false)
        }
    }

    const importPosition = async (positionId: string) => {
        setImportModalError(null)
        setIsImportingPosition(true)

        try {
            const response = await queryClient.fetchQuery({
                queryKey: queryKeys.sandboxPosition(positionId),
                queryFn: () => fetchSandboxPosition(positionId),
                staleTime: 60 * 60 * 1000
            })
            applyLoadedSandboxPosition(response)
            setIsWelcomeModalVisible(false)

            if (routePositionId !== response.id) {
                void navigate(`/sandbox/${response.id}`)
            }
        } catch (error) {
            setImportModalError(error instanceof Error ? error.message : 'Failed to load sandbox position.')
        } finally {
            setIsImportingPosition(false)
        }
    }

    const closeImportModal = () => {
        setIsImportModalOpen(false)
        setImportModalError(null)
        setIsWelcomeModalVisible(true)
    }

    const closeShareModal = () => {
        setIsShareModalOpen(false)
        setShareModalError(null)
        setShareUrl(null)
    }

    return (
        <div className="relative h-full w-full overflow-hidden bg-slate-950 text-white">
            {!isImportModalOpen && (
                <GameBoardCanvas
                    canvasRef={canvasRef}
                    className={canvasClassName}
                    handlers={canvasHandlers}
                />
            )}

            <div className="pointer-events-none absolute inset-0">
                <div className="flex h-full flex-col justify-between gap-4">
                    {!isWelcomeModalVisible && !isImportModalOpen && (
                        <SandboxTurnIndicator
                            players={SANDBOX_PLAYERS}
                            gameState={gameState}
                            winnerId={gameState.winner?.playerId ?? null}
                        />
                    )}

                    {!isWelcomeModalVisible && !isImportModalOpen && (
                        <SandboxWinnerBanner
                            players={SANDBOX_PLAYERS}
                            gameState={gameState}
                            winnerId={isWinnerBannerVisible ? gameState.winner?.playerId ?? null : null}
                            onResetBoard={resetSandbox}
                            onExploreBoard={() => setIsWinnerBannerVisible(false)}
                        />
                    )}

                    <SandboxWelcomeModal
                        isOpen={isWelcomeModalVisible}
                        onStartCleanBoard={() => setIsWelcomeModalVisible(false)}
                        onImportPosition={() => {
                            setIsWelcomeModalVisible(false)
                            setIsImportModalOpen(true)
                        }}
                    />

                    <SandboxImportModal
                        isOpen={isImportModalOpen}
                        isLoading={isImportingPosition}
                        errorMessage={importModalError}
                        parsePositionId={extractSandboxPositionId}
                        onClose={closeImportModal}
                        onImport={(positionId) => void importPosition(positionId)}
                        onInputChange={() => setImportModalError(null)}
                    />

                    <SandboxShareModal
                        isOpen={isShareModalOpen}
                        isCreating={isSharingPosition}
                        isCopying={isCopyingShareUrl}
                        shareUrl={shareUrl}
                        initialName={currentPositionName}
                        errorMessage={shareModalError}
                        onClose={closeShareModal}
                        onCreate={(name) => void sharePosition(name)}
                        onCopy={() => void copyShareUrl()}
                    />

                    {!isWelcomeModalVisible && !isImportModalOpen && (
                        <SandboxHud
                            positionName={currentPositionName}
                            isAuthenticated={isAuthenticated}
                            occupiedCellCount={gameState.cells.length}
                            renderableCellCount={renderableCellCount}
                            onResetBoard={resetSandbox}
                            onTakeBack={takeBackMove}
                            onResetView={resetView}
                            canTakeBack={canTakeBack}
                            onSharePosition={() => {
                                setShareModalError(null)
                                setShareUrl(null)
                                setIsShareModalOpen(true)
                            }}
                            canSharePosition={canSharePosition}
                            isSharingPosition={isSharingPosition}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

export default SandboxRoute
