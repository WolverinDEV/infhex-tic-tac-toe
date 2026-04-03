import {
    applyGameMove,
    cloneGameState,
    createStartedGameState,
    GameRuleError,
    type GameState,
    type HexCoordinate,
    type SandboxGamePosition,
    type SandboxPlayerSlot,
    type SandboxPositionResponse,
    type SessionPlayer,
} from '@ih3t/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';

import GameBoardCanvas from '../components/game-screen/GameBoardCanvas';
import useGameBoard from '../components/game-screen/useGameBoard';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import SandboxBotFactoryModal from '../components/sandbox/SandboxBotFactoryModal';
import SandboxBotPanel from '../components/sandbox/SandboxBotPanel';
import SandboxHud from '../components/sandbox/SandboxHud';
import SandboxImportModal from '../components/sandbox/SandboxImportModal';
import SandboxShareModal from '../components/sandbox/SandboxShareModal';
import SandboxTurnIndicator from '../components/sandbox/SandboxTurnIndicator';
import SandboxWelcomeModal from '../components/sandbox/SandboxWelcomeModal';
import SandboxWinnerBanner from '../components/sandbox/SandboxWinnerBanner';
import { useQueryAccount, useQueryAccountPreferences } from '../query/accountClient';
import { queryKeys } from '../query/queryDefinitions';
import { createSandboxPosition, fetchSandboxPosition, useQuerySandboxPosition } from '../query/sandboxClient';
import { kSandboxBotEngines, SandboxBotEngineInfo } from '../sandbox/botLoader';
import {
    createDefaultSandboxPlayerModes,
    persistSandboxBotTimeoutMs,
    readSandboxBotTimeoutMs,
    sanitizeSandboxBotTimeoutMs,
} from '../sandbox/sandboxBotSettings';
import { useSandboxBotController } from '../sandbox/useSandboxBotController';
import { playTilePlacedSound } from '../soundEffects';
import { formatPlacementSummary, formatSandboxPlayerLabel } from '../utils/routeMetadata';
import type { SandboxRouteState } from './sandboxRouteState';

type SandboxSnapshot = {
    positionName: string | null
    gameState: GameState
    gameHistory: GameState[]
};

const SANDBOX_PLAYERS: SessionPlayer[] = [
    {
        id: `sandbox-player-1`,
        displayName: `Player 1`,
        profileId: null,
        rating: { eloScore: 0, gameCount: 0 },
        ratingAdjustment: null,
        connection: { status: `connected` },
    },
    {
        id: `sandbox-player-2`,
        displayName: `Player 2`,
        profileId: null,
        rating: { eloScore: 0, gameCount: 0 },
        ratingAdjustment: null,
        connection: { status: `connected` },
    },
];

function createSandboxGameState(player?: SandboxPlayerSlot) {
    return createStartedGameState(SANDBOX_PLAYERS.map((player) => player.id), getSandboxPlayerId(player ?? `player-1`));
}

function normalizeSandboxPositionId(value: string | null | undefined) {
    const normalizedValue = value?.trim().toLowerCase() ?? ``;
    return /^[a-z0-9]{7}$/.test(normalizedValue) ? normalizedValue : null;
}

function extractSandboxPositionId(value: string) {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return null;
    }

    try {
        const url = new URL(trimmedValue);
        const pathSegments = url.pathname.split(`/`).filter(Boolean);
        if (pathSegments[0] === `sandbox` && pathSegments[1]) {
            return normalizeSandboxPositionId(pathSegments[1]);
        }
    } catch {
        // Fall back to treating the input as a raw position id.
    }

    return normalizeSandboxPositionId(trimmedValue);
}

function getSandboxPlayerSlot(playerId: string): SandboxPlayerSlot {
    return playerId === SANDBOX_PLAYERS[0].id ? `player-1` : `player-2`;
}

function getSandboxPlayerId(playerSlot: SandboxPlayerSlot): string {
    return playerSlot === `player-1` ? SANDBOX_PLAYERS[0].id : SANDBOX_PLAYERS[1].id;
}

