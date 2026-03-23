import type { GameState, SessionParticipant } from '@ih3t/shared'
import { getPlayerLabel, getPlayerTileColor } from '../../utils/gameBoard'

interface SandboxWinnerBannerProps {
  players: SessionParticipant[]
  gameState: GameState
  winnerId: string | null
  onResetBoard: () => void
  onExploreBoard: () => void
}

function SandboxWinnerBanner({
  players,
  gameState,
  winnerId,
  onResetBoard,
  onExploreBoard
}: Readonly<SandboxWinnerBannerProps>) {
  if (!winnerId) {
    return null
  }

  const playerIds = players.map(player => player.id)
  const playerNames = Object.fromEntries(players.map(player => [player.id, player.displayName]))
  const winnerLabel = getPlayerLabel(playerIds, winnerId, playerNames, 'Winner')
  const winnerColor = getPlayerTileColor(gameState.playerTiles, winnerId)

  return (
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl rounded-[1.75rem] border border-amber-300/35 bg-slate-900/95 px-6 py-6 text-center shadow-[0_30px_120px_rgba(15,23,42,0.58)] backdrop-blur sm:px-8 sm:py-8">
        <div className="min-w-0">
          <div className="mt-5">
            <div
              className="mt-3 flex min-w-0 truncate items-center justify-center gap-3 text-2xl font-black uppercase tracking-[0.08em] sm:text-4xl"
              style={{ color: winnerColor }}
            >
              {winnerLabel} Wins
            </div>
            <div className="mt-3 text-sm text-slate-200 sm:text-base">
              Reset the board to play the position again.
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={onExploreBoard}
              className="rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
            >
              Explore Board
            </button>
            <button
              onClick={onResetBoard}
              className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
            >
              Reset Board
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SandboxWinnerBanner
