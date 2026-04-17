import {
    applyGameMove,
    type BoardState,
    type CellOccupant,
    createEmptyGameState,
    createStartedGameState,
    type FinishedGameRecord,
    type SandboxGamePosition,
} from '@ih3t/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { SandboxRouteInitialPosition, SandboxRouteState } from '../../routes/sandboxRouteState';
import { formatDateTimeWithSeconds, useIntlFormatProvider } from '../../utils/dateTime';
import { formatMinutesSeconds } from '../../utils/duration';
import { formatEloChange } from '../../utils/elo';
import { getPlayerLabel, getPlayerTileColor } from '../../utils/gameBoard';
import { formatTimeControl } from '../../utils/gameTimeControl';
import { getSessionFinishReasonSentenceLabel } from '../../utils/sessionResult';
import GameBoardCanvas from '../game-screen/GameBoardCanvas';
import useGameBoard from '../game-screen/useGameBoard';
import FinishedGameReviewLayout from './FinishedGameReviewLayout';

type FinishedGameReplayViewProps = {
    game: FinishedGameRecord
    showTilePieceMarkers: boolean
    onRetry: () => void
};

function isEditableEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return target.isContentEditable
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;
}

function ResetViewIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
            <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16.5 4.5v3.7h-3.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function StartIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M4 5.2h1.8v9.6H4zM8 10l8-4.8v9.6z" />
        </svg>
    );
}

function PreviousIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M5 5.2h1.8v9.6H5zM15.2 5.2V14.8L8.4 10z" />
        </svg>
    );
}

function PlayIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M6.2 4.8 15 10l-8.8 5.2z" />
        </svg>
    );
}

function PauseIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M5.5 4.8h3.2v10.4H5.5zM11.3 4.8h3.2v10.4h-3.2z" />
        </svg>
    );
}

function NextIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M13.2 5.2H15v9.6h-1.8zM4.8 5.2 11.6 10l-6.8 4.8z" />
        </svg>
    );
}

function EndIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M14.2 5.2H16v9.6h-1.8zM4 5.2 12 10l-8 4.8z" />
        </svg>
    );
}

function resolveReplayStartingPlayerId(game: FinishedGameRecord): string | null {
    const recordedFirstMovePlayerId = game.moves[0]?.playerId ?? null;
    if (recordedFirstMovePlayerId) {
        return recordedFirstMovePlayerId;
    }

    const hostPlayerId = game.players[0]?.playerId ?? null;
    const guestPlayerId = game.players[1]?.playerId ?? null;

    switch (game.gameOptions.firstPlayer) {
        case `host`:
            return hostPlayerId;
        case `guest`:
            return guestPlayerId ?? hostPlayerId;
        case `random`:
            return hostPlayerId;
    }
}

function buildReplayBoardState(game: FinishedGameRecord, visibleMoveCount: number): BoardState {
    const playerIds = game.players.map((player) => player.playerId);
    if (playerIds.length === 0) {
        return {
            ...createEmptyGameState(),
            playerTiles: game.playerTiles,
        };
    }

    const replayGameState = createStartedGameState(playerIds, resolveReplayStartingPlayerId(game));
    replayGameState.playerTiles = game.playerTiles;
    for (const move of game.moves.slice(0, visibleMoveCount)) {
        applyGameMove(replayGameState, {
            playerId: move.playerId as CellOccupant,
            x: move.x,
            y: move.y,
        });

        if (replayGameState.winner) {
            replayGameState.currentTurnPlayerId = null;
            replayGameState.placementsRemaining = 0;
            replayGameState.currentTurnExpiresInMs = null;
        }
    }

    return replayGameState;
}

