import type { LobbyOptions, PlayerRatingAdjustment, ShutdownState } from '@ih3t/shared';
import { useState } from 'react';
import React from 'react';
import { NavLink } from 'react-router';

import { formatTimeControl } from '../../utils/gameTimeControl';
import GameHudShell from './GameHudShell';
import HudInfoBlock from './HudInfoBlock';
import { ShutdownTimer } from './ShutdownTimer';

export type HudPlayerInfo = {
    playerId: string,
    profileId: string | null,
    isBot: boolean,

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

    rankingAdjustment: PlayerRatingAdjustment | null,

    occupiedCellCount: number
    renderableCellCount: number

    gameOptions: LobbyOptions

    shutdown: ShutdownState | null

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

function GameScreenHud({
    sessionId,

    players,
    localPlayerId,
    hideEloInHud = false,
    showConnectionUnstableBadge = false,

    rankingAdjustment,

    occupiedCellCount,
    renderableCellCount,

    shutdown,
    gameOptions,

    leaveLabel = `Leave Game`,
    onLeave,
    onResetView,
}: Readonly<GameScreenHudProps>) {
    const isSpectator = !players.some(player => player.playerId === localPlayerId);
    const [isHudOpen, setIsHudOpen] = useState(true);

    return (
        <React.Fragment>
            {showConnectionUnstableBadge && (
                <div className="pointer-events-none absolute right-3 top-3 z-30">
                    <div className="rounded-full border border-amber-300/40 bg-amber-200/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-lg backdrop-blur-md">
                        Connection unstable
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
                    Live Match
                    {sessionId}
                </div>

                <h1 className="mt-1 text-2xl font-bold">
                    Infinite Hex Tic-Tac-Toe
                </h1>

                <div className="mt-2 text-sm text-slate-300">
                    Connect 6 hexagons in a row.
                    <br />
                    {localPlayerId ? `Tap to place, drag to pan, pinch to zoom, right-drag to draw and right-click a line to erase.` : `Drag to pan, pinch to zoom, right-drag to draw and right-click a line to erase.`}
                </div>

                {shutdown && (
                    <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">
                            Shutdown Scheduled
                        </div>

                        <div className="mt-1">
                            New games are disabled. This server restarts in
                            <ShutdownTimer shutdown={shutdown} />
                            .
                        </div>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <HudInfoBlock label="Session">
                        <div className="text-white">
                            {gameOptions.visibility === `private` ? `Private Session` : `Public Session`}
                        </div>

                        <div className="text-slate-300">
                            Clock
                            {formatTimeControl(gameOptions.timeControl)}
                        </div>
                    </HudInfoBlock>

                    <HudInfoBlock label="Ranking">
                        {gameOptions.rated ? (
                            isSpectator ? (
                                <React.Fragment>
                                    <div className="text-white">
                                        Rated Match
                                    </div>

                                    <div className="text-slate-300">
                                        Players will gain/lose ELO.
                                    </div>
                                </React.Fragment>
                            ) : hideEloInHud ? (
                                <React.Fragment>
                                    <div className="text-white">
                                        Rated Match
                                    </div>

                                    <div className="text-slate-300">
                                        Zen mode hides Elo in the HUD.
                                    </div>
                                </React.Fragment>
                            ) : (
                                <React.Fragment>
                                    <div className="text-white">
                                        <span className="inline-block w-[2em]">
                                            Win
                                        </span>

                                        <span className="inline-block w-[2em] text-right">
                                            +
                                            {rankingAdjustment?.eloGain ?? 0}
                                        </span>
                                    </div>

                                    <div className="text-slate-300">
                                        <span className="inline-block w-[2em]">
                                            Loss
                                        </span>

                                        <span className="inline-block w-[2em] text-right">
                                            {rankingAdjustment?.eloLoss ?? 0}
                                        </span>
                                    </div>
                                </React.Fragment>
                            )
                        ) : (
                            <div className="text-white">
                                Not Rated
                            </div>
                        )}
                    </HudInfoBlock>

                    <HudInfoBlock label="Players">
                        {players.map(({ playerId, profileId, isBot, displayColor, displayName, isConnected, rankingEloScore }) => {
                            let formattedName;
                            if (gameOptions.rated && !hideEloInHud) {
                                formattedName = `${displayName} (${rankingEloScore})`;
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
                                            title={`${displayName} is offline`}
                                            aria-label={`${displayName} is offline`}
                                            className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/25 bg-amber-400/10 text-amber-100"
                                        >
                                            <OfflineIcon />
                                        </span>
                                    )}

                                    {playerId === localPlayerId && (
                                        <span className="rounded-md border border-white/10 bg-white/6 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            You
                                        </span>
                                    )}

                                    {isBot && (
                                        <span className="rounded-md border border-sky-300/20 bg-sky-300/10 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100">
                                            Bot
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </HudInfoBlock>

                    <HudInfoBlock label="Cells">
                        <div className="text-white">
                            {renderableCellCount}
                            {` `}
                            active
                        </div>

                        <div className="text-slate-300">
                            {occupiedCellCount}
                            {` `}
                            occupied
                        </div>
                    </HudInfoBlock>
                </div>

                <div className="pointer-events-auto mt-4 grid grid-cols-2 gap-2">
                    <button
                        onClick={onLeave}
                        className="min-w-36 flex-1 rounded-full bg-red-500 px-4 py-2 font-medium shadow-lg hover:bg-red-400 md:flex-none"
                    >
                        {leaveLabel}
                    </button>

                    <button
                        onClick={onResetView}
                        className="min-w-36 flex-1 rounded-full bg-sky-600 px-4 py-2 font-medium shadow-lg hover:bg-sky-500 md:flex-none"
                    >
                        Reset View
                    </button>
                </div>
            </GameHudShell>
        </React.Fragment>
    );
}

export default GameScreenHud;
