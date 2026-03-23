import type { LobbyOptions, PlayerNames } from '@ih3t/shared'
import { formatTimeControl } from '../utils/gameTimeControl'
import ScreenFooter from './ScreenFooter'

interface WaitingScreenProps {
  sessionId: string
  playerCount: number
  playerNames: PlayerNames
  lobbyOptions: LobbyOptions
  onInviteFriend: () => void
  onCancel: () => void
}

function WaitingScreen({ sessionId, playerCount, playerNames, lobbyOptions, onInviteFriend, onCancel }: Readonly<WaitingScreenProps>) {
  const currentPlayerName = Object.values(playerNames)[0] ?? 'Player 1'

  return (
    <div className="max-w-[92rem] mx-auto flex flex-1 flex-col px-4 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex gap-4 flex-col lg:flex-row lg:gap-8 lg:min-h-0 h-full flex-1 mt-4 lg:mt-[8vh]">
        <section className="hidden w-full xl:flex relative rounded-[1.75rem] border-white/10 bg-white/6 p-6 sm:min-h-[34rem] sm:rounded-[2rem] sm:p-8 md:p-10 sm:h-[34rem]">
          <div className="relative flex flex-1 flex-col justify-center">
            <div className="self-start inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-amber-100 sm:px-4 sm:text-xs sm:tracking-[0.35em]">
              Two Players
            </div>
            <h1 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:mt-6 sm:text-5xl lg:text-6xl">
              Infinity
              <br />
              Hexagonal
              <br />
              Tic-Tac-Toe
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-200 sm:mt-6 sm:text-base sm:leading-7 lg:text-lg">
              Place your hexes on an infinite board, outmaneuver your opponent, and be the first to align six in a row.
            </p>
          </div>
        </section>

        <section className="w-full relative flex h-[43rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/8 p-6 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[2rem] sm:p-8 md:p-10">
          <div className="relative flex flex-1 flex-col justify-center">
            <div className={`mx-auto inline-flex items-center rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] ${lobbyOptions.visibility === 'private'
              ? 'border-amber-300/40 bg-amber-300/10 text-amber-100'
              : 'border-sky-300/35 bg-sky-300/10 text-sky-100'
              }`}>
              {lobbyOptions.visibility === 'private' ? 'Private Lobby' : 'Public Lobby'}
            </div>
            <h2 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:mt-6 sm:text-5xl">
              Waiting For
              <br />
              Another Player
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base sm:leading-7">
              {lobbyOptions.visibility === 'private'
                ? 'Keep this session open and share the invite link with the player you want to join. The match will launch automatically once they arrive.'
                : 'Keep this session open. As soon as the second player joins, the match will launch automatically.'}
            </p>

            <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Session ID</div>
                <div className="mt-2 break-all text-2xl font-bold text-amber-200 sm:text-3xl">{sessionId}</div>
              </div>
              <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Time Control</div>
                <div className="mt-2 break-words text-xl font-bold leading-tight text-white sm:text-2xl">{formatTimeControl(lobbyOptions.timeControl)}</div>
              </div>
              <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:col-span-2 sm:rounded-3xl sm:p-5">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Hosting As</div>
                <div className="mt-2 break-words text-xl font-bold leading-tight text-white sm:text-2xl">{currentPlayerName}</div>
                <div className="mt-1 text-sm text-slate-400">Players ready: {playerCount}/2</div>
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
  )
}

export default WaitingScreen
