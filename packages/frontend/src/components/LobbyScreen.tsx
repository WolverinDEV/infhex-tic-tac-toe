import type { SessionInfo, ShutdownState } from '@ih3t/shared'
import ScreenFooter from './ScreenFooter'

interface LobbyScreenProps {
  isConnected: boolean
  shutdown: ShutdownState | null
  availableSessions: SessionInfo[]
  onHostGame: () => void
  onJoinGame: (sessionId: string) => void
  onViewFinishedGames: () => void
}

function LobbyScreen({
  isConnected,
  shutdown,
  availableSessions,
  onHostGame,
  onJoinGame,
  onViewFinishedGames
}: LobbyScreenProps) {
  const isHostingDisabled = !isConnected || Boolean(shutdown)

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.22),_transparent_30%),linear-gradient(135deg,_#111827,_#0f172a_45%,_#1e293b)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <section className="relative flex min-h-[34rem] overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur md:p-10">
            <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-sky-400/20 blur-3xl" />

            <div className="relative flex flex-1 flex-col justify-center">
              <div className="self-start inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-1 text-xs uppercase tracking-[0.35em] text-amber-100">
                Two Players
              </div>
              <h1 className="mt-6 text-4xl font-black uppercase tracking-[0.08em] text-white sm:text-6xl">
                Infinity
                <br />
                Hexagonial
                <br />
                Tic-Tac-Toe
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-200 sm:text-lg">
                Place your hexes on an infinite board, outmaneuver your opponent, and be the first to align six in a row.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={onHostGame}
                  disabled={isHostingDisabled}
                  className={`rounded-full px-7 py-3 text-base font-semibold uppercase tracking-[0.18em] transition ${!isHostingDisabled
                    ? 'bg-amber-300 text-slate-900 shadow-[0_10px_35px_rgba(251,191,36,0.35)] hover:-translate-y-0.5 hover:bg-amber-200'
                    : 'cursor-not-allowed bg-slate-500/60 text-slate-200'
                    }`}
                >
                  {shutdown ? 'Shutdown Pending' : 'Host Match'}
                </button>
                <button
                  onClick={onViewFinishedGames}
                  className="rounded-full border border-white/20 bg-white/10 px-7 py-3 text-base font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/16"
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

          <section className="min-h-[34rem] rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-sky-200/80">Available Sessions</p>
                <h2 className="mt-2 text-3xl font-bold text-white">Join a live lobby</h2>
              </div>
              <div className="rounded-2xl bg-white/5 px-4 py-3 text-right">
                <div className="text-2xl font-bold text-white">{availableSessions.length}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Open Games</div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {availableSessions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center text-slate-300">
                  <p className="text-lg font-semibold text-white">No sessions are open right now.</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Create a new match and the lobby list will update for everyone automatically.</p>
                </div>
              ) : (
                availableSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/6 p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-xs uppercase tracking-[0.28em] text-sky-200/75">Session</div>
                      <div className="mt-2 text-2xl font-bold text-white">{session.id}</div>
                      <div className="mt-2 text-sm text-slate-300">Players waiting: {session.playerCount}/2</div>
                    </div>
                    <button
                      onClick={() => onJoinGame(session.id)}
                      disabled={!isConnected}
                      className={`rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition ${isConnected
                        ? 'bg-sky-400 text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.28)] hover:-translate-y-0.5 hover:bg-sky-300'
                        : 'cursor-not-allowed bg-slate-500/60 text-slate-200'
                        }`}
                    >
                      Join Lobby
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
