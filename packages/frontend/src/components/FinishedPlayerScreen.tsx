import { useEffect, useState, type MouseEvent } from 'react'
import type { SessionInfo } from '@ih3t/shared'
import { formatEloChange } from '../utils/elo'

type FinishedPlayerScreenVariant = 'win' | 'lose'
type FinishedSessionInfo = Extract<SessionInfo, { state: 'finished' }>

interface FinishedPlayerScreenProps {
  session: FinishedSessionInfo
  currentPlayerId: string
  variant: FinishedPlayerScreenVariant
  title: string
  message: string
  onReturnToLobby: () => void
  reviewGameHref?: string
  onReviewGame?: (event: MouseEvent<HTMLAnchorElement>) => void
  onRequestRematch?: () => void
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3)
}

function useAnimatedElo(targetValue: number | null, initialValue: number | null) {
  const [displayValue, setDisplayValue] = useState(targetValue ?? 0)

  useEffect(() => {
    if (targetValue === null) {
      setDisplayValue(0)
      return
    }

    if (initialValue === null || initialValue === targetValue) {
      setDisplayValue(targetValue)
      return
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(targetValue)
      return
    }

    let animationFrameId = 0
    let animationDelayTimer = 0
    const animationDurationMs = 2_750
    const animationDelayMs = 350
    const animationStartAt = performance.now()

    setDisplayValue(initialValue)

    const animate = (now: number) => {
      const progress = Math.min(1, (now - animationStartAt) / animationDurationMs)
      const easedProgress = easeOutCubic(progress)
      setDisplayValue(
        Math.round(initialValue + (targetValue - initialValue) * easedProgress)
      )

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(animate)
      }
    }

    animationDelayTimer = window.setTimeout(() => {
      animationFrameId = window.requestAnimationFrame(animate)
    }, animationDelayMs)

    return () => {
      window.clearTimeout(animationDelayTimer)
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [initialValue, targetValue])

  return displayValue
}

function FinishedPlayerScreen({
  session,
  currentPlayerId,
  variant,
  title,
  message,
  onReturnToLobby,
  reviewGameHref,
  onReviewGame,
  onRequestRematch
}: Readonly<FinishedPlayerScreenProps>) {
  const isWin = variant === 'win'
  const currentPlayer = session.players.find((player) => player.id === currentPlayerId) ?? null
  const eloAdjustment = currentPlayer && currentPlayer.ratingAdjustment ?
    isWin ? currentPlayer.ratingAdjustment.eloGain : currentPlayer.ratingAdjustment.eloLoss : 0;

  const eloSummary = currentPlayer && currentPlayer.rating !== null && currentPlayer.ratingAdjustment !== null
    ? {
      currentElo: currentPlayer.rating.eloScore + eloAdjustment,
      previousElo: currentPlayer.rating.eloScore,
      eloChange: eloAdjustment
    }
    : null
  const animatedElo = useAnimatedElo(
    eloSummary?.currentElo ?? null,
    eloSummary?.previousElo ?? null
  )
  const isRematchAvailable = session.players.every(player => player.connection.status === "connected") && session.winningPlayerId !== null
  const isRematchRequestedByCurrentPlayer = session.rematchAcceptedPlayerIds.includes(currentPlayerId)
  const isRematchRequestedByOpponent = session.rematchAcceptedPlayerIds.some(
    (playerId) => playerId !== currentPlayerId
  )
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
      card: 'border-emerald-200/20 bg-slate-950/80 shadow-[0_28px_120px_rgba(5,46,22,0.52)]',
      badge: 'border-emerald-200/30 text-emerald-100',
      accent: 'from-emerald-300/90 via-emerald-200/40 to-amber-200/0',
      status: 'border-emerald-300/16 bg-emerald-400/10 text-emerald-50',
      eloValue: 'text-emerald-50',
      eloChangeValue: 'text-emerald-200',
      primaryButton: 'bg-emerald-300 text-slate-950 hover:bg-emerald-200',
      secondaryButton: 'border-emerald-200/25 bg-emerald-950/55 text-white hover:bg-emerald-950/80',
      subtleButton: 'border-white/12 bg-white/7 text-white hover:bg-white/15'
    }
    : {
      shell: 'bg-[radial-gradient(circle_at_top,_rgba(251,113,133,0.24),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.14),_transparent_28%),rgba(2,6,23,0.74)]',
      card: 'border-rose-200/20 bg-slate-950/80 shadow-[0_28px_120px_rgba(76,5,25,0.54)]',
      badge: 'border-rose-200/30 text-rose-100',
      accent: 'from-rose-300/90 via-rose-200/40 to-amber-200/0',
      status: 'border-rose-300/16 bg-rose-400/10 text-rose-50',
      eloValue: 'text-rose-50',
      eloChangeValue: 'text-rose-200',
      primaryButton: 'bg-rose-300 text-slate-950 hover:bg-rose-200',
      secondaryButton: 'border-rose-200/25 bg-rose-950/55 text-white hover:bg-rose-950/80',
      subtleButton: 'border-white/12 bg-white/7 text-white hover:bg-white/15'
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

              {eloSummary && (
                <div className="mt-10 max-w-2xl">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/55">
                    ELO Rating
                  </div>
                  <div className="flex items-end gap-3">
                    <div className={`text-5xl font-black tracking-[0.04em] sm:text-6xl ${theme.eloValue}`}>
                      {animatedElo}
                    </div>
                    <div className={`pb-1 text-3xl font-black leading-none ${eloSummary.eloChange >= 0 ? 'text-emerald-200' : theme.eloChangeValue}`}>
                      {formatEloChange(eloSummary.eloChange)}
                    </div>
                  </div>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-white/62">
                    {eloSummary.eloChange >= 0
                      ? 'Strong finish. Your rating climbed, and you are building momentum.'
                      : 'Tough result, but every match sharpens your game. The next climb starts here.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="flex flex-col justify-center border-t border-white/10 bg-black/16 px-6 py-7 sm:px-8 sm:py-8 md:border-l md:border-t-0 lg:px-9">
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
              {reviewGameHref && (
                <a
                  href={reviewGameHref}
                  onClick={onReviewGame}
                  className={`block w-full rounded-2xl border px-5 py-4 text-center text-sm font-semibold uppercase tracking-[0.16em] transition ${theme.secondaryButton}`}
                >
                  Review Game
                </a>
              )}
              <button
                onClick={onReturnToLobby}
                className={`w-full rounded-2xl border px-5 py-4 text-sm font-semibold uppercase tracking-[0.16em] transition ${theme.subtleButton}`}
              >
                Return To Lobby
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default FinishedPlayerScreen
