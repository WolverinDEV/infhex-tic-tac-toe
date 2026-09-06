import type { BoardTheme } from "@ih3t/board-renderer";
import type { GameState, SessionPlayer } from '@ih3t/shared';

import { getPlayerLabel, getPlayerColor } from '../../utils/gameBoard';
import { useTranslation } from 'react-i18next'

type SandboxTurnIndicatorProps = {
    theme?: BoardTheme
    players: SessionPlayer[]
    gameState: GameState
    winnerId: string | null
    botPlayerIds?: readonly string[]
    isBotThinking?: boolean
};

function SandboxTurnIndicator({
    players,
    theme,
    gameState,
    winnerId,
    botPlayerIds = [],
    isBotThinking = false,
}: Readonly<SandboxTurnIndicatorProps>) {
    const { t } = useTranslation()
    const playerIds = players.map(player => player.id);
    const playerNames = Object.fromEntries(players.map(player => [player.id, player.displayName]));
    const focusPlayerId = winnerId ?? gameState.currentTurnPlayerId;
    const focusPlayerLabel = getPlayerLabel(playerIds, focusPlayerId, playerNames, `Sandbox`);
    const focusPlayerColor = focusPlayerId
        ? getPlayerColor(gameState.playerTiles, focusPlayerId, theme)
        : `#7dd3fc`;
    const placementsRemaining = gameState.placementsRemaining;
    const isBotTurn = !winnerId && Boolean(focusPlayerId && botPlayerIds.includes(focusPlayerId));

    const headline = winnerId
        ? t('focusplayerlabelWins', '{{focusPlayerLabel}} Wins', { focusPlayerLabel })
        : t('focusplayerlabelToMove', '{{focusPlayerLabel}} To Move', { focusPlayerLabel });
    const detail = winnerId
        ? t('startANewBoardToKeepExploringLines', 'Start a new board to keep exploring lines.')
        : isBotTurn && isBotThinking
            ? t('botIsThinkingWithPlacementsremainingValLeftThisTurn', 'Bot is thinking with {{placementsRemaining}} {{val}} left this turn.', { placementsRemaining, val: placementsRemaining === 1 ? `placement` : `placements` })
            : isBotTurn
                ? t('botcontrolledTurnWithPlacementsremainingValLeft', 'Bot-controlled turn with {{placementsRemaining}} {{val}} left.', { placementsRemaining, val: placementsRemaining === 1 ? `placement` : `placements` })
                : t('placementsremainingValLeftThisTurn', '{{placementsRemaining}} {{val}} left this turn.', { placementsRemaining, val: placementsRemaining === 1 ? `placement` : `placements` });

    return (
        <div className="absolute left-3 right-3 top-3 flex justify-center md:left-0 md:right-0">
            <div className="pointer-events-none w-full max-w-xl rounded-md bg-slate-800/95 px-3 py-2.5 shadow-xxl sm:px-4">
                <div
                    className="flex min-w-0 items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] leading-tight"
                    style={{ color: focusPlayerColor }}
                >
                    <span
                        className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: focusPlayerColor }}
                    />

                    <span className="min-w-0 truncate">
                        {headline}
                    </span>
                </div>

                <div className="mt-0.5 truncate text-xs leading-tight text-slate-300">
                    {detail}
                </div>
            </div>
        </div>
    );
}

export default SandboxTurnIndicator;
