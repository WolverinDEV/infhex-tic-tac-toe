import type { SessionInfo, ShutdownState } from '@ih3t/shared'
import { useEffect, useState } from 'react'
import ScreenFooter from './ScreenFooter'

interface LobbyScreenProps {
  isConnected: boolean
  shutdown: ShutdownState | null
  liveSessions: SessionInfo[]
  onHostGame: () => void
  onJoinGame: (sessionId: string) => void
  onViewFinishedGames: () => void
}

function formatLiveDuration(startedAt: number | null, now: number) {
  if (!startedAt) {
    return null
  }

  const totalSeconds = Math.max(0, Math.round((now - startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function LobbyScreen({
  isConnected,
  shutdown,
  liveSessions,
  onHostGame,
  onJoinGame,
  onViewFinishedGames
}: LobbyScreenProps) {
  const isHostingDisabled = !isConnected || Boolean(shutdown)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.22),_transparent_30%),linear-gradient(135deg,_#111827,_#0f172a_45%,_#1e293b)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8">
          <section className="relative flex sm:min-h-[34rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[2rem] sm:p-8 md:p-10">
            <div className="absolute -right-10 -top-12 hidden h-36 w-36 rounded-full bg-amber-300/20 blur-3xl sm:block" />
            <div className="absolute bottom-0 left-0 hidden h-32 w-32 rounded-full bg-sky-400/20 blur-3xl sm:block" />

            <div className="relative flex flex-1 flex-col justify-center">
              <div className="self-start inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-amber-100 sm:px-4 sm:text-xs sm:tracking-[0.35em]">
                Two Players
              </div>
              <h1 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:mt-6 sm:text-5xl lg:text-6xl">
                Infinity
                <br />
                Hexagonial
                <br />
                Tic-Tac-Toe
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-6 text-slate-200 sm:mt-6 sm:text-base sm:leading-7 lg:text-lg">
                Place your hexes on an infinite board, outmaneuver your opponent, and be the first to align six in a row.
              </p>

              <div className="mt-6 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap sm:gap-4">
                <button
                  onClick={onHostGame}
                  disabled={isHostingDisabled}
                  className={`rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] transition sm:px-7 sm:text-base sm:tracking-[0.18em] ${!isHostingDisabled
                    ? 'bg-amber-300 text-slate-900 shadow-[0_10px_35px_rgba(251,191,36,0.35)] hover:-translate-y-0.5 hover:bg-amber-200'
                    : 'cursor-not-allowed bg-slate-500/60 text-slate-200'
                    }`}
                >
                  {shutdown ? 'Shutdown Pending' : 'Host Match'}
                </button>
                <button
                  onClick={onViewFinishedGames}
                  className="rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-white/16 sm:px-7 sm:text-base sm:tracking-[0.18em]"
                >
                  Review Matches
                </button>
                {!isConnected && (
                  <div className="inline-flex items-center rounded-full border border-rose-300/40 bg-rose-300/10 px-4 py-3 text-sm font-medium text-rose-100">
                    Not connected to server
                  </div>
                )}
                {shutdown && (
                  <div className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
                    New matches are disabled until the shutdown completes.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="min-h-[22rem] sm:min-h-[34rem] rounded-[2rem] border border-white/10 sm:bg-slate-950/55 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-sky-200/80">Live Sessions</p>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Lobbies and Live Games</h2>
              </div>
              <div className="rounded-2xl bg-white/5 px-3 py-2 text-right sm:px-4 sm:py-3">
                <div className="text-2xl font-bold text-white">{liveSessions.length}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Live Now</div>
              </div>
            </div>

            <div className="mt-5 space-y-3 sm:mt-6">
              {liveSessions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center text-slate-300">
                  <p className="text-lg font-semibold text-white">No live sessions are available right now.</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Create a new match and the lobby list will update for everyone automatically.</p>
                </div>
              ) : (
                liveSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-white/6 p-4 shadow-lg sm:rounded-3xl sm:p-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-sky-200/75 sm:text-xs sm:tracking-[0.28em]">Session</div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${session.canJoin
                          ? 'bg-emerald-400/15 text-emerald-200'
                          : 'bg-sky-400/15 text-sky-200'
                          }`}>
                          {session.canJoin ? 'Open Lobby' : 'Active Game'}
                        </span>
                      </div>
                      <div className="mt-2 break-all text-xl font-bold text-white sm:text-2xl">{session.id}</div>
                      {session.canJoin && (
                        <div className="mt-2 text-sm text-slate-300">Players waiting: ${session.playerCount}/${session.maxPlayers}</div>
                      )}
                      {!session.canJoin && session.startedAt && (
                        <div className="mt-1 text-sm text-slate-400">
                          In game for {formatLiveDuration(session.startedAt, now)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onJoinGame(session.id)}
                      disabled={!isConnected}
                      className={`rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition lg:shrink-0 ${!isConnected
                        ? 'cursor-not-allowed bg-slate-500/60 text-slate-200'
                        : session.canJoin
                          ? 'bg-sky-400 text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.28)] hover:-translate-y-0.5 hover:bg-sky-300'
                          : 'border border-white/15 bg-white/8 text-white hover:-translate-y-0.5 hover:bg-white/14'
                        }`}
                    >
                      {session.canJoin ? 'Join Lobby' : 'Spectate'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <ScreenFooter />
      </div>
    </div>
  )
}

export default LobbyScreen
