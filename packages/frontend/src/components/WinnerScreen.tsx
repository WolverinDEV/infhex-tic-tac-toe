import type { SessionFinishReason } from '@ih3t/shared'

interface WinnerScreenProps {
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
  onRequestRematch?: () => void
  isRematchAvailable?: boolean
  isRematchRequestedByCurrentPlayer?: boolean
  isRematchRequestedByOpponent?: boolean
}

function WinnerScreen({
  reason,
  onReturnToLobby,
  onRequestRematch,
  isRematchAvailable = true,
  isRematchRequestedByCurrentPlayer = false,
  isRematchRequestedByOpponent = false
}: Readonly<WinnerScreenProps>) {
  const message = reason === 'timeout'
    ? 'The other player failed to place a cell before the timer ran out.'
    : reason === 'six-in-a-row'
      ? 'You completed a six-tile row.'
      : 'The other player disconnected.'
  const rematchLabel = !isRematchAvailable
    ? 'Opponent Left'
    : isRematchRequestedByCurrentPlayer
      ? 'Waiting for opponent...'
      : isRematchRequestedByOpponent
        ? 'Accept Rematch'
        : 'Rematch'
  const isRematchDisabled = !isRematchAvailable || isRematchRequestedByCurrentPlayer

  return (
    <div className="w-full h-full bg-slate-950/40 flex flex-col items-center justify-center p-6 text-white font-sans text-center backdrop-blur-[2px]">
      <div className="w-full max-w-xl rounded-[2rem] border border-emerald-300/25 bg-emerald-500/18 px-8 py-10 shadow-[0_20px_80px_rgba(6,95,70,0.35)]">
        <h1 className="text-6xl mb-4">You've won!</h1>
        <p className="text-xl">{message}</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {onRequestRematch && (
            <button
              onClick={onRequestRematch}
              disabled={isRematchDisabled}
              className="min-w-48 rounded bg-emerald-950/60 px-6 py-3 text-white ring-1 ring-inset ring-emerald-200/30 transition hover:bg-emerald-950/80 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {rematchLabel}
            </button>
          )}
          <button
            onClick={onReturnToLobby}
            className="min-w-48 rounded bg-white px-6 py-3 text-emerald-800 border-none cursor-pointer hover:bg-emerald-100"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  )
}

export default WinnerScreen
