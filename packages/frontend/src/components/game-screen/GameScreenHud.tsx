import { Button } from '@/components/ui/button';
import type { LobbyOptions, PlayerRatingAdjustment, SessionTournamentInfo, ShutdownState } from '@ih3t/shared';
import { DRAW_REQUEST_MIN_TURNS } from '@ih3t/shared';
import { useState } from 'react';
import React from 'react';
import { NavLink } from 'react-router';
import { toast } from 'react-toastify';

import { formatTimeControl } from '../../utils/gameTimeControl';
import GameHudShell from './GameHudShell';
import HudInfoBlock from './HudInfoBlock';
import { ShutdownTimer } from './ShutdownTimer';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'

export type HudPlayerInfo = {
    playerId: string,
    profileId: string | null,

    displayColor: string,
    displayName: string,

    isConnected: boolean,

    rankingEloScore: number,
};

type GameScreenHudProps = {
    sessionId: string
    localPlayerId: string | null
    players: HudPlayerInfo[]
    hideEloInHud?: boolean
    showConnectionUnstableBadge?: boolean
    tournament: SessionTournamentInfo | null

    rankingAdjustment: PlayerRatingAdjustment | null,

    occupiedCellCount: number
    renderableCellCount: number
    turnCount: number
    drawRequestByPlayerId: string | null
    drawRequestAvailableAfterTurn: number

    gameOptions: LobbyOptions

    shutdown: ShutdownState | null

    onRequestDraw?: () => void
    onAcceptDraw?: () => void
    onDeclineDraw?: () => void
    leaveLabel?: string
    onLeave: () => void
    onResetView: () => void
};

function MenuIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 8h14" />
            <path d="M5 12h14" />
            <path d="M5 16h14" />
        </svg>
    );
}

function OfflineIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8.5a16 16 0 0 1 20 0" />
            <path d="M5 12.5a11.5 11.5 0 0 1 14 0" />
            <path d="M8.5 16a6.5 6.5 0 0 1 7 0" />
            <path d="M12 19.5h.01" />
            <path d="M3 3 21 21" />
        </svg>
    );
}

function showDrawUnavailableToast(remainingTurns: number) {
    const message = i18next.t('aDrawCanBeRequestedInCountMoreCompletedTurns', { defaultValue_one: 'A draw can be requested in 1 more completed turn.', defaultValue_other: 'A draw can be requested in {{count}} more completed turns.', count: remainingTurns });

    toast.error(message, {
        toastId: `draw-unavailable:${remainingTurns}`,
    });
}

function isMobilePointer() {
    if (typeof window === `undefined` || typeof window.matchMedia !== `function`) {
        return false;
    }

    return window.matchMedia(`(hover: none), (pointer: coarse)`).matches;
}

