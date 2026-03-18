import type { SessionFinishReason } from '@ih3t/shared'

interface LoserScreenProps {
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
  onRequestRematch?: () => void
  isRematchAvailable?: boolean
  isRematchRequestedByCurrentPlayer?: boolean
  isRematchRequestedByOpponent?: boolean
}

function LoserScreen({
  reason,
  onReturnToLobby,
  onRequestRematch,
  isRematchAvailable = true,
  isRematchRequestedByCurrentPlayer = false,
  isRematchRequestedByOpponent = false
}: Readonly<LoserScreenProps>) {
  const message = reason === 'timeout'
    ? 'You failed to place a cell before the timer ran out.'
    : reason === 'six-in-a-row'
      ? 'The other player completed a six-tile row.'
      : 'You left the match before it finished.'
  const rematchLabel = !isRematchAvailable
    ? 'Opponent Left'
    : isRematchRequestedByCurrentPlayer
      ? 'Waiting for opponent...'
      : isRematchRequestedByOpponent
        ? 'Accept Rematch'
        : 'Rematch'
  const isRematchDisabled = !isRematchAvailable || isRematchRequestedByCurrentPlayer

  return (
    <div className="w-full h-full bg-slate-950/46 flex flex-col items-center justify-center p-6 text-white font-sans text-center backdrop-blur-[2px]">
      <div className="w-full max-w-xl rounded-[2rem] border border-rose-300/20 bg-rose-500/16 px-8 py-10 shadow-[0_20px_80px_rgba(136,19,55,0.35)]">
        <h1 className="text-6xl mb-4">You lost</h1>
        <p className="text-xl">{message}</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {onRequestRematch && (
            <button
              onClick={onRequestRematch}
              disabled={isRematchDisabled}
              className="min-w-48 rounded bg-rose-950/60 px-6 py-3 text-white ring-1 ring-inset ring-rose-200/30 transition hover:bg-rose-950/80 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {rematchLabel}
            </button>
          )}
          <button
            onClick={onReturnToLobby}
            className="min-w-48 rounded bg-white px-6 py-3 text-rose-900 border-none cursor-pointer hover:bg-rose-100"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoserScreen
