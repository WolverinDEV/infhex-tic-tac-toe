import type { MouseEvent } from 'react'
import type { SessionInfo } from '@ih3t/shared'
import {
  getSpectatorResultMessage,
  getSpectatorResultTitle
} from '../utils/sessionResult'

type FinishedSessionInfo = Extract<SessionInfo, { state: 'finished' }>

interface SpectatorFinishedScreenProps {
  session: FinishedSessionInfo
  onReturnToLobby: () => void
  reviewGameHref?: string
  onReviewGame?: (event: MouseEvent<HTMLAnchorElement>) => void
}

function getSpectatorRematchStatus(session: FinishedSessionInfo) {
  const isRematchAvailable = session.players.length === 2 && session.winningPlayerId !== null
  const rematchRequestingPlayers = session.players.filter((player) => session.rematchAcceptedPlayerIds.includes(player.id))
  const rematchRequestLabel = rematchRequestingPlayers[0]?.displayName?.trim() || 'A player'

  if (!isRematchAvailable) {
    if (session.winningPlayerId === null) {
      return {
        label: 'Rematch Unavailable',
        message: 'This result does not support a rematch.',
        className: 'border-white/12 bg-white/7 text-slate-100',
        accentClassName: 'text-white/70'
      }
    }

    if (session.players.length === 1) {
      return {
        label: 'Rematch Unavailable',
        message: 'One player left the finished match, so a rematch is no longer available.',
        className: 'border-rose-200/20 bg-rose-400/10 text-rose-50',
        accentClassName: 'text-rose-100/80'
      }
    }

    return {
      label: 'Rematch Unavailable',
      message: 'Both players left the finished match, so a rematch is no longer available.',
      className: 'border-rose-200/20 bg-rose-400/10 text-rose-50',
      accentClassName: 'text-rose-100/80'
    }
  }

  if (rematchRequestingPlayers.length === 0) {
    return {
      label: 'Rematch Available',
      message: 'No one has asked for a rematch yet.',
      className: 'border-white/12 bg-white/7 text-slate-100',
      accentClassName: 'text-white/70'
    }
  }

  if (rematchRequestingPlayers.length < session.players.length) {
    return {
      label: 'Rematch Requested',
      message: `${rematchRequestLabel} wants another round and the rematch is still available.`,
      className: 'border-emerald-200/20 bg-emerald-400/10 text-emerald-50',
      accentClassName: 'text-emerald-100/80'
    }
  }

  return {
    label: 'Rematch Starting',
    message: 'Both players accepted the rematch.',
    className: 'border-sky-200/20 bg-sky-400/10 text-sky-50',
    accentClassName: 'text-sky-100/80'
  }
}

function SpectatorFinishedScreen({
  session,
  onReturnToLobby,
  reviewGameHref,
  onReviewGame
}: Readonly<SpectatorFinishedScreenProps>) {
  const winningPlayer = session.players.find((player) => player.id === session.winningPlayerId) ?? null
  const winnerName = winningPlayer?.displayName?.trim() || null
  const title = getSpectatorResultTitle(winnerName)
  const message = getSpectatorResultMessage(session.finishReason, winnerName)
  const rematchStatus = getSpectatorRematchStatus(session)

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4 text-white backdrop-blur-md sm:p-6">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] bg-slate-950/80 border border-sky-200/20 shadow-[0_28px_120px_rgba(8,47,73,0.54)]">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-sky-300/90 via-sky-200/40 to-cyan-200/0" />
        <div className="grid gap-0 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <section className="relative px-6 py-7 text-left sm:px-8 sm:py-8 lg:px-10 lg:py-10">
            <div className="absolute -left-14 top-10 h-32 w-32 rounded-full bg-white/6 blur-3xl" />
            <div className="relative">
              <div className="inline-flex items-center rounded-full border border-sky-200/30 bg-sky-400/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-100">
                Match Ended
              </div>
              <h1 className="mt-5 max-w-2xl break-words text-4xl font-black uppercase tracking-[0.08em] text-white sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                {message}
              </p>
            </div>
          </section>

          <aside className="flex flex-col justify-center border-t border-white/10 bg-black/16 px-6 py-7 text-left sm:px-8 sm:py-8 md:border-l md:border-t-0 lg:px-9">
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/65">Continue</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              You can return to the lobby, open the replay, or stay here for a last look at the final board.
            </p>

            <div className={`mt-5 rounded-[1.25rem] border px-4 py-3 text-sm ${rematchStatus.className}`}>
              <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${rematchStatus.accentClassName}`}>
                {rematchStatus.label}
              </div>
              <div className="mt-1 leading-6">
                {rematchStatus.message}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {reviewGameHref && (
                <a
                  href={reviewGameHref}
                  onClick={onReviewGame}
                  className="block w-full rounded-2xl border border-sky-200/25 bg-sky-950/55 px-5 py-4 text-center text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-sky-950/80"
                >
                  Review Game
                </a>
              )}
              <button
                onClick={onReturnToLobby}
                className="w-full rounded-2xl border border-white/15 px-5 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/10"
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

export default SpectatorFinishedScreen