function buildReplaySandboxPosition(game: FinishedGameRecord, visibleMoveCount: number): SandboxRouteInitialPosition | null {
    if (game.players.length < 2) {
        return null;
    }

    const visibleMoves = game.moves.slice(0, visibleMoveCount);
    const replayGameState = createStartedGameState(
        game.players.map((player) => player.playerId),
        resolveReplayStartingPlayerId(game),
    );

    for (const move of visibleMoves) {
        applyGameMove(replayGameState, move);
    }

    const placementsRemaining = Math.max(1, replayGameState.placementsRemaining);
    const gamePosition: SandboxGamePosition = {
        cells: visibleMoves.map((move, index) => ({
            x: move.x,
            y: move.y,
            player: move.playerId === game.players[0].playerId ? `player-1` : `player-2`,
            moveId: index + 1,
        })),
        currentTurnPlayer: replayGameState.currentTurnPlayerId === game.players[0].playerId ? `player-1` : `player-2`,
        placementsRemaining,
    };

    const moveLabel = visibleMoveCount === 0
        ? `Opening Position`
        : `Replay Move ${visibleMoveCount}/${game.moves.length}`;

    return {
        name: `${game.players[0].displayName} vs ${game.players[1].displayName} - ${moveLabel}`,
        gamePosition,
    };
}

function getProfileHref(profileId: string | null | undefined): string | null {
    const normalizedProfileId = profileId?.trim();
    return normalizedProfileId ? `/profile/${encodeURIComponent(normalizedProfileId)}` : null;
}