function buildSandboxGamePosition(gameState: GameState): SandboxGamePosition | null {
    if (!gameState.currentTurnPlayerId || gameState.placementsRemaining < 1) {
        return null;
    }

    return {
        cells: gameState.cells.map((cell, index) => ({
            x: cell.x,
            y: cell.y,
            player: getSandboxPlayerSlot(cell.occupiedBy),
            moveId: index + 1,
        })),
        currentTurnPlayer: getSandboxPlayerSlot(gameState.currentTurnPlayerId),
        placementsRemaining: gameState.placementsRemaining,
    };
}

function restoreSandboxPosition(gamePosition: SandboxGamePosition) {
    const orderedCells = [...gamePosition.cells].sort((leftCell, rightCell) => leftCell.moveId - rightCell.moveId);
    const nextGameState = createSandboxGameState(orderedCells[0]?.player);
    const gameHistory: GameState[] = [];

    console.log(orderedCells)

    for (const cell of orderedCells) {
        gameHistory.push(cloneGameState(nextGameState));
        applyGameMove(nextGameState, {
            playerId: getSandboxPlayerId(cell.player),
            x: cell.x,
            y: cell.y,
        });
    }

    const expectedCurrentTurnPlayerId = getSandboxPlayerId(gamePosition.currentTurnPlayer);
    if (
        nextGameState.currentTurnPlayerId !== expectedCurrentTurnPlayerId
        || nextGameState.placementsRemaining !== gamePosition.placementsRemaining
    ) {
        console.log(`${nextGameState.currentTurnPlayerId} - ${expectedCurrentTurnPlayerId} - ${orderedCells[0]?.player}`)
        throw new Error(`Sandbox position is inconsistent.`);
    }

    nextGameState.currentTurnExpiresAt = null;
    nextGameState.playerTimeRemainingMs = {};

    return {
        gameState: nextGameState,
        gameHistory,
    };
}

function getSandboxPositionKey(gameState: GameState) {
    const gamePosition = buildSandboxGamePosition(gameState);
    return gamePosition ? JSON.stringify(gamePosition) : null;
}

function createSandboxSnapshot(gameState: GameState, gameHistory: readonly GameState[], positionName: string | null): SandboxSnapshot {
    return {
        positionName,
        gameState: cloneGameState(gameState),
        gameHistory: gameHistory.map((entry) => cloneGameState(entry)),
    };
}

