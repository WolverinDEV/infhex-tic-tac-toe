import type { BoardTheme } from "@ih3t/board-renderer";
import type { GameState, LobbyOptions, SessionPlayer } from '@ih3t/shared';
import { useEffect, useRef, useState } from 'react';

import { playCountdownWarningSound } from '../../soundEffects';
import { getPlayerLabel, getPlayerColor } from '../../utils/gameBoard';
import ClockCard from './ClockCard';
import TurnIndicator from './TurnIndicator';
import { useTranslation } from 'react-i18next'

type TurnTimerHudProps = {
    theme?: BoardTheme
    gameOptions: LobbyOptions
    players: SessionPlayer[]
    gameState: GameState
    localPlayerId: string | null
};

function TurnTimerHud({
    gameOptions,
    players,
    theme,
    gameState,
    localPlayerId,
}: Readonly<TurnTimerHudProps>) {
    const { t } = useTranslation()
    const [activeClockCountdownMs, setActiveClockCountdownMs] = useState<number | null>(null);
    const lastCountdownWarningSecondRef = useRef<number | null>(null);
    const effectiveTimeControl = gameOptions.timeControl;
    const playerIds = players.map(player => player.id);
    const playerNames: Record<string, string> = Object.fromEntries(players.map(player => [player.id, player.displayName]));
    const currentTurnPlayerId = gameState.currentTurnPlayerId;
    const currentTurnExpiresInMs = gameState.currentTurnExpiresInMs;
    const placementsRemaining = gameState.placementsRemaining;
    const playerTimeRemainingMs = gameState.playerTimeRemainingMs;

    const isSpectator = localPlayerId === null;
    const canPlaceCell = localPlayerId !== null && currentTurnPlayerId === localPlayerId;
    const clockPlayers = players.slice(0, 2);
    const activePlayerColor = currentTurnPlayerId ? getPlayerColor(gameState.playerTiles, currentTurnPlayerId, theme) : `#7dd3fc`;

    const getDisplayedPlayerClockMs = (playerId: string) => {
        if (effectiveTimeControl.mode === `unlimited`) {
            return -1;
        }

        if (playerId === currentTurnPlayerId && activeClockCountdownMs !== null) {
            return activeClockCountdownMs;
        }

        switch (effectiveTimeControl.mode) {
            case `turn`:
                return effectiveTimeControl.turnTimeMs;

            case `match`:
                return playerTimeRemainingMs[playerId] ?? effectiveTimeControl.mainTimeMs;
        }
    };

    useEffect(() => {
        if (currentTurnExpiresInMs === null) {
            setActiveClockCountdownMs(null);
            return;
        }

        const countdownReceivedAt = Date.now();
        const updateCountdown = () => {
            setActiveClockCountdownMs(Math.max(0, currentTurnExpiresInMs - (Date.now() - countdownReceivedAt)));
        };

        updateCountdown();
        const interval = window.setInterval(updateCountdown, 250);
        return () => window.clearInterval(interval);
    }, [
        currentTurnExpiresInMs, currentTurnPlayerId, placementsRemaining, gameState.turnCount,
    ]);

    useEffect(() => {
        if (isSpectator || !canPlaceCell || activeClockCountdownMs === null || activeClockCountdownMs > 10_000) {
            lastCountdownWarningSecondRef.current = null;
            return;
        }

        const remainingWarningSecond = Math.floor(activeClockCountdownMs / 1000);
        if (remainingWarningSecond < 1 || remainingWarningSecond > 9) {
            return;
        }

        if (lastCountdownWarningSecondRef.current === remainingWarningSecond) {
            return;
        }

        lastCountdownWarningSecondRef.current = remainingWarningSecond;
        playCountdownWarningSound();
    }, [
        activeClockCountdownMs, canPlaceCell, isSpectator,
    ]);

    return (
        <div className="absolute left-3 right-3 top-3 flex justify-center md:left-0 md:right-0">
            <div className="pointer-events-none min-w-0 w-110">
                <div className="shadow-xxl w-full max-w-xl border rounded-md bg-slate-800/60 px-3 py-2.5 sm:px-4">
                    <TurnIndicator
                        playerIds={playerIds}
                        playerNames={playerNames}
                        currentTurnPlayerId={currentTurnPlayerId}
                        placementsRemaining={placementsRemaining}
                        activePlayerColor={activePlayerColor}
                        isSpectator={isSpectator}
                        canPlaceCell={canPlaceCell}
                    />
                </div>

                {effectiveTimeControl.mode !== `unlimited` && (
                    <div className="mt-2 grid gap-1.5 sm:gap-2 grid-cols-2">
                        {clockPlayers.map((player) => {
                            const isActivePlayer = player.id === currentTurnPlayerId;
                            const isLocalPlayer = player.id === localPlayerId;

                            return (
                                <ClockCard
                                    key={player.id}
                                    label={getPlayerLabel(playerIds, player.id, playerNames)}
                                    timeMs={getDisplayedPlayerClockMs(player.id)}
                                    markerColor={getPlayerColor(gameState.playerTiles, player.id, theme)}
                                    isHighlighted={isActivePlayer}
                                    trailingBadge={isLocalPlayer && !isSpectator ? (
                                        <div className="rounded bg-white/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-200 sm:text-[9px]">
                                            {t('you', 'You')}
                                        </div>
                                    ) : undefined}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default TurnTimerHud;
