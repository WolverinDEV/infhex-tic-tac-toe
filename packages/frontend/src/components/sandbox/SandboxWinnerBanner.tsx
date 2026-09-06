import type { BoardTheme } from "@ih3t/board-renderer";
import { Button } from '@/components/ui/button';
import type { GameState, SessionPlayer } from '@ih3t/shared';

import { getPlayerLabel, getPlayerColor } from '../../utils/gameBoard';
import { useTranslation } from 'react-i18next'

type SandboxWinnerBannerProps = {
    theme?: BoardTheme
    players: SessionPlayer[]
    gameState: GameState
    winnerId: string | null
    onResetBoard: () => void
    onExploreBoard: () => void
};

function SandboxWinnerBanner({
    players,
    theme,
    gameState,
    winnerId,
    onResetBoard,
    onExploreBoard,
}: Readonly<SandboxWinnerBannerProps>) {
    const { t } = useTranslation()
    if (!winnerId) {
        return null;
    }

    const playerIds = players.map(player => player.id);
    const playerNames = Object.fromEntries(players.map(player => [player.id, player.displayName]));
    const winnerLabel = getPlayerLabel(playerIds, winnerId, playerNames, `Winner`);
    const winnerColor = getPlayerColor(gameState.playerTiles, winnerId, theme);

    return (
        <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="pointer-events-auto w-full max-w-xl rounded-[1.75rem] border border-amber-300/35 bg-slate-900/95 px-6 py-6 text-center shadow-[0_30px_120px_rgba(15,23,42,0.58)] backdrop-blur sm:px-8 sm:py-8">
                <div className="min-w-0">
                    <div className="mt-5">
                        <div
                            className="mt-3 flex min-w-0 truncate items-center justify-center gap-3 text-2xl font-black uppercase tracking-[0.08em] sm:text-4xl"
                            style={{ color: winnerColor }}
                        >
                            {t('winnerWins', '{{winnerLabel}} Wins', { winnerLabel })}
                        </div>

                        <div className="mt-3 text-sm text-slate-200 sm:text-base">
                            {t('resetTheBoardToPlayThePositionAgain', 'Reset the board to play the position again.')}
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                        <Button
                            onClick={onExploreBoard}
                            variant="outline" size="lg"
                        >
                            {t('exploreBoard', 'Explore Board')}
                        </Button>

                        <Button
                            onClick={onResetBoard}
                            variant="secondary" size="lg"
                        >
                            {t('resetBoard', 'Reset Board')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SandboxWinnerBanner;
