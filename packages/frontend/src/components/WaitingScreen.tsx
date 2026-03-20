import ScreenFooter from './ScreenFooter'

interface WaitingScreenProps {
  sessionId: string
  playerCount: number
  onInviteFriend: () => void
  onCancel: () => void
}

function WaitingScreen({ sessionId, playerCount, onInviteFriend, onCancel }: Readonly<WaitingScreenProps>) {
  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.22),_transparent_30%),linear-gradient(135deg,_#111827,_#0f172a_45%,_#1e293b)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch lg:gap-8">
          <section className="relative hidden min-h-[34rem] overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:flex md:p-10">
            <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-sky-400/20 blur-3xl" />

            <div className="relative flex flex-1 flex-col justify-center">
              <div className="self-start inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-1 text-xs uppercase tracking-[0.35em] text-amber-100">
                Matchmaking
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
            </div>
          </section>

          <section className="relative flex min-h-[34rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/8 p-6 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[2rem] sm:p-8 md:p-10">
            <div className="absolute -left-6 top-8 hidden h-24 w-24 rounded-full bg-sky-400/25 blur-2xl sm:block" />
            <div className="absolute -right-6 bottom-8 hidden h-28 w-28 rounded-full bg-amber-300/20 blur-2xl sm:block" />

            <div className="relative flex flex-1 flex-col justify-center">
              <h2 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:mt-6 sm:text-5xl">
                Waiting For
                <br />
                Another Player
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base sm:leading-7">
                Keep this session open. As soon as the second player joins, the match will launch automatically.
              </p>

              <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4">
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Session ID</div>
                  <div className="mt-2 break-all text-2xl font-bold text-amber-200 sm:text-3xl">{sessionId}</div>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Players Ready</div>
                  <div className="mt-2 text-2xl font-bold text-white sm:text-3xl">{playerCount}/2</div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap sm:justify-center">
                <button
                  onClick={onInviteFriend}
                  className="rounded-full bg-sky-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300"
                >
                  Invite Friend
                </button>
                <button
                  onClick={onCancel}
                  className="rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-rose-400"
                >
                  Cancel Lobby
                </button>
              </div>
            </div>
          </section>
        </div>

        <ScreenFooter />
      </div>
    </div>
  )
}

export default WaitingScreen
