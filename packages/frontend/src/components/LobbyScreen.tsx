import type { AccountProfile, CreateSessionRequest, LobbyInfo, ShutdownState } from '@ih3t/shared';
import { useEffect, useState } from 'react';

import { useSsrCompatibleNow } from '../ssrState';
import { useHydratedDelay } from '../useHydratedDelay';
import CreateLobbyDialog from './CreateLobbyDialog';
import ShutdownTimer from './game-screen/ShutdownTimer';
import PublicMatchesList from './PublicMatchesList';
import ScreenFooter from './ScreenFooter';

type LobbyScreenProps = {
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
    onViewTournaments: () => void
    onViewChangelog: () => void
    onViewOwnFinishedGames: () => void
};

function ChangelogLinkIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current">
            <path d="M4.5 8h7" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M8.8 4.7 12.1 8l-3.3 3.3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
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
    onViewTournaments,
}: Readonly<LobbyScreenProps>) {
    const isPlayingDisabled = !isConnected || Boolean(shutdown);
    const [now, setNow] = useState(useSsrCompatibleNow());
    const [isCreateLobbyDialogOpen, setIsCreateLobbyDialogOpen] = useState(false);
    const showClientBadges = useHydratedDelay(500);

    useEffect(() => {
        const interval = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <div className="flex grow sm:h-full flex-col px-4 py-4 text-white sm:px-6 sm:py-6">
            <CreateLobbyDialog
                isOpen={isCreateLobbyDialogOpen}
                onClose={() => setIsCreateLobbyDialogOpen(false)}
                account={account}
                onCreateLobby={onHostGame}
            />

            <div className="relative z-10 mt-4 xl:mt-[7vh] flex sm:min-h-230 w-full flex-1 flex-col xl:flex-row items-stretch justify-center self-center gap-5 md:gap-8">
                <section className="relative flex max-w-xl w-full xl:w-[40%] rounded-[1.75rem] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.28)] sm:rounded-4xl sm:p-5 md:p-6 xl:min-w-130">
                    <div className="relative flex flex-1 flex-col justify-start">
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
                                    ? `cursor-pointer bg-amber-300 text-slate-900 shadow-[0_10px_35px_rgba(251,191,36,0.35)] hover:-translate-y-0.5 hover:bg-amber-200`
                                    : `cursor-not-allowed bg-slate-500/60 text-slate-200`
                                    }`}
                            >
                                {shutdown ? `Restart Pending` : `Host Match`}
                            </button>

                            <div className="grid gap-4 sm:grid-cols-2">
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

                                <button
                                    onClick={onViewTournaments}
                                    className="w-full cursor-pointer block rounded-full border border-amber-300/25 bg-amber-300/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:-translate-y-0.5 hover:bg-amber-300/20 sm:px-7 sm:text-base sm:tracking-[0.18em]"
                                >
                                    Tournaments
                                </button>
                            </div>

                            {showClientBadges && !isConnected && (
                                <div className="inline-flex items-center rounded-full border text-center border-rose-300/40 bg-rose-300/10 px-4 py-3 text-sm font-medium text-rose-100">
                                    Not connected to server
                                </div>
                            )}

                            {showClientBadges && shutdown && (
                                <div className="inline-flex items-center rounded-full border text-center border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
                                    <span>
                                        New matches are disabled until the restart completes.
                                    </span>

                                    <span>
                                        &nbsp;
                                        (
                                        <ShutdownTimer shutdown={shutdown} />
                                        ).
                                    </span>
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
                                        {unreadChangelogEntries}
                                        {` new feature`}
                                        {unreadChangelogEntries === 1 ? `` : `s`}
                                        {` `}
                                        dropped
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

                <PublicMatchesList
                    liveSessions={liveSessions}
                    now={now}
                    isConnected={isConnected}
                    account={account}
                    isAccountLoading={isAccountLoading}
                    onJoinGame={onJoinGame}
                    className="lg:col-span-7"
                />
            </div>

            <ScreenFooter />
        </div >
    );
}

export default LobbyScreen;
