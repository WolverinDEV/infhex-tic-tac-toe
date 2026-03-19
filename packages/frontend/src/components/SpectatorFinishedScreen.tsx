import type { SessionFinishReason } from '@ih3t/shared'

interface SpectatorFinishedScreenProps {
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
  onReviewGame?: () => void
}

function SpectatorFinishedScreen({
  reason,
  onReturnToLobby,
  onReviewGame
}: Readonly<SpectatorFinishedScreenProps>) {
  const message = reason === 'timeout'
    ? 'One player ran out of time, so the match ended.'
    : reason === 'six-in-a-row'
      ? 'A player connected six hexagons in a row.'
      : reason === 'terminated'
        ? 'The match was closed when the server shutdown reached its deadline.'
        : 'A player disconnected before the match could finish.'

  return (
    <div className="w-full h-full bg-slate-950/46 flex flex-col items-center justify-center p-6 text-white font-sans text-center backdrop-blur-[2px]">
      <div className="w-full max-w-xl rounded-[2rem] border border-sky-300/20 bg-sky-500/16 px-8 py-10 shadow-[0_20px_80px_rgba(14,116,144,0.35)]">
        <h1 className="text-6xl mb-4">Match finished</h1>
        <p className="text-xl">{message}</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {onReviewGame && (
            <button
              onClick={onReviewGame}
              className="min-w-48 rounded bg-sky-950/60 px-6 py-3 text-white ring-1 ring-inset ring-sky-200/30 transition hover:bg-sky-950/80"
            >
              Review Game
            </button>
          )}
          <button
            onClick={onReturnToLobby}
            className="min-w-48 rounded bg-white px-6 py-3 text-sky-900 border-none cursor-pointer hover:bg-sky-100"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  )
}

export default SpectatorFinishedScreen
