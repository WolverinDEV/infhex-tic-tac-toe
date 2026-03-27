import type { AccountProfile, CreateSessionRequest, LobbyInfo, ShutdownState } from '@ih3t/shared'
import { useEffect, useState } from 'react'
import { formatTimeControl } from '../utils/gameTimeControl'
import { formatLobbyLiveDuration, formatLobbyPlayers } from '../utils/lobby'
import CreateLobbyDialog from './CreateLobbyDialog'
import { useSsrCompatibleNow } from '../ssrState'
import ScreenFooter from './ScreenFooter'
import { useHydratedDelay } from '../useHydratedDelay'
import ShutdownTimer from './game-screen/ShutdownTimer'

interface LobbyScreenProps {
    isConnected: boolean
    shutdown: ShutdownState | null
    account: AccountProfile | null
    isAccountLoading: boolean
    liveSessions: LobbyInfo[]
    unreadChangelogEntries: number
    onHostGame: (request: CreateSessionRequest) => void
    onJoinGame: (sessionId: string) => void
    onOpenSandbox: () => void
    onViewFinishedGames: () => void
    onViewLeaderboard: () => void
    onViewChangelog: () => void
    onViewOwnFinishedGames: () => void
}

function ClockBadgeIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current">
            <circle cx="8" cy="8" r="5.25" strokeWidth="1.5" />
            <path d="M8 5.2v3.2l2.1 1.25" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function ModeBadgeIcon({ rated }: Readonly<{ rated: boolean }>) {
    return rated ? (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
            <path d="M8 1.9l1.7 3.46 3.82.56-2.76 2.69.65 3.8L8 10.59 4.6 12.4l.65-3.8L2.5 5.92l3.8-.56L8 1.9Z" />
        </svg>
    ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current">
            <circle cx="8" cy="8" r="4.75" strokeWidth="1.5" />
            <path d="M5 8h6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
}

function ChangelogLinkIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current">
            <path d="M4.5 8h7" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M8.8 4.7 12.1 8l-3.3 3.3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function LobbyScreen({
    isConnected,
    shutdown,
    account,
    isAccountLoading,
    liveSessions,
    unreadChangelogEntries,
    onHostGame,
    onJoinGame,
    onOpenSandbox,
    onViewChangelog,
    onViewLeaderboard,
}: Readonly<LobbyScreenProps>) {
    const isPlayingDisabled = !isConnected || Boolean(shutdown)
    const [now, setNow] = useState(useSsrCompatibleNow())
    const [isCreateLobbyDialogOpen, setIsCreateLobbyDialogOpen] = useState(false)
    const showClientBadges = useHydratedDelay(500)

    useEffect(() => {
        setNow(Date.now())
        const interval = window.setInterval(() => {
            setNow(Date.now())
        }, 1000)

        return () => window.clearInterval(interval)
    }, [])

    const canJoinSession = (session: LobbyInfo) => session.startedAt === null && session.players.length < 2
    const isJoinBlockedForGuest = (session: LobbyInfo) => session.rated && !account
    const isJoinBlockedForOwnRatedSeat = (session: LobbyInfo) =>
        session.rated
        && canJoinSession(session)
        && Boolean(account?.id)
        && session.players.some((player) => player.profileId === account?.id)

    const getJoinButtonLabel = (session: LobbyInfo) => {
        if (isJoinBlockedForGuest(session)) {
            return isAccountLoading ? 'Checking Account' : 'Sign In Required'
        }

        if (isJoinBlockedForOwnRatedSeat(session)) {
            return 'Already Joined'
        }

        return canJoinSession(session) ? 'Join Lobby' : 'Spectate'
    }

    const isJoinButtonDisabled = (session: LobbyInfo) =>
        !isConnected || isJoinBlockedForGuest(session) || isJoinBlockedForOwnRatedSeat(session)

    return (
        <div className="flex flex-1 flex-col px-4 py-4 text-white sm:px-6 sm:py-6">
            <CreateLobbyDialog
                isOpen={isCreateLobbyDialogOpen}
                onClose={() => setIsCreateLobbyDialogOpen(false)}
                account={account}
                onCreateLobby={onHostGame}
            />
            <div className="mx-auto gap-4 lg:gap-8 lg:min-h-0 h-full flex-1 mt-4 lg:mt-[8vh] flex flex-col lg:grid lg:grid-cols-2">
                <section className="max-w-xl relative flex rounded-[1.75rem]p-6 sm:min-h-136 sm:rounded-4xl sm:p-8 md:p-10 sm:h-136">
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

                        <div className="mt-6 flex flex-col gap-4">
                            <button
                                onClick={() => setIsCreateLobbyDialogOpen(true)}
                                disabled={isPlayingDisabled}
                                className={`sm:col-span-2 rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] transition sm:px-7 sm:text-base sm:tracking-[0.18em] ${!isPlayingDisabled
                                    ? 'cursor-pointer bg-amber-300 text-slate-900 shadow-[0_10px_35px_rgba(251,191,36,0.35)] hover:-translate-y-0.5 hover:bg-amber-200'
                                    : 'cursor-not-allowed bg-slate-500/60 text-slate-200'
                                    }`}
                            >
                                {shutdown ? 'Restart Pending' : 'Host Match'}
                            </button>
                            <div className={"flex flex-col sm:flex-row gap-4 lg:hidden"}>
                                <button
                                    onClick={onOpenSandbox}
                                    className="w-full cursor-pointer rounded-full border border-emerald-300/25 bg-emerald-400/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-400/18 sm:px-7 sm:text-base sm:tracking-[0.18em]"
                                >
                                    Sandbox Mode
                                </button>
                                <button
                                    onClick={onViewLeaderboard}
                                    className="w-full cursor-pointer block rounded-full border border-sky-300/25 bg-sky-400/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-sky-100 transition hover:-translate-y-0.5 hover:bg-sky-400/20 sm:px-7 sm:text-base sm:tracking-[0.18em]"
                                >
                                    Leaderboard
                                </button>
                            </div>
                            {showClientBadges && !isConnected && (
                                <div className="inline-flex items-center rounded-full border text-center border-rose-300/40 bg-rose-300/10 px-4 py-3 text-sm font-medium text-rose-100">
                                    Not connected to server
                                </div>
                            )}
                            {showClientBadges && shutdown && (
                                <div className="inline-flex items-center rounded-full border text-center border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
                                    New matches are disabled until the restart completes (<ShutdownTimer shutdown={shutdown} />).
                                </div>
                            )}
                        </div>

                        {unreadChangelogEntries > 0 && (
                            <button
                                type="button"
                                onClick={onViewChangelog}
                                className="mt-5 self-start inline-flex items-center gap-3 rounded-2xl border border-sky-300/25 bg-sky-400/10 px-4 py-3 text-left text-sm text-sky-100 transition hover:-translate-y-0.5 hover:border-sky-200/35 hover:bg-sky-400/18 hover:text-white"
                            >
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.6)]" />
                                <span className="flex flex-col">
                                    <span className="font-semibold">
                                        {unreadChangelogEntries} new feature{unreadChangelogEntries === 1 ? '' : 's'} dropped
                                    </span>
                                    <span className="text-xs uppercase tracking-[0.18em] text-sky-200/85">
                                        View changelog
                                    </span>
                                </span>
                                <span className="ml-1 shrink-0 text-sky-200/85">
                                    <ChangelogLinkIcon />
                                </span>
                            </button>
                        )}
                    </div>

                </section>

                <section className="max-w-xl rounded-4xl border border-white/10 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:min-h-136 sm:h-136 sm:bg-slate-950/55 md:p-8 sm:flex sm:flex-col">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm uppercase tracking-[0.3em] text-sky-200/80">Live Sessions</p>
                            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Public Matches</h2>
                        </div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2 text-right sm:px-4 sm:py-3">
                            <div className="text-2xl font-bold text-white">{liveSessions.length}</div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Live Now</div>
                        </div>
                    </div>

                    <div className="mt-5 sm:mt-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain sm:pr-1">
                        {liveSessions.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center text-slate-300">
                                <p className="text-lg font-semibold text-white">No live sessions are available right now.</p>
                                <p className="mt-2 text-sm leading-6 text-slate-400">Create a new match and the lobby list will update for everyone automatically.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {liveSessions.map((session) => {
                                    const canJoin = canJoinSession(session)
                                    return (
                                        <div
                                            key={session.id}
                                            className="flex flex-col flex-wrap gap-2 rounded-3xl border border-white/10 bg-white/6 p-4 shadow-lg sm:rounded-3xl sm:p-5"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${canJoin
                                                    ? 'bg-emerald-400/15 text-emerald-200'
                                                    : 'bg-sky-400/15 text-sky-200'
                                                    }`}>
                                                    {canJoin ? 'Open Lobby' : 'Active Game'}
                                                </span>
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${session.rated
                                                    ? 'bg-amber-300/15 text-amber-100'
                                                    : 'bg-white/8 text-slate-200'
                                                    }`}>
                                                    <ModeBadgeIcon rated={session.rated} />
                                                    {session.rated ? 'Rated' : 'Unrated'}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                                                    <ClockBadgeIcon />
                                                    {formatTimeControl(session.timeControl)}
                                                </span>
                                            </div>
                                            <div
                                                className="flex sm:flex-row gap-4 flex-col sm:items-center justify-between"
                                            >
                                                <div className="min-w-0 mt-2 ">
                                                    <div className="break-all text-xl font-bold text-white sm:text-2xl">{session.id}</div>
                                                    <div className="text-sm text-slate-400">
                                                        {formatLobbyPlayers(session.players, session.rated)}
                                                    </div>
                                                    {!canJoin && session.startedAt && (
                                                        <div className="text-sm text-slate-400">
                                                            In game for {formatLobbyLiveDuration(session.startedAt, now)}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => onJoinGame(session.id)}
                                                    disabled={isJoinButtonDisabled(session)}
                                                    className={`rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition lg:shrink-0 ${isJoinButtonDisabled(session)
                                                        ? 'cursor-not-allowed bg-slate-500/60 text-slate-200'
                                                        : canJoin
                                                            ? 'bg-sky-400 text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.28)] hover:-translate-y-0.5 hover:bg-sky-300'
                                                            : 'border border-white/15 bg-white/8 text-white hover:-translate-y-0.5 hover:bg-white/14'
                                                        }`}
                                                >
                                                    {getJoinButtonLabel(session)}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <ScreenFooter />
        </div >
    )
}

export default LobbyScreen