function SandboxRoute() {
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: account } = useQueryAccount({ enabled: true });
    const { data: accountPreferences } = useQueryAccountPreferences({ enabled: account?.user !== null });

    const { positionId: routePositionId } = useParams<{ positionId?: string }>();
    const [gameState, setGameState] = useState(() => createSandboxGameState());
    const [gameHistory, setGameHistory] = useState<GameState[]>([]);
    const [loadedSnapshot, setLoadedSnapshot] = useState<SandboxSnapshot | null>(null);
    const [isWelcomeModalVisible, setIsWelcomeModalVisible] = useState(() => !routePositionId);
    const [isWinnerBannerVisible, setIsWinnerBannerVisible] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isImportingPosition, setIsImportingPosition] = useState(false);
    const [importModalError, setImportModalError] = useState<string | null>(null);
    const [isSharingPosition, setIsSharingPosition] = useState(false);
    const [shareModalError, setShareModalError] = useState<string | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [isCopyingShareUrl, setIsCopyingShareUrl] = useState(false);
    const [botPlayerModes, setBotPlayerModes] = useState(() => createDefaultSandboxPlayerModes());
    const [botTimeoutMs, setBotTimeoutMs] = useState(() => readSandboxBotTimeoutMs());
    const [selectedBotEngine, setSelectedBotEngine] = useState<SandboxBotEngineInfo | null>(null);
    const [isBotPanelOpen, setIsBotPanelOpen] = useState(false);
    const [isBotFactoryModalOpen, setIsBotFactoryModalOpen] = useState(false);
    const cleanBoardStateRef = useRef(createSandboxGameState());
    const previousCellCountRef = useRef(gameState.cells.length);
    const latestGameStateRef = useRef(gameState);
    const latestGameHistoryRef = useRef(gameHistory);
    const lastLoadedPositionIdRef = useRef<string | null>(null);
    const lastInvalidRoutePositionIdRef = useRef<string | null>(null);
    const lastAppliedLocationKeyRef = useRef<string | null>(null);
    const normalizedRoutePositionId = normalizeSandboxPositionId(routePositionId);
    const routeState = location.state as SandboxRouteState | null;
    const routeInitialPosition = routeState?.initialPosition ?? null;
    const routeBotGame = routeState?.botGame ?? null;

    const initialBoardState = loadedSnapshot?.gameState ?? cleanBoardStateRef.current;
    const initialBoardStateKey = getSandboxPositionKey(initialBoardState);
    const currentBoardStateKey = getSandboxPositionKey(gameState);
    const currentPositionName = loadedSnapshot?.positionName ?? null;
    const isAuthenticated = Boolean(account !== null);
    const currentTurnPlayerSlot = gameState.currentTurnPlayerId
        ? getSandboxPlayerSlot(gameState.currentTurnPlayerId)
        : null;
    const isCurrentTurnBotControlled = currentTurnPlayerSlot
        ? botPlayerModes[currentTurnPlayerSlot] === `bot`
        : false;
    const localPlayerId = gameState.winner === null
        && !isCurrentTurnBotControlled
        ? (gameState.currentTurnPlayerId ?? SANDBOX_PLAYERS[0].id)
        : null;
    const canTakeBack = gameHistory.length > 0;
    const canSharePosition
        = isAuthenticated
        && gameState.winner === null
        && currentBoardStateKey !== null
        && currentBoardStateKey !== initialBoardStateKey;
    const routeSandboxPositionQuery = useQuerySandboxPosition(normalizedRoutePositionId, {
        enabled: Boolean(normalizedRoutePositionId),
    });
    const isRoutePositionLoading
        = Boolean(normalizedRoutePositionId)
        && routeSandboxPositionQuery.isFetching
        && lastLoadedPositionIdRef.current !== normalizedRoutePositionId;
    const botPlayerIds = SANDBOX_PLAYERS
        .filter((player) => botPlayerModes[getSandboxPlayerSlot(player.id)] === `bot`)
        .map((player) => player.id);
    const isSandboxInteractionEnabled
        = !isWelcomeModalVisible
        && !isWinnerBannerVisible
        && !isImportModalOpen
        && !isImportingPosition
        && !isShareModalOpen
        && !isBotFactoryModalOpen
        && !isRoutePositionLoading;
    const isBotPlaybackEnabled
        = !isWelcomeModalVisible
        && !isImportModalOpen
        && !isImportingPosition
        && !isShareModalOpen
        && !isBotFactoryModalOpen
        && !isRoutePositionLoading;

    const sandboxBotController = useSandboxBotController({
        gameState,
        botTurnEnabled: isBotPlaybackEnabled,
        botFactory: selectedBotEngine,
        playerModes: botPlayerModes,
        timeoutMs: botTimeoutMs,
        resolvePlayerSlot: getSandboxPlayerSlot,
        onApplyBotMoves: applyBotMoves,
        onBotError: (message) => {
            toast.error(message, {
                toastId: `sandbox-bot:${message}`,
            });
        },
    });
    const isBotBusy = sandboxBotController.isThinking;

    const {
        canvasRef,
        canvasClassName,
        canvasHandlers,
        renderableCellCount,
        resetView,
    } = useGameBoard({
        gameState: gameState,
        highlightedCells: gameState.winner?.cells ?? `turn`,
        localPlayerId,
        interactionEnabled: isSandboxInteractionEnabled,
        onPlaceCell: gameState.winner === null ? handlePlaceCell : undefined,
        showTilePieceMarkers: accountPreferences?.preferences.tilePieceMarkers ?? false,
    });

    function applyBotMoves(moves: readonly HexCoordinate[]) {
        if (moves.length === 0) {
            return;
        }

        const currentGameState = latestGameStateRef.current;
        const currentGameHistory = latestGameHistoryRef.current;
        const nextGameState = cloneGameState(currentGameState);
        const nextGameHistory = [...currentGameHistory];

        for (const move of moves) {
            const actingPlayerId = nextGameState.currentTurnPlayerId;
            if (!actingPlayerId || nextGameState.winner) {
                break;
            }

            const previousGameState = cloneGameState(nextGameState);

            try {
                applyGameMove(nextGameState, {
                    playerId: actingPlayerId,
                    x: move.x,
                    y: move.y,
                });
            } catch (error) {
                const errorMessage = error instanceof GameRuleError
                    ? error.message
                    : `This move is not legal in sandbox mode.`;
                toast.error(errorMessage, {
                    toastId: `sandbox:${errorMessage}`,
                });
                break;
            }

            nextGameHistory.push(previousGameState);
        }

        if (nextGameHistory.length === currentGameHistory.length) {
            return;
        }

        latestGameStateRef.current = nextGameState;
        latestGameHistoryRef.current = nextGameHistory;
        setGameHistory(nextGameHistory);
        setGameState(nextGameState);
        setIsWinnerBannerVisible(Boolean(nextGameState.winner));
    }

    function applySandboxPosition(
        positionName: string,
        gamePosition: SandboxGamePosition,
        positionId: string | null,
    ) {
        const { gameState: nextGameState, gameHistory: nextGameHistory } = restoreSandboxPosition(gamePosition);
        const nextLoadedSnapshot = createSandboxSnapshot(nextGameState, nextGameHistory, positionName);

        previousCellCountRef.current = nextGameState.cells.length;
        latestGameStateRef.current = nextGameState;
        latestGameHistoryRef.current = nextGameHistory;
        lastLoadedPositionIdRef.current = positionId;
        lastInvalidRoutePositionIdRef.current = null;

        setLoadedSnapshot(nextLoadedSnapshot);
        setGameHistory(nextGameHistory);
        setGameState(nextGameState);
        setIsBotPanelOpen(false);
        setIsBotFactoryModalOpen(false);
        setIsWinnerBannerVisible(false);
        setIsImportModalOpen(false);
        setImportModalError(null);
        setShareModalError(null);
        setIsShareModalOpen(false);
        resetView();
    }

    function applyLoadedSandboxPosition(response: SandboxPositionResponse) {
        applySandboxPosition(response.name, response.gamePosition, response.id);
    }

    function handlePlaceCell(x: number, y: number) {
        const actingPlayerId = gameState.currentTurnPlayerId ?? SANDBOX_PLAYERS[0].id;
        const nextGameState = cloneGameState(gameState);

        try {
            applyGameMove(nextGameState, {
                playerId: actingPlayerId,
                x,
                y,
            });

            const nextGameHistory = [...gameHistory, cloneGameState(gameState)];
            latestGameStateRef.current = nextGameState;
            latestGameHistoryRef.current = nextGameHistory;
            setGameHistory(nextGameHistory);
            setGameState(nextGameState);
            setIsWinnerBannerVisible(Boolean(nextGameState.winner));
        } catch (error) {
            const errorMessage = error instanceof GameRuleError
                ? error.message
                : `This move is not legal in sandbox mode.`;
            toast.error(errorMessage, {
                toastId: `sandbox:${errorMessage}`,
            });
        }
    }

    useEffect(() => {
        const previousCellCount = previousCellCountRef.current;
        if (gameState.cells.length > previousCellCount) {
            playTilePlacedSound();
        }

        previousCellCountRef.current = gameState.cells.length;
    }, [gameState.cells.length]);

    useEffect(() => {
        latestGameStateRef.current = gameState;
        latestGameHistoryRef.current = gameHistory;
    }, [gameHistory, gameState]);

    useEffect(() => {
        persistSandboxBotTimeoutMs(botTimeoutMs);
    }, [botTimeoutMs]);

    useEffect(() => {
        if (!routePositionId) {
            if (!routeInitialPosition) {
                setLoadedSnapshot(null);
            }
            setIsImportingPosition(false);
            lastLoadedPositionIdRef.current = null;
            lastInvalidRoutePositionIdRef.current = null;
            return;
        }

        if (!normalizedRoutePositionId) {
            if (lastInvalidRoutePositionIdRef.current !== routePositionId) {
                lastInvalidRoutePositionIdRef.current = routePositionId;
                toast.error(`Sandbox position id is invalid.`);
            }
            setIsImportingPosition(false);
            void navigate(`/sandbox`, { replace: true });
            return;
        }

        if (lastLoadedPositionIdRef.current === normalizedRoutePositionId) {
            setIsImportingPosition(false);
            setIsWelcomeModalVisible(false);
            return;
        }

        setIsImportingPosition(true);
        setIsWelcomeModalVisible(false);
    }, [
        navigate, normalizedRoutePositionId, routeInitialPosition, routePositionId,
    ]);

    useEffect(() => {
        if (routePositionId || !routeInitialPosition) {
            return;
        }

        if (lastAppliedLocationKeyRef.current === location.key) {
            return;
        }

        lastAppliedLocationKeyRef.current = location.key;
        applySandboxPosition(routeInitialPosition.name, routeInitialPosition.gamePosition, null);
        setIsWelcomeModalVisible(false);
    }, [
        location.key, routeInitialPosition, routePositionId,
    ]);

    useEffect(() => {
        if (routePositionId || routeInitialPosition || !routeBotGame) {
            return;
        }

        if (lastAppliedLocationKeyRef.current === location.key) {
            return;
        }

        lastAppliedLocationKeyRef.current = location.key;
        lastLoadedPositionIdRef.current = null;
        lastInvalidRoutePositionIdRef.current = null;
        setLoadedSnapshot(null);
        setBotPlayerModes({
            'player-1': routeBotGame.botPlayerSlot === `player-1` ? `bot` : `human`,
            'player-2': routeBotGame.botPlayerSlot === `player-2` ? `bot` : `human`,
        });
        setSelectedBotEngine(
            kSandboxBotEngines.find((engine) => engine.name === routeBotGame.engineName)
            ?? kSandboxBotEngines[0]
            ?? null,
        );
        setIsWelcomeModalVisible(false);
        setIsBotPanelOpen(false);
        setIsBotFactoryModalOpen(false);
        setIsWinnerBannerVisible(false);
        setIsImportModalOpen(false);
        setImportModalError(null);
        setShareModalError(null);
        setIsShareModalOpen(false);

        const nextGameState = createSandboxGameState();
        previousCellCountRef.current = nextGameState.cells.length;
        latestGameStateRef.current = nextGameState;
        latestGameHistoryRef.current = [];
        setGameHistory([]);
        setGameState(nextGameState);
        resetView();
    }, [
        location.key, resetView, routeBotGame, routeInitialPosition, routePositionId,
    ]);

    useEffect(() => {
        if (!normalizedRoutePositionId) {
            return;
        }

        if (!routeSandboxPositionQuery.data) {
            return;
        }

        if (lastLoadedPositionIdRef.current === normalizedRoutePositionId) {
            return;
        }

        applyLoadedSandboxPosition(routeSandboxPositionQuery.data);
        setIsImportingPosition(false);
    }, [normalizedRoutePositionId, routeSandboxPositionQuery.data]);

    useEffect(() => {
        if (!normalizedRoutePositionId) {
            return;
        }

        if (!routeSandboxPositionQuery.error) {
            return;
        }

        if (lastLoadedPositionIdRef.current === normalizedRoutePositionId) {
            return;
        }

        toast.error(routeSandboxPositionQuery.error instanceof Error ? routeSandboxPositionQuery.error.message : `Failed to load sandbox position.`);
        lastLoadedPositionIdRef.current = null;
        setIsImportingPosition(false);
        void navigate(`/sandbox`, { replace: true });
    }, [
        navigate, normalizedRoutePositionId, routeSandboxPositionQuery.error,
    ]);

    const resetSandbox = () => {
        const nextGameState = loadedSnapshot
            ? cloneGameState(loadedSnapshot.gameState)
            : createSandboxGameState();
        const nextGameHistory = loadedSnapshot
            ? loadedSnapshot.gameHistory.map((entry) => cloneGameState(entry))
            : [];

        previousCellCountRef.current = nextGameState.cells.length;
        latestGameStateRef.current = nextGameState;
        latestGameHistoryRef.current = nextGameHistory;
        setGameHistory(nextGameHistory);
        setGameState(nextGameState);
        setIsBotPanelOpen(false);
        setIsBotFactoryModalOpen(false);
        setIsWinnerBannerVisible(false);
        setShareUrl(null);
        setShareModalError(null);
        setIsShareModalOpen(false);
    };

    const takeBackMove = () => {
        const previousGameState = gameHistory[gameHistory.length - 1];
        if (!previousGameState) {
            return;
        }

        previousCellCountRef.current = previousGameState.cells.length;
        const nextGameHistory = gameHistory.slice(0, -1);
        const nextGameState = cloneGameState(previousGameState);
        latestGameStateRef.current = nextGameState;
        latestGameHistoryRef.current = nextGameHistory;
        setGameHistory(nextGameHistory);
        setGameState(nextGameState);
        setIsWinnerBannerVisible(false);
        setShareUrl(null);
        setShareModalError(null);
        setIsShareModalOpen(false);
    };

    const sharePosition = async (name: string) => {
        const gamePosition = buildSandboxGamePosition(gameState);
        if (!gamePosition) {
            toast.error(`Only active sandbox positions can be shared.`);
            return;
        }

        setShareModalError(null);
        setIsSharingPosition(true);
        try {
            const response = await createSandboxPosition(name, gamePosition);

            const nextSharedSnapshot = createSandboxSnapshot(gameState, gameHistory, response.name);
            const nextShareUrl = new URL(`/sandbox/${response.id}`, window.location.origin).toString();

            lastLoadedPositionIdRef.current = response.id;
            setLoadedSnapshot(nextSharedSnapshot);
            setIsShareModalOpen(true);
            setShareUrl(nextShareUrl);

            if (routePositionId !== response.id) {
                void navigate(`/sandbox/${response.id}`, { replace: true });
            }
        } catch (error) {
            setShareModalError(error instanceof Error ? error.message : `Failed to share sandbox position.`);
        } finally {
            setIsSharingPosition(false);
        }
    };

    const copyShareUrl = async () => {
        if (!shareUrl) {
            return;
        }

        if (!navigator.clipboard?.writeText) {
            toast.error(`Clipboard access is not available in this browser.`);
            return;
        }

        setIsCopyingShareUrl(true);
        try {
            await navigator.clipboard.writeText(shareUrl);
            toast.success(`Sandbox position link copied to clipboard.`);
        } catch {
            toast.error(`Failed to copy sandbox position link.`);
        } finally {
            setIsCopyingShareUrl(false);
        }
    };

    const importPosition = async (positionId: string) => {
        setImportModalError(null);
        setIsImportingPosition(true);

        try {
            const response = await queryClient.fetchQuery({
                queryKey: queryKeys.sandboxPosition(positionId),
                queryFn: () => fetchSandboxPosition(positionId),
                staleTime: 60 * 60 * 1000,
            });
            applyLoadedSandboxPosition(response);
            setIsWelcomeModalVisible(false);

            if (routePositionId !== response.id) {
                void navigate(`/sandbox/${response.id}`);
            }
        } catch (error) {
            setImportModalError(error instanceof Error ? error.message : `Failed to load sandbox position.`);
        } finally {
            setIsImportingPosition(false);
        }
    };

    const closeImportModal = () => {
        setIsImportModalOpen(false);
        setImportModalError(null);
        setIsWelcomeModalVisible(true);
    };

    const closeShareModal = () => {
        setIsShareModalOpen(false);
        setShareModalError(null);
        setShareUrl(null);
    };

    const handleSelectBotEngine = (engine: SandboxBotEngineInfo | null) => {
        setSelectedBotEngine(engine);
        if (engine === null) {
            setBotPlayerModes(createDefaultSandboxPlayerModes());
        }
        setIsBotFactoryModalOpen(false);
        setIsBotPanelOpen(true);
    };

    const handleBotPlayerModeChange = (playerSlot: SandboxPlayerSlot, nextMode: `human` | `bot`) => {
        setBotPlayerModes((currentModes) => ({
            ...currentModes,
            [playerSlot]: nextMode,
        }));
        setIsBotPanelOpen(true);
    };

    const handleBotTimeoutMsChange = (nextTimeoutMs: number) => {
        setBotTimeoutMs(sanitizeSandboxBotTimeoutMs(nextTimeoutMs));
    };

    return (
        <>
            <PageMetadata
                {...(routeSandboxPositionQuery.data
                    ? {
                        title: `${routeSandboxPositionQuery.data.name} • Sandbox Mode • ${DEFAULT_PAGE_TITLE}`,
                        description: `Open the "${routeSandboxPositionQuery.data.name}" sandbox position with ${routeSandboxPositionQuery.data.gamePosition.cells.length} placed ${routeSandboxPositionQuery.data.gamePosition.cells.length === 1 ? `cell` : `cells`}. ${formatSandboxPlayerLabel(routeSandboxPositionQuery.data.gamePosition.currentTurnPlayer)} to move with ${formatPlacementSummary(routeSandboxPositionQuery.data.gamePosition.placementsRemaining)}.`,
                        ogType: `article` as const,
                    }
                    : normalizedRoutePositionId && routeSandboxPositionQuery.error
                        ? {
                            title: `Sandbox Position Not Found • ${DEFAULT_PAGE_TITLE}`,
                            description: `The requested sandbox position could not be found. Open sandbox mode to start from a clean board or import another shared position.`,
                            ogType: `article` as const,
                            robots: `noindex, nofollow` as const,
                        }
                        : {
                            title: `Sandbox Mode • ${DEFAULT_PAGE_TITLE}`,
                            description: `Play Infinity Hexagonal Tic-Tac-Toe locally with no clock, control both sides, import shared positions, and explore custom boards.`,
                        })}
            />

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
                                players={SANDBOX_PLAYERS.map(player => ({
                                    ...player,
                                    displayName: botPlayerIds.includes(player.id) ? `Bot as ${player.displayName}` : player.displayName,
                                }))}
                                botPlayerIds={botPlayerIds}
                                gameState={gameState}
                                winnerId={gameState.winner?.playerId ?? null}
                                isBotThinking={isBotBusy}
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
                                setIsWelcomeModalVisible(false);
                                setIsImportModalOpen(true);
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
                            <SandboxBotFactoryModal
                                isOpen={isBotFactoryModalOpen}
                                onClose={() => setIsBotFactoryModalOpen(false)}

                                availableEngines={kSandboxBotEngines}
                                selectedEngine={selectedBotEngine?.name ?? null}

                                onSelectBotFactory={handleSelectBotEngine}
                            />
                        )}

                        {!isWelcomeModalVisible && !isImportModalOpen && (
                            <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
                                <SandboxBotPanel
                                    isOpen={isBotPanelOpen}
                                    onOpen={() => setIsBotPanelOpen(true)}
                                    onClose={() => setIsBotPanelOpen(false)}

                                    selectedFactory={selectedBotEngine ?? null}

                                    botDisplayName={sandboxBotController.botDisplayName}
                                    botCapabilities={sandboxBotController.botCapabilities}
                                    botAvailabilityMessage={sandboxBotController.botAvailabilityMessage}
                                    botErrorMessage={sandboxBotController.lastErrorMessage}

                                    botPlayerModes={botPlayerModes}
                                    currentTurnPlayerSlot={currentTurnPlayerSlot}
                                    botTimeoutMs={botTimeoutMs}
                                    isBotThinking={isBotBusy}
                                    isCurrentTurnBotControlled={isCurrentTurnBotControlled}
                                    onChangeBotEngine={() => setIsBotFactoryModalOpen(true)}
                                    onBotPlayerModeChange={handleBotPlayerModeChange}
                                    onBotTimeoutMsChange={handleBotTimeoutMsChange}
                                />

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
                                        setShareModalError(null);
                                        setShareUrl(null);
                                        setIsShareModalOpen(true);
                                    }}
                                    canSharePosition={canSharePosition}
                                    isSharingPosition={isSharingPosition}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default SandboxRoute;