function FinishedGameReplayView({
    game,
    showTilePieceMarkers,
    onRetry,
}: Readonly<FinishedGameReplayViewProps>) {
    const intlFormatProvider = useIntlFormatProvider();
    const navigate = useNavigate();
    const [visibleMoveCount, setVisibleMoveCount] = useState(game.moves.length);
    const [isAutoPlaying, setIsAutoPlaying] = useState(false);
    const totalMoveCount = game.moves.length;

    useEffect(() => {
        setVisibleMoveCount(totalMoveCount);
        setIsAutoPlaying(false);
    }, [game, totalMoveCount]);

    const goToStart = () => {
        setIsAutoPlaying(false);
        setVisibleMoveCount(0);
    };

    const goToPreviousMove = () => {
        setIsAutoPlaying(false);
        setVisibleMoveCount((currentCount) => Math.max(0, currentCount - 1));
    };

    const goToNextMove = () => {
        setIsAutoPlaying(false);
        setVisibleMoveCount((currentCount) => Math.min(totalMoveCount, currentCount + 1));
    };

    const goToEnd = () => {
        setIsAutoPlaying(false);
        setVisibleMoveCount(totalMoveCount);
    };

    useEffect(() => {
        if (!isAutoPlaying) {
            return;
        }

        if (visibleMoveCount >= totalMoveCount) {
            setIsAutoPlaying(false);
            return;
        }

        const timeout = window.setTimeout(() => {
            setVisibleMoveCount((currentCount) => Math.min(totalMoveCount, currentCount + 1));
        }, 700);

        return () => window.clearTimeout(timeout);
    }, [
        isAutoPlaying, totalMoveCount, visibleMoveCount,
    ]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }

            if (isEditableEventTarget(event.target)) {
                return;
            }

            if (event.key === `ArrowLeft`) {
                event.preventDefault();
                setIsAutoPlaying(false);
                setVisibleMoveCount((currentCount) => Math.max(0, currentCount - 1));
            } else if (event.key === `ArrowRight`) {
                event.preventDefault();
                setIsAutoPlaying(false);
                setVisibleMoveCount((currentCount) => Math.min(totalMoveCount, currentCount + 1));
            }
        };

        document.addEventListener(`keydown`, handleKeyDown);
        return () => document.removeEventListener(`keydown`, handleKeyDown);
    }, [totalMoveCount]);

    const boardState = useMemo(
        () => buildReplayBoardState(game, visibleMoveCount),
        [game, visibleMoveCount],
    );

    const activeMove = visibleMoveCount > 0
        ? game.moves[visibleMoveCount - 1]
        : null;
    const replaySandboxPosition = useMemo(
        () => buildReplaySandboxPosition(game, visibleMoveCount),
        [game, visibleMoveCount],
    );
    const gameResult = game.gameResult ?? null;
    const isDraw = gameResult?.reason === `draw-agreement`;
    const highlightedCells = useMemo(
        () => activeMove ? [{ x: activeMove.x, y: activeMove.y }] : [],
        [activeMove],
    );

    const {
        canvasRef,
        canvasClassName,
        canvasHandlers,
        renderableCellCount,
        resetView,
    } = useGameBoard({
        gameState: boardState,
        highlightedCells: boardState.winner?.cells ?? highlightedCells,
        localPlayerId: null,
        interactionEnabled: true,
        showTilePieceMarkers,
    });

    const startPlayback = () => {
        if (visibleMoveCount >= totalMoveCount) {
            setVisibleMoveCount(0);
        }

        setIsAutoPlaying(true);
    };

    return (
        <FinishedGameReviewLayout onRetry={onRetry}>
            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_24rem]">
                <section className="min-h-[75dvh] flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/75 shadow-[0_20px_80px_rgba(15,23,42,0.45)] sm:rounded-4xl xl:min-h-136">
                    <div className="relative h-full min-h-0 overflow-hidden bg-slate-950 sm:max-h-none xl:min-h-0 xl:flex-1 xl:h-auto">
                        <GameBoardCanvas
                            canvasRef={canvasRef}
                            className={canvasClassName}
                            handlers={canvasHandlers}
                        />

                        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2 p-2.5 sm:gap-3 sm:p-4">
                            <div className="pointer-events-auto flex items-start justify-between gap-2">
                                <div className="rounded-full border border-white/10 bg-slate-950/72 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]">
                                    {`Move `}
                                    {visibleMoveCount}
                                    /
                                    {game.moves.length}
                                </div>

                                <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                        onClick={() => {
                                            if (!replaySandboxPosition) {
                                                return;
                                            }

                                            void navigate(`/sandbox`, {
                                                state: {
                                                    initialPosition: replaySandboxPosition,
                                                } satisfies SandboxRouteState,
                                            });
                                        }}
                                        aria-label="Explore this position in sandbox mode"
                                        className="inline-flex items-center justify-center rounded-full border border-white/15 bg-slate-950/75 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-slate-900 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
                                    >
                                        Explore In Sandbox
                                    </button>

                                    <button
                                        onClick={resetView}
                                        aria-label="Reset board view"
                                        className="inline-flex items-center justify-center rounded-full border border-white/15 bg-slate-950/75 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-slate-900 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
                                    >
                                        <span className="sm:hidden">
                                            <ResetViewIcon />
                                        </span>

                                        <span className="hidden sm:inline">
                                            Reset View
                                        </span>
                                    </button>

                                    <div className="hidden rounded-full border border-white/15 bg-slate-950/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 sm:block">
                                        {`Cells `}
                                        {renderableCellCount}
                                    </div>
                                </div>
                            </div>

                            <div className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-950/78 p-2.5 backdrop-blur sm:rounded-[1.75rem] sm:p-4">
                                <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 sm:text-xs sm:tracking-[0.24em]">
                                            Current Step
                                        </div>

                                        <div className="mt-1 wrap-break-word text-sm font-bold text-white sm:text-2xl">
                                            {activeMove
                                                ? `${getPlayerLabel(game.players, activeMove.playerId)} at (${activeMove.x}, ${activeMove.y})`
                                                : `Board setup`}
                                        </div>

                                        <div className="mt-1 wrap-break-word text-xs text-slate-300 sm:text-sm">
                                            {activeMove
                                                ? `${formatDateTimeWithSeconds(intlFormatProvider, activeMove.timestamp)} • +${formatMinutesSeconds(activeMove.timestamp - game.startedAt)}`
                                                : `Started ${formatDateTimeWithSeconds(intlFormatProvider, game.startedAt)}`}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
                                        <button
                                            onClick={goToStart}
                                            aria-label="Go to start"
                                            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/14 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
                                        >
                                            <span className="sm:hidden">
                                                <StartIcon />
                                            </span>

                                            <span className="hidden sm:inline">
                                                Start
                                            </span>
                                        </button>

                                        <button
                                            onClick={goToPreviousMove}
                                            disabled={visibleMoveCount === 0}
                                            aria-label="Previous move"
                                            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
                                        >
                                            <span className="sm:hidden">
                                                <PreviousIcon />
                                            </span>

                                            <span className="hidden sm:inline">
                                                Prev
                                            </span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                if (isAutoPlaying) {
                                                    setIsAutoPlaying(false);
                                                    return;
                                                }

                                                startPlayback();
                                            }}
                                            aria-label={isAutoPlaying ? `Pause playback` : `Play replay`}
                                            className="inline-flex items-center justify-center rounded-full bg-sky-400 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-950 transition hover:bg-sky-300 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
                                        >
                                            <span className="sm:hidden">
                                                {isAutoPlaying ? <PauseIcon /> : <PlayIcon />}
                                            </span>

                                            <span className="hidden sm:inline">
                                                {isAutoPlaying ? `Pause` : `Play`}
                                            </span>
                                        </button>

                                        <button
                                            onClick={goToNextMove}
                                            disabled={visibleMoveCount >= totalMoveCount}
                                            aria-label="Next move"
                                            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
                                        >
                                            <span className="sm:hidden">
                                                <NextIcon />
                                            </span>

                                            <span className="hidden sm:inline">
                                                Next
                                            </span>
                                        </button>

                                        <button
                                            onClick={goToEnd}
                                            aria-label="Go to end"
                                            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/14 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
                                        >
                                            <span className="sm:hidden">
                                                <EndIcon />
                                            </span>

                                            <span className="hidden sm:inline">
                                                End
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <aside className="flex min-w-0 flex-col gap-4 xl:min-h-136 xl:overflow-hidden">
                    <section className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-4xl sm:p-5">
                        <div className={`text-sm uppercase tracking-[0.3em] text-slate-300 `}>
                            Match Summary
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                    Finished
                                </div>

                                <div className="mt-1 text-sm text-white">
                                    {formatDateTimeWithSeconds(intlFormatProvider, game.finishedAt ?? game.startedAt)}
                                </div>

                                <div className="mt-1 text-sm text-white">
                                    {`Duration `}
                                    {formatMinutesSeconds(gameResult?.durationMs ?? 0)}
                                </div>
                            </div>

                            <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                    Game Type
                                </div>

                                <div className="mt-1 text-sm text-white">
                                    {game.gameOptions.rated ? `Rated` : `Casual`}
                                </div>
                            </div>

                            <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                    Time Control
                                </div>

                                <div className="mt-1 text-sm text-white">
                                    {formatTimeControl(game.gameOptions.timeControl)}
                                </div>
                            </div>

                            <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                    Finish Reason
                                </div>

                                <div className="mt-1 text-sm text-white">
                                    {getSessionFinishReasonSentenceLabel(gameResult?.reason)}
                                </div>
                            </div>

                            <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                    Players
                                </div>

                                <div className="mt-1.5 space-y-0.5">
                                    {game.players.map((player) => {
                                        const playerProfileHref = getProfileHref(player.profileId);

                                        return (
                                            <div
                                                key={player.playerId}
                                                className="flex flex-col items-start gap-2 py-1 text-sm text-white sm:flex-row sm:items-center sm:justify-between"
                                            >
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    <span
                                                        className="h-2.5 w-2.5 rounded-full"
                                                        style={{ backgroundColor: getPlayerTileColor(game.playerTiles, player.playerId) }}
                                                    />

                                                    {playerProfileHref
                                                        ? (
                                                            <Link
                                                                to={playerProfileHref}
                                                                className="wrap-break-word transition hover:text-sky-100"
                                                            >
                                                                {getPlayerLabel(game.players, player.playerId)}
                                                            </Link>
                                                        )
                                                        : (
                                                            <span className="wrap-break-word">
                                                                {getPlayerLabel(game.players, player.playerId)}
                                                            </span>
                                                        )}

                                                    {gameResult?.winningPlayerId === player.playerId && (
                                                        <span className="rounded-full border border-amber-200/30 bg-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-black">
                                                            Winner
                                                        </span>
                                                    )}

                                                    {isDraw && (
                                                        <span className="rounded-full border border-sky-200/30 bg-sky-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-950">
                                                            Draw
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="w-full text-left sm:w-auto sm:text-right">
                                                    {player.elo !== null && (
                                                        <div className="text-sm font-medium text-white">
                                                            {player.elo}
                                                            {` `}
                                                            ELO
                                                        </div>
                                                    )}

                                                    {player.eloChange !== null && (
                                                        <div className={`text-xs ${player.eloChange >= 0 ? `text-emerald-300` : `text-rose-300`}`}>
                                                            {formatEloChange(player.eloChange)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="flex min-h-72 min-w-0 flex-1 flex-col rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:min-h-88 sm:rounded-4xl sm:p-5 xl:min-h-[10em] xl:overflow-hidden">
                        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="text-sm uppercase tracking-[0.3em] text-slate-300">
                                Move Timeline
                            </div>

                            <div className="text-sm text-slate-400">
                                {game.moves.length}
                                {` `}
                                logged moves
                            </div>
                        </div>

                        <div className="mt-4 min-h-0 flex-1 space-y-3 xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
                            <button
                                onClick={goToStart}
                                className={`w-full min-w-0 overflow-hidden rounded-3xl border p-4 text-left transition ${visibleMoveCount === 0
                                    ? `border-sky-300/30 bg-sky-400/12`
                                    : `border-white/10 bg-white/6 hover:bg-white/10`}`
                                }
                            >
                                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                                    Move 0
                                </div>

                                <div className="mt-1 text-base font-semibold text-white sm:text-lg">
                                    Initial board
                                </div>

                                <div className="mt-1 text-sm text-slate-300">
                                    Before the first placement.
                                </div>
                            </button>

                            {game.moves.map((move, index) => {
                                const isActive = visibleMoveCount === index + 1;

                                return (
                                    <button
                                        key={`${move.moveNumber}-${move.timestamp}`}
                                        onClick={() => {
                                            setIsAutoPlaying(false);
                                            setVisibleMoveCount(index + 1);
                                        }}
                                        className={`w-full min-w-0 overflow-hidden rounded-3xl border p-4 text-left transition ${isActive
                                            ? `border-sky-300/30 bg-sky-400/12`
                                            : `border-white/10 bg-white/6 hover:bg-white/10`}`
                                        }
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                                                {`Move `}
                                                {move.moveNumber}
                                            </div>

                                            <span
                                                className="h-3 w-3 rounded-full"
                                                style={{ backgroundColor: getPlayerTileColor(game.playerTiles, move.playerId) }}
                                            />
                                        </div>

                                        <div className="mt-2 wrap-break-word text-base font-semibold text-white sm:text-lg">
                                            {getPlayerLabel(game.players, move.playerId)}
                                            {` `}
                                            placed at (
                                            {move.x}
                                            ,
                                            {move.y}
                                            )
                                        </div>

                                        <div className="mt-1 wrap-break-word text-sm text-slate-300">
                                            {formatDateTimeWithSeconds(intlFormatProvider, move.timestamp)}
                                            {` `}
                                            • +
                                            {formatMinutesSeconds(move.timestamp - game.startedAt)}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </aside>
            </div>
        </FinishedGameReviewLayout>
    );
}

export default FinishedGameReplayView;