function GameScreenHud({
    sessionId,

    players,
    localPlayerId,
    hideEloInHud = false,
    showConnectionUnstableBadge = false,
    tournament,

    rankingAdjustment,

    occupiedCellCount,
    turnCount,
    drawRequestByPlayerId,
    drawRequestAvailableAfterTurn,

    shutdown,
    gameOptions,

    onRequestDraw,
    onAcceptDraw,
    onDeclineDraw,
    leaveLabel = `Leave Game`,
    onLeave,
    onResetView,
}: Readonly<GameScreenHudProps>) {
    const { t } = useTranslation()
    const isSpectator = !players.some(player => player.playerId === localPlayerId);
    /* Do not show the HUD by default on mobile devices */
    const [isHudOpen, setIsHudOpen] = useState(window.innerWidth >= 900);
    const opponent = players.find(player => player.playerId !== localPlayerId) ?? null;
    const requestedByLocalPlayer = Boolean(localPlayerId) && drawRequestByPlayerId === localPlayerId;
    const requestedByOpponent = Boolean(opponent) && drawRequestByPlayerId === opponent?.playerId;
    const turnsUntilDrawRequest = Math.max(0, drawRequestAvailableAfterTurn - turnCount);

    let hideSurrenderButton = false;
    let drawActionArea: React.ReactNode = null;

    if (!isSpectator && localPlayerId && !tournament) {
        if (requestedByLocalPlayer) {
            drawActionArea = (
                <Button
                    disabled
                    variant="outline" size="sm" className="min-w-36"
                >
                    {t('waitingForReply', 'Waiting For Reply')}
                </Button>
            );
        } else if (requestedByOpponent) {
            hideSurrenderButton = true;
            drawActionArea = (
                <React.Fragment>
                    <Button
                        onClick={onDeclineDraw}
                        variant="warning" size="sm" className="min-w-36"
                    >
                        {t('declineDraw', 'Decline Draw')}
                    </Button>

                    <Button
                        onClick={onAcceptDraw}
                        variant="success" size="sm" className="min-w-36"
                    >
                        {t('acceptDraw', 'Accept Draw')}
                    </Button>
                </React.Fragment>
            );
        } else if (turnsUntilDrawRequest > 0) {
            const drawHint = drawRequestAvailableAfterTurn === DRAW_REQUEST_MIN_TURNS
                ? t('aDrawCanBeOfferedOnceDraw_request_min_turnsCompletedTurnsHaveBeenPlayed', 'A draw can be offered once {{DRAW_REQUEST_MIN_TURNS}} completed turns have been played.', { DRAW_REQUEST_MIN_TURNS })
                : t('aNewDrawRequestCanBeMadeAfterTurnsuntildrawrequestMoreCompletedTurns', 'A new draw request can be made after {{turnsUntilDrawRequest}} more completed turns.', { turnsUntilDrawRequest });

            drawActionArea = (
                <Tooltip>
                    <TooltipTrigger render={(
                        <Button
                            onClick={() => {
                                if (isMobilePointer()) {
                                    showDrawUnavailableToast(turnsUntilDrawRequest);
                                }
                            }}
                            variant="outline" size="sm" className="w-full"
                        >
                            {t('draw', 'Draw')}
                        </Button>
                    )} />
                    <TooltipContent>
                        {drawHint}
                    </TooltipContent>
                </Tooltip>
            );
        } else {
            drawActionArea = (
                <Button
                    onClick={onRequestDraw}
                    variant="outline" size="sm" className="min-w-36"
                >
                    {t('draw', 'Draw')}
                </Button>
            );
        }
    }

    return (
        <React.Fragment>
            {showConnectionUnstableBadge && (
                <div className="pointer-events-none absolute right-3 top-3 z-30">
                    <div className="rounded-full border border-amber-300/40 bg-amber-200/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-lg backdrop-blur-md">
                        {t('connectionUnstable', 'Connection unstable')}
                    </div>
                </div>
            )}

            <GameHudShell
                role="left"
                isOpen={isHudOpen}
                onOpen={() => setIsHudOpen(true)}
                onClose={() => setIsHudOpen(false)}
                openTitle="Open HUD"
                openIcon={<MenuIcon />}
                closeTitle="Close HUD"
            >
                <div className="text-sm uppercase tracking-[0.25em] text-sky-300">
                    {`Live Match `}
                    {sessionId}
                </div>

                <h1 className="mt-1 text-2xl font-bold">
                    {t('infiniteHexTictactoe', 'Infinite Hex Tic-Tac-Toe')}
                </h1>

                <div className="mt-2 text-sm text-slate-300">
                    {t('connect6HexagonsInARow', "Connect 6 hexagons in a row.")}
                    <br />
                    {localPlayerId
                        ? t('tapToPlaceDragToPanPinchToZoom', 'Tap to place, drag to pan, pinch to zoom.')
                        : t('dragToPanPinchToZoom', 'Drag to pan, pinch to zoom.')}

                    <span className="pointer-fine:inline hidden ml-1">
                        {t('pressF1ForAllShortcuts', 'Press F1 for all shortcuts.')}
                    </span>
                </div>

                {shutdown && (
                    <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">
                            {t('shutdownScheduled', 'Shutdown Scheduled')}
                        </div>

                        <div className="mt-1">
                            {t('newGamesAreDisabledThisServerRestartsIn', 'New games are disabled. This server restarts in')}
                            <ShutdownTimer shutdown={shutdown} />
                            .
                        </div>
                    </div>
                )}

                {tournament && (
                    <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/6 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">
                            {t('tournamentMatch', 'Tournament Match')}
                        </div>

                        <div className="mt-0.5 text-[13px] font-bold text-white">
                            {tournament.tournamentName}
                        </div>

                        <div className="mt-1 text-[11px] text-slate-300">
                            {t('tournamentGameSummary', '{{bracket}} R{{round}} · BO{{bestOf}} · Game {{currentGameNumber}} · Score {{leftWins}}–{{rightWins}}', {
                                bracket: tournament.bracket.replace(/-/g, ` `),
                                round: tournament.round,
                                bestOf: tournament.bestOf,
                                currentGameNumber: tournament.currentGameNumber,
                                leftWins: tournament.leftWins,
                                rightWins: tournament.rightWins,
                            })}
                        </div>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <HudInfoBlock label="Session">
                        <div className="text-white">
                            {gameOptions.visibility === `private` ? `Private Session` : `Public Session`}
                        </div>

                        <div className="text-slate-300">
                            {`Clock `}
                            {formatTimeControl(gameOptions.timeControl)}
                        </div>
                    </HudInfoBlock>

                    <HudInfoBlock label="Game">
                        <div className="text-white">
                            {t('turnCountCompleted', {
                                defaultValue_one: '{{count}} turn completed',
                                defaultValue_other: '{{count}} turns completed',
                                count: turnCount,
                            })}
                        </div>

                        <div className="text-slate-300">
                            {t('occupiedCellCount', {
                                defaultValue_one: '{{count}} cell occupied',
                                defaultValue_other: '{{count}} cells occupied',
                                count: occupiedCellCount,
                            })}
                        </div>
                    </HudInfoBlock>

                    <HudInfoBlock label="Players">
                        {players.map(({ playerId, profileId, displayColor, displayName, isConnected, rankingEloScore }) => {
                            let formattedName;
                            if (gameOptions.rated && !hideEloInHud) {
                                formattedName = t('displaynameRankingeloscore', '{{displayName}} ({{rankingEloScore}})', { displayName, rankingEloScore });
                            } else {
                                formattedName = displayName;
                            }

                            return (
                                <div key={playerId} className="mt-1 flex items-center gap-2.5 text-white">
                                    <span
                                        className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0"
                                        style={{ backgroundColor: displayColor }}
                                    />

                                    {profileId ? (
                                        <NavLink
                                            to={`/profile/${profileId}`}
                                            className="overflow-hidden overscroll-contain text-ellipsis min-w-0"
                                            title={formattedName}
                                        >
                                            {formattedName}
                                        </NavLink>
                                    ) : (
                                        <span title={formattedName} className="overflow-hidden overscroll-contain text-ellipsis min-w-0"                >
                                            {formattedName}
                                        </span>
                                    )}

                                    {!isConnected && (
                                        <span
                                            title={t('displaynameIsOffline', '{{displayName}} is offline', { displayName })}
                                            aria-label={t('displaynameIsOffline', '{{displayName}} is offline', { displayName })}
                                            className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/25 bg-amber-400/10 text-amber-100"
                                        >
                                            <OfflineIcon />
                                        </span>
                                    )}

                                    {playerId === localPlayerId && (
                                        <span className="rounded-md border border-white/10 bg-white/6 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            {t('you', 'You')}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </HudInfoBlock>

                    <HudInfoBlock label="Ranking">
                        {gameOptions.rated ? (
                            isSpectator ? (
                                <React.Fragment>
                                    <div className="text-white">
                                        {t('ratedMatch', 'Rated Match')}
                                    </div>

                                    <div className="text-slate-300">
                                        {t('playersWillGainloseElo', 'Players will gain/lose ELO.')}
                                    </div>
                                </React.Fragment>
                            ) : hideEloInHud ? (
                                <React.Fragment>
                                    <div className="text-white">
                                        {t('ratedMatch', 'Rated Match')}
                                    </div>

                                    <div className="text-slate-300">
                                        {t('zenModeHidesEloInTheHud', 'Zen mode hides Elo in the HUD.')}
                                    </div>
                                </React.Fragment>
                            ) : (
                                <React.Fragment>
                                    <div className="text-white">
                                        <span className="inline-block w-[2em]">
                                            {t('win', 'Win')}
                                        </span>

                                        <span className="inline-block w-[2em] text-right">
                                            +
                                            {rankingAdjustment?.eloGain ?? 0}
                                        </span>
                                    </div>

                                    <div className="text-slate-300">
                                        <span className="inline-block w-[2em]">
                                            {t('loss', 'Loss')}
                                        </span>

                                        <span className="inline-block w-[2em] text-right">
                                            {rankingAdjustment?.eloLoss ?? 0}
                                        </span>
                                    </div>
                                </React.Fragment>
                            )
                        ) : (
                            <div className="text-white">
                                {t('notRated', 'Not Rated')}
                            </div>
                        )}
                    </HudInfoBlock>
                </div>

                <div className="pointer-events-auto mt-4 gap-2 grid grid-cols-2 items-end">
                    {!hideSurrenderButton && (
                        <Button
                            onClick={onLeave}
                            variant="destructive" size="sm" className="min-w-36"
                        >
                            {leaveLabel}
                        </Button>
                    )}

                    {drawActionArea}
                    {drawActionArea && (<div />)}

                    <Button
                        onClick={onResetView}
                        variant="default" size="sm" className="min-w-36"
                    >
                        {t('resetView', 'Reset View')}
                    </Button>
                </div>
            </GameHudShell>
        </React.Fragment>
    );
}

export default GameScreenHud;
