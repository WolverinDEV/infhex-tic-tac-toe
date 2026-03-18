import type { SessionFinishReason } from '@ih3t/shared'

type FinishedPlayerScreenVariant = 'win' | 'lose'

interface FinishedPlayerScreenProps {
  variant: FinishedPlayerScreenVariant
  title: string
  message: string
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
  onReviewGame?: () => void
  onRequestRematch?: () => void
  isRematchAvailable?: boolean
  isRematchRequestedByCurrentPlayer?: boolean
  isRematchRequestedByOpponent?: boolean
}

function FinishedPlayerScreen({
  variant,
  title,
  message,
  reason,
  onReturnToLobby,
  onReviewGame,
  onRequestRematch,
  isRematchAvailable = true,
  isRematchRequestedByCurrentPlayer = false,
  isRematchRequestedByOpponent = false
}: Readonly<FinishedPlayerScreenProps>) {
  const isWin = variant === 'win'
  const rematchLabel = !isRematchAvailable
    ? 'Opponent Left'
    : isRematchRequestedByCurrentPlayer
      ? 'Waiting For Opponent'
      : isRematchRequestedByOpponent
        ? 'Accept Rematch'
        : 'Rematch'
  const rematchStatus = !isRematchAvailable
    ? 'Rematch is unavailable because the other player already left the session.'
    : isRematchRequestedByCurrentPlayer
      ? 'Your rematch request has been sent. This screen will update as soon as the other player accepts.'
      : isRematchRequestedByOpponent
        ? 'The other player wants another round. Accept to jump straight into the rematch flow.'
        : 'You can return to the lobby, inspect the replay, or run it back immediately.'
  const isRematchDisabled = !isRematchAvailable || isRematchRequestedByCurrentPlayer

  const theme = isWin
    ? {
        shell: 'bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.22),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.16),_transparent_28%),rgba(2,6,23,0.72)]',
        card: 'border-emerald-200/20 bg-slate-950/78 shadow-[0_28px_120px_rgba(5,46,22,0.52)]',
        badge: 'border-emerald-200/30 bg-emerald-400/12 text-emerald-100',
        accent: 'from-emerald-300/90 via-emerald-200/40 to-amber-200/0',
        status: 'border-emerald-300/16 bg-emerald-400/10 text-emerald-50',
        primaryButton: 'bg-emerald-300 text-slate-950 hover:bg-emerald-200',
        secondaryButton: 'border-emerald-200/25 bg-emerald-950/55 text-white hover:bg-emerald-950/80',
        subtleButton: 'border-white/12 bg-white/7 text-white hover:bg-white/12'
      }
    : {
        shell: 'bg-[radial-gradient(circle_at_top,_rgba(251,113,133,0.24),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.14),_transparent_28%),rgba(2,6,23,0.74)]',
        card: 'border-rose-200/20 bg-slate-950/80 shadow-[0_28px_120px_rgba(76,5,25,0.54)]',
        badge: 'border-rose-200/30 bg-rose-400/12 text-rose-100',
        accent: 'from-rose-300/90 via-rose-200/40 to-amber-200/0',
        status: 'border-rose-300/16 bg-rose-400/10 text-rose-50',
        primaryButton: 'bg-rose-300 text-slate-950 hover:bg-rose-200',
        secondaryButton: 'border-rose-200/25 bg-rose-950/55 text-white hover:bg-rose-950/80',
        subtleButton: 'border-white/12 bg-white/7 text-white hover:bg-white/12'
      }

  return (
    <div className={`flex h-full w-full items-center justify-center overflow-y-auto p-4 text-white backdrop-blur-md sm:p-6 ${theme.shell}`}>
      <div className={`relative w-full max-w-5xl overflow-hidden rounded-[2rem] border ${theme.card}`}>
        <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r ${theme.accent}`} />
        <div className="grid gap-0 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <section className="relative px-6 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
            <div className="absolute -left-14 top-10 h-32 w-32 rounded-full bg-white/6 blur-3xl" />
            <div className="relative">
              <div className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] ${theme.badge}`}>
                {isWin ? 'Victory Locked In' : 'Match Slipped Away'}
              </div>
              <h1 className="mt-5 max-w-2xl text-4xl font-black uppercase tracking-[0.08em] text-white sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                {message}
              </p>

              {!isWin && (
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-4 text-left text-slate-100">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/60">Next Move</div>
                    <div className="mt-2 text-sm leading-6 text-slate-200">
                      Review the key turns, reset your read on the board, and go again.
                    </div>
                  </div>
                  <div className={`rounded-[1.5rem] border px-5 py-4 ${theme.status}`}>
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/70">Keep Going</div>
                    <div className="mt-2 text-sm leading-6 text-white">
                      Queue a rematch now, or open the replay to study the swing moments before the next round.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="border-t border-white/10 bg-black/16 px-6 py-7 sm:px-8 sm:py-8 md:border-l md:border-t-0 lg:px-9">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/65">Continue</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                {rematchStatus}
              </p>

              <div className="mt-6 flex flex-col gap-3">
                {onRequestRematch && (
                  <button
                    onClick={onRequestRematch}
                    disabled={isRematchDisabled}
                    className={`w-full rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.primaryButton}`}
                  >
                    {rematchLabel}
                  </button>
                )}
                {onReviewGame && (
                  <button
                    onClick={onReviewGame}
                    className={`w-full rounded-2xl border px-5 py-4 text-sm font-semibold uppercase tracking-[0.16em] transition ${theme.secondaryButton}`}
                  >
                    Review Game
                  </button>
                )}
                <button
                  onClick={onReturnToLobby}
                  className={`w-full rounded-2xl border px-5 py-4 text-sm font-semibold uppercase tracking-[0.16em] transition ${theme.subtleButton}`}
                >
                  Return To Lobby
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default FinishedPlayerScreen
