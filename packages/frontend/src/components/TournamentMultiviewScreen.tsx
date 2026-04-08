import type { GameState, LobbyOptions, SessionPlayer } from '@ih3t/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import GameBoardView from './game-screen/GameBoardView';
import { formatMinutesSeconds } from '../utils/duration';
import { getPlayerTileColor } from '../utils/gameBoard';
import { formatTimeControl } from '../utils/gameTimeControl';

export type TournamentMultiviewAvailableMatch = {
    sessionId: string
    matchLabel: string
    description: string
    isSelected: boolean
    isDisabled: boolean
};

export type TournamentMultiviewTileViewModel = {
    sessionId: string
    matchLabel: string
    leftDisplayName: string
    rightDisplayName: string
    gameOptions: LobbyOptions | null
    bestOf: number
    leftWins: number
    rightWins: number
    currentGameNumber: number
    status: `loading` | `live` | `finished` | `unavailable` | `error`
    statusLabel: string
    statusLine: string
    errorMessage: string | null
    players: SessionPlayer[]
    gameState: GameState | null
    reviewPath: string | null
    finishedTitle: string | null
    finishedMessage: string | null
    canMoveLeft: boolean
    canMoveRight: boolean
};

type TournamentMultiviewScreenProps = {
    tournamentId: string
    tournamentName: string
    liveMatchCount: number
    availableMatches: TournamentMultiviewAvailableMatch[]
    tiles: TournamentMultiviewTileViewModel[]
    onRefresh: () => void
    onAddMatch: (sessionId: string) => void
    onRemoveMatch: (sessionId: string) => void
    onMoveMatch: (sessionId: string, direction: -1 | 1) => void
};

function TileChip({ label, color }: Readonly<{ label: string; color: `sky` | `emerald` | `amber` | `rose` | `slate` }>) {
    const className = color === `sky`
        ? `border-sky-300/30 bg-sky-300/12 text-sky-100`
        : color === `emerald`
            ? `border-emerald-300/30 bg-emerald-300/12 text-emerald-100`
            : color === `amber`
                ? `border-amber-300/30 bg-amber-300/12 text-amber-100`
                : color === `rose`
                    ? `border-rose-300/30 bg-rose-300/12 text-rose-100`
                    : `border-white/10 bg-white/6 text-slate-200`;

    return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${className}`}>
            {label}
        </span>
    );
}

function TimerPill({
    label,
    value,
    accentColor,
    active = false,
}: Readonly<{
    label: string
    value: string
    accentColor?: string | null
    active?: boolean
}>) {
    return (
        <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 ${active
            ? `border-sky-300/24 bg-sky-300/10 text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.08)]`
            : `border-white/10 bg-white/5 text-slate-300`}`}
        >
            <div className="flex items-center gap-2">
                {accentColor && (
                    <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: accentColor }}
                    />
                )}

                <span className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {label}
                </span>
            </div>

            <span className={`shrink-0 text-[12px] font-black tabular-nums leading-none ${active ? `text-sky-100` : `text-white`}`}>
                {value}
            </span>
        </span>
    );
}

function MultiviewTimerStrip({
    status,
    gameOptions,
    gameState,
    players,
}: Readonly<{
    status: TournamentMultiviewTileViewModel[`status`]
    gameOptions: LobbyOptions | null
    gameState: GameState | null
    players: SessionPlayer[]
}>) {
    const shouldTick = status === `live` && gameState?.currentTurnExpiresAt !== null;
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        if (!shouldTick) {
            return;
        }

        const updateCountdown = () => {
            setNowMs(Date.now());
        };

        updateCountdown();
        const intervalId = window.setInterval(updateCountdown, 250);
        return () => window.clearInterval(intervalId);
    }, [shouldTick, gameState?.currentTurnExpiresAt]);

    if (!gameOptions || !gameState) {
        return null;
    }

    const timeControl = gameOptions.timeControl;
    const currentTurnPlayer = players.find((player) => player.id === gameState.currentTurnPlayerId) ?? null;

    if (timeControl.mode === `match`) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                {players.slice(0, 2).map((player) => {
                    const isActivePlayer = player.id === gameState.currentTurnPlayerId;
                    const displayedClockMs = isActivePlayer && status === `live` && gameState.currentTurnExpiresAt !== null
                        ? Math.max(0, gameState.currentTurnExpiresAt - nowMs)
                        : gameState.playerTimeRemainingMs[player.id] ?? timeControl.mainTimeMs;

                    return (
                        <TimerPill
                            key={player.id}
                            label={player.displayName}
                            value={formatMinutesSeconds(displayedClockMs)}
                            accentColor={getPlayerTileColor(gameState.playerTiles, player.id)}
                            active={isActivePlayer && status === `live`}
                        />
                    );
                })}

                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
                    {formatTimeControl(timeControl)}
                </span>
            </div>
        );
    }

    if (timeControl.mode === `turn`) {
        const turnClockMs = status === `live` && gameState.currentTurnExpiresAt !== null
            ? Math.max(0, gameState.currentTurnExpiresAt - nowMs)
            : timeControl.turnTimeMs;

        return (
            <div className="flex flex-wrap items-center gap-2">
                <TimerPill
                    label={currentTurnPlayer?.displayName ?? `Turn Clock`}
                    value={formatMinutesSeconds(turnClockMs)}
                    accentColor={currentTurnPlayer ? getPlayerTileColor(gameState.playerTiles, currentTurnPlayer.id) : null}
                    active={status === `live`}
                />

                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
                    {formatTimeControl(timeControl)}
                </span>

                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
                    {gameState.placementsRemaining}
                    {` `}
                    {gameState.placementsRemaining === 1 ? `placement left` : `placements left`}
                </span>
            </div>
        );
    }

    return (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
            Unlimited
        </span>
    );
}

