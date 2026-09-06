import { Button, buttonVariants } from '@/components/ui/button';
import type { GameState, LobbyOptions, SessionPlayer } from '@ih3t/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import GameBoardView from './game-screen/GameBoardView';
import { formatMinutesSeconds } from '../utils/duration';
import { getPlayerColor } from '../utils/gameBoard';
import { formatTimeControl } from '../utils/gameTimeControl';
import { useTranslation } from 'react-i18next'

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
    const { t } = useTranslation()
    const currentTurnExpiresInMs = gameState?.currentTurnExpiresInMs ?? null;
    const shouldTick = status === `live` && currentTurnExpiresInMs !== null;
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [countdownAnchor, setCountdownAnchor] = useState(() => ({
        receivedAt: Date.now(),
        remainingMs: currentTurnExpiresInMs,
    }));

    useEffect(() => {
        const receivedAt = Date.now();
        setNowMs(receivedAt);
        setCountdownAnchor({
            receivedAt,
            remainingMs: currentTurnExpiresInMs,
        });

        if (!shouldTick) {
            return;
        }

        const updateCountdown = () => {
            setNowMs(Date.now());
        };

        updateCountdown();
        const intervalId = window.setInterval(updateCountdown, 250);
        return () => window.clearInterval(intervalId);
    }, [
        shouldTick,
        currentTurnExpiresInMs,
        gameState?.currentTurnPlayerId,
        gameState?.placementsRemaining,
        gameState?.turnCount,
    ]);

    if (!gameOptions || !gameState) {
        return null;
    }

    const timeControl = gameOptions.timeControl;
    const currentTurnPlayer = players.find((player) => player.id === gameState.currentTurnPlayerId) ?? null;
    const activeTurnClockMs = status === `live` && countdownAnchor.remainingMs !== null
        ? Math.max(0, countdownAnchor.remainingMs - (nowMs - countdownAnchor.receivedAt))
        : null;

    if (timeControl.mode === `match`) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                {players.slice(0, 2).map((player) => {
                    const isActivePlayer = player.id === gameState.currentTurnPlayerId;
                    const displayedClockMs = isActivePlayer && activeTurnClockMs !== null
                        ? activeTurnClockMs
                        : gameState.playerTimeRemainingMs[player.id] ?? timeControl.mainTimeMs;

                    return (
                        <TimerPill
                            key={player.id}
                            label={player.displayName}
                            value={formatMinutesSeconds(displayedClockMs)}
                            accentColor={getPlayerColor(gameState.playerTiles, player.id)}
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
        const turnClockMs = activeTurnClockMs !== null
            ? activeTurnClockMs
            : timeControl.turnTimeMs;

        return (
            <div className="flex flex-wrap items-center gap-2">
                <TimerPill
                    label={currentTurnPlayer?.displayName ?? `Turn Clock`}
                    value={formatMinutesSeconds(turnClockMs)}
                    accentColor={currentTurnPlayer ? getPlayerColor(gameState.playerTiles, currentTurnPlayer.id) : null}
                    active={status === `live`}
                />

                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
                    {formatTimeControl(timeControl)}
                </span>

                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
                    {t('placementsLeftCount', {
                        defaultValue_one: '{{count}} placement left',
                        defaultValue_other: '{{count}} placements left',
                        count: gameState.placementsRemaining,
                    })}
                </span>
            </div>
        );
    }

    return (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
            {t('unlimited', 'Unlimited')}
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
    const { t } = useTranslation()
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

                        <TileChip label={t('bobestof', 'BO{{bestOf}}', { bestOf: tile.bestOf })} color="slate" />
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

                        <span>{t('gameNumber', 'Game {{number}}', { number: tile.currentGameNumber })}</span>

                        <MultiviewTimerStrip
                            status={tile.status}
                            gameOptions={tile.gameOptions}
                            gameState={tile.gameState}
                            players={tile.players}
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                        onClick={() => onMove(tile.sessionId, -1)}
                        disabled={!tile.canMoveLeft}
                        variant="outline" size="xs"
                    >
                        {t('moveLeft', 'Move Left')}
                    </Button>

                    <Button
                        onClick={() => onMove(tile.sessionId, 1)}
                        disabled={!tile.canMoveRight}
                        variant="outline" size="xs"
                    >
                        {t('moveRight', 'Move Right')}
                    </Button>

                    <Button
                        onClick={() => onRemove(tile.sessionId)}
                        variant="destructive-soft" size="xs"
                    >
                        {t('remove', 'Remove')}
                    </Button>

                    <Link
                        to={`/session/${tile.sessionId}`}
                        className={buttonVariants({ variant: `default`, size: `xxs` })}
                    >
                        {t('openFullView', 'Open Full View')}
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
                                    <Button
                                        onClick={resetView}
                                        variant="outline" size="xs" className="pointer-events-auto"
                                    >
                                        {t('resetView', 'Reset View')}
                                    </Button>
                                </div>

                                {tile.status === `finished` && (
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                                        <div className="pointer-events-auto w-full max-w-[30rem] rounded-[24px] border border-sky-200/16 bg-slate-950/84 p-5 shadow-[0_26px_80px_rgba(8,47,73,0.36)] backdrop-blur-md">
                                            <div className="inline-flex items-center rounded-full border border-sky-200/30 bg-sky-400/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
                                                {t('gameEnded2', 'Game Ended')}
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
                                                        className={buttonVariants({ variant: `info`, size: `xs` })}
                                                    >
                                                        {t('reviewGame', 'Review Game')}
                                                    </Link>
                                                )}

                                                <Link
                                                    to={`/session/${tile.sessionId}`}
                                                    className={buttonVariants({ variant: `outline`, size: `xs` })}
                                                >
                                                    {t('openFullView', 'Open Full View')}
                                                </Link>

                                                <Button
                                                    onClick={resetView}
                                                    variant="outline" size="sm"
                                                >
                                                    {t('resetView', 'Reset View')}
                                                </Button>
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
                                {t('multiviewTile', 'Multiview Tile')}
                            </div>

                            <div className="mt-3 text-lg font-bold text-white">
                                {tile.status === `loading`
                                    ? t('joiningLiveBoard', 'Joining live board')
                                    : tile.status === `unavailable`
                                        ? `Session unavailable`
                                        : tile.status === `error`
                                            ? t('couldNotLoadThisSession2', 'Could not load this session')
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
    const { t } = useTranslation()
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
                        {t('larrBack', '&larr; Back')}
                    </Link>

                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                            {t('multiviewBeta', 'Multiview (Beta)')}
                        </div>

                        <h1 className="truncate text-sm font-bold text-white sm:text-base">
                            {tournamentName}
                        </h1>
                    </div>

                    <div className="hidden items-center gap-2 text-[10px] text-slate-500 lg:flex">
                        <span>{t('livematchcountLiveMatches', '{{liveMatchCount}} live matches', { liveMatchCount })}</span>
                        <span>·</span>
                        <span>{t('desktopOnly', 'Desktop only')}</span>
                    </div>

                    <Button
                        onClick={onRefresh}
                        variant="outline" size="sm"
                    >
                        {t('refresh', 'Refresh')}
                    </Button>
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-4 py-6 sm:px-6">
                <div className="lg:hidden">
                    <div className="rounded-[28px] border border-white/10 bg-slate-950/82 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200/70">
                            {t('desktopBeta', 'Desktop Beta')}
                        </div>

                        <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.06em] text-white">
                            {t('mobileIsUnsupportedCurrently', 'Mobile is unsupported currently')}
                        </h2>
                    </div>
                </div>

                <div className="hidden lg:flex lg:flex-1 lg:flex-col">
                    <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {t('availableLiveMatches', 'Available Live Matches')}
                                </div>

                                <div className="mt-2 text-[12px] text-slate-300">
                                    {t('addOrSwapLiveBoardsIntoTheGridMultiviewIsReadonlyAndCappedAtFourMatches', 'Add or swap live boards into the grid. Multiview is read-only and capped at four matches.')}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{t('length4Selected', '{{length}}/4 selected', { length: tiles.length })}</div>

                                <Button
                                    onClick={() => setIsSelectorCollapsed(currentState => !currentState)}
                                    variant="outline" size="xs"
                                >
                                    {isSelectorCollapsed ? `Show Selector` : `Hide Selector`}
                                </Button>
                            </div>
                        </div>

                        {!isSelectorCollapsed && (
                            <div className="mt-4 flex flex-wrap gap-1.5">
                                {availableMatches.length > 0 ? availableMatches.map((match) => (
                                    <Button
                                        key={match.sessionId}
                                        variant={match.isSelected ? `success-soft` : `info`}
                                        size="xs"
                                        aria-pressed={match.isSelected}
                                        onClick={() => onAddMatch(match.sessionId)}
                                        disabled={match.isDisabled}
                                    >
                                        {match.isSelected ? t('matchlabelAdded', '{{matchLabel}} added', { matchLabel: match.matchLabel }) : t('addMatchlabel', 'Add {{matchLabel}}', { matchLabel: match.matchLabel })}
                                    </Button>
                                )) : (
                                    <div className="rounded-full border border-dashed border-white/10 px-4 py-2 text-[11px] text-slate-500">
                                        {t('noLiveMatchesAreAvailableRightNow', 'No live matches are available right now.')}
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
                                    {t('emptyGrid', 'Empty Grid')}
                                </div>

                                <div className="mt-3 text-2xl font-black uppercase tracking-[0.06em] text-white">
                                    {t('pickLiveMatchesToBegin', 'Pick live matches to begin')}
                                </div>

                                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                                    {t('addAnyLiveTournamentMatchFromTheStripAboveEachTileOpensIntoTheNormalFullSpectatorPageWhenYouWantACloserLook', 'Add any live tournament match from the strip above. Each tile opens into the normal full spectator page when you want a closer look.')}
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