function TournamentMultiviewTile({
    tile,
    onRemove,
    onMove,
}: Readonly<{
    tile: TournamentMultiviewTileViewModel
    onRemove: (sessionId: string) => void
    onMove: (sessionId: string, direction: -1 | 1) => void
}>) {
    const badgeColor = tile.status === `live`
        ? `sky`
        : tile.status === `finished`
            ? `emerald`
            : tile.status === `loading`
                ? `amber`
                : tile.status === `error`
                    ? `rose`
                    : `slate`;

    const boardGameState = tile.gameState;
    const shouldRenderBoard = boardGameState !== null && (tile.status === `live` || tile.status === `finished`);

    return (
        <article className="flex min-h-[360px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/82 shadow-[0_24px_80px_rgba(2,6,23,0.42)]">
            <div className="flex flex-wrap items-start gap-2.5 border-b border-white/6 px-4 py-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            {tile.matchLabel}
                        </span>

                        <TileChip label={tile.statusLabel} color={badgeColor} />

                        <TileChip label={`BO${tile.bestOf}`} color="slate" />
                    </div>

                    <div className="mt-2.5 text-lg font-black uppercase tracking-[0.06em] text-white">
                        {tile.leftDisplayName}
                        <span className="mx-2 text-slate-500">vs</span>
                        {tile.rightDisplayName}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[11px] text-slate-300">
                        <span className="font-semibold text-white">
                            {tile.leftWins}
                            <span className="mx-1 text-slate-600">-</span>
                            {tile.rightWins}
                        </span>

                        <span className="text-slate-600">|</span>

                        <span>
                            Game
                            {` `}
                            {tile.currentGameNumber}
                        </span>

                        <MultiviewTimerStrip
                            status={tile.status}
                            gameOptions={tile.gameOptions}
                            gameState={tile.gameState}
                            players={tile.players}
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        onClick={() => onMove(tile.sessionId, -1)}
                        disabled={!tile.canMoveLeft}
                        className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        Move Left
                    </button>

                    <button
                        onClick={() => onMove(tile.sessionId, 1)}
                        disabled={!tile.canMoveRight}
                        className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        Move Right
                    </button>

                    <button
                        onClick={() => onRemove(tile.sessionId)}
                        className="rounded-full border border-rose-300/15 bg-rose-300/8 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-300/14"
                    >
                        Remove
                    </button>

                    <Link
                        to={`/session/${tile.sessionId}`}
                        className="rounded-full bg-sky-300 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-200"
                    >
                        Open Full View
                    </Link>
                </div>
            </div>

            <div className="relative flex-1 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),rgba(2,6,23,0)_48%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]">
                {shouldRenderBoard ? (
                    <GameBoardView
                        className="relative h-full min-h-[240px] w-full overflow-hidden"
                        gameState={boardGameState}
                        highlightedCells={boardGameState.winner?.cells ?? `turn`}
                        localPlayerId={null}
                        interactionEnabled={false}
                        viewInteractionEnabled
                    >
                        {({ resetView }) => (
                            <>
                                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-end gap-3 p-3">
                                    <button
                                        onClick={resetView}
                                        className="pointer-events-auto rounded-full border border-white/10 bg-slate-950/78 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-slate-900"
                                    >
                                        Reset View
                                    </button>
                                </div>

                                {tile.status === `finished` && (
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                                        <div className="pointer-events-auto w-full max-w-[30rem] rounded-[24px] border border-sky-200/16 bg-slate-950/84 p-5 shadow-[0_26px_80px_rgba(8,47,73,0.36)] backdrop-blur-md">
                                            <div className="inline-flex items-center rounded-full border border-sky-200/30 bg-sky-400/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
                                                Game Ended
                                            </div>

                                            <div className="mt-3 text-2xl font-black uppercase tracking-[0.06em] text-white">
                                                {tile.finishedTitle ?? `Match Finished`}
                                            </div>

                                            <p className="mt-2 text-sm leading-6 text-slate-200">
                                                {tile.finishedMessage ?? tile.statusLine}
                                            </p>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {tile.reviewPath && (
                                                    <Link
                                                        to={tile.reviewPath}
                                                        className="rounded-full border border-sky-200/22 bg-sky-950/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-sky-950/80"
                                                    >
                                                        Review Game
                                                    </Link>
                                                )}

                                                <Link
                                                    to={`/session/${tile.sessionId}`}
                                                    className="rounded-full border border-white/12 bg-white/7 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/12"
                                                >
                                                    Open Full View
                                                </Link>

                                                <button
                                                    onClick={resetView}
                                                    className="rounded-full border border-white/12 bg-white/7 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/12"
                                                >
                                                    Reset View
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </GameBoardView>
                ) : (
                    <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Multiview Tile
                            </div>

                            <div className="mt-3 text-lg font-bold text-white">
                                {tile.status === `loading`
                                    ? `Joining live board`
                                    : tile.status === `unavailable`
                                        ? `Session unavailable`
                                        : tile.status === `error`
                                            ? `Could not load this session`
                                            : `Board unavailable`}
                            </div>

                            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                                {tile.status === `unavailable` ? `session unavailable` : tile.errorMessage ?? tile.statusLine}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t border-white/6 px-4 py-3 text-[12px] text-slate-300">
                {tile.status === `unavailable` ? `session unavailable` : tile.statusLine}
            </div>
        </article>
    );
}

function TournamentMultiviewScreen({
    tournamentId,
    tournamentName,
    liveMatchCount,
    availableMatches,
    tiles,
    onRefresh,
    onAddMatch,
    onRemoveMatch,
    onMoveMatch,
}: Readonly<TournamentMultiviewScreenProps>) {
    const gridClassName = tiles.length <= 1 ? `grid-cols-1` : `grid-cols-2`;
    const [isSelectorCollapsed, setIsSelectorCollapsed] = useState(true);

    return (
        <div className="flex min-h-dvh flex-col text-white">
            <div className="sticky top-12 z-30 border-b border-white/6 bg-slate-950/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-[1800px] items-center gap-4 px-4 py-3 sm:px-6">
                    <Link
                        to={`/tournaments/${tournamentId}`}
                        className="text-[11px] font-medium text-slate-400 transition hover:text-white"
                    >
                        &larr; Back
                    </Link>

                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                            Multiview (Beta)
                        </div>

                        <h1 className="truncate text-sm font-bold text-white sm:text-base">
                            {tournamentName}
                        </h1>
                    </div>

                    <div className="hidden items-center gap-2 text-[10px] text-slate-500 lg:flex">
                        <span>{liveMatchCount} live matches</span>
                        <span>·</span>
                        <span>Desktop only</span>
                    </div>

                    <button
                        onClick={onRefresh}
                        className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/12 hover:text-white"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-4 py-6 sm:px-6">
                <div className="lg:hidden">
                    <div className="rounded-[28px] border border-white/10 bg-slate-950/82 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200/70">
                            Desktop Beta
                        </div>

                        <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.06em] text-white">
                            Mobile is unsupported currently
                        </h2>
                    </div>
                </div>

                <div className="hidden lg:flex lg:flex-1 lg:flex-col">
                    <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Available Live Matches
                                </div>

                                <div className="mt-2 text-[12px] text-slate-300">
                                    Add or swap live boards into the grid. Multiview is read-only and capped at four matches.
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                    {tiles.length}
                                    /4 selected
                                </div>

                                <button
                                    onClick={() => setIsSelectorCollapsed(currentState => !currentState)}
                                    className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/12 hover:text-white"
                                >
                                    {isSelectorCollapsed ? `Show Selector` : `Hide Selector`}
                                </button>
                            </div>
                        </div>

                        {!isSelectorCollapsed && (
                            <div className="mt-4 flex flex-wrap gap-1.5">
                                {availableMatches.length > 0 ? availableMatches.map((match) => (
                                    <button
                                        key={match.sessionId}
                                        onClick={() => onAddMatch(match.sessionId)}
                                        disabled={match.isDisabled}
                                        className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] transition ${match.isSelected
                                            ? `border-emerald-300/20 bg-emerald-300/10 text-emerald-100`
                                            : match.isDisabled
                                                ? `border-white/8 bg-white/4 text-slate-600`
                                                : `border-sky-300/20 bg-sky-300/10 text-sky-100 hover:bg-sky-300/18`}`}
                                    >
                                        {match.isSelected ? `${match.matchLabel} added` : `Add ${match.matchLabel}`}
                                    </button>
                                )) : (
                                    <div className="rounded-full border border-dashed border-white/10 px-4 py-2 text-[11px] text-slate-500">
                                        No live matches are available right now.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {tiles.length > 0 ? (
                        <div className={`mt-5 grid flex-1 gap-5 ${gridClassName}`}>
                            {tiles.map((tile) => (
                                <TournamentMultiviewTile
                                    key={tile.sessionId}
                                    tile={tile}
                                    onRemove={onRemoveMatch}
                                    onMove={onMoveMatch}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="mt-5 flex flex-1 items-center justify-center rounded-[32px] border border-dashed border-white/8 bg-slate-950/50 px-8 py-16 text-center">
                            <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                    Empty Grid
                                </div>

                                <div className="mt-3 text-2xl font-black uppercase tracking-[0.06em] text-white">
                                    Pick live matches to begin
                                </div>

                                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                                    Add any live tournament match from the strip above. Each tile opens into the normal full spectator page when you want a closer look.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default TournamentMultiviewScreen;
