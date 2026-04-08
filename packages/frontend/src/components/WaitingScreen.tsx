import type { LobbyOptions, MatchClaimWinState, SessionTournamentInfo } from '@ih3t/shared';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { useLiveGameStore } from '../liveGameStore';
import { claimMatchWin, requestMatchExtension } from '../query/tournamentClient';
import { formatTimeControl } from '../utils/gameTimeControl';
import ScreenFooter from './ScreenFooter';

type WaitingScreenProps = {
    sessionId: string
    playerCount: number
    localPlayerName: string,
    gameOptions: LobbyOptions
    tournament: SessionTournamentInfo | null
    onInviteFriend: () => void
    onPlayOffline?: () => void
    onCancel: () => void
};

function useCountdown(targetMs: number | null): number | null {
    const [remaining, setRemaining] = useState<number | null>(() => {
        if (targetMs === null) return null;
        return Math.max(0, targetMs - Date.now());
    });

    useEffect(() => {
        if (targetMs === null) {
            setRemaining(null);
            return;
        }

        const tick = () => {
            const r = Math.max(0, targetMs - Date.now());
            setRemaining(r);
        };

        tick();
        const interval = setInterval(tick, 250);
        return () => clearInterval(interval);
    }, [targetMs]);

    return remaining;
}

function formatCountdown(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, `0`)}`;
}

function TournamentTimerSection({
    tournament,
    claimWinState,
    opponentName,
}: {
    tournament: SessionTournamentInfo
    claimWinState: MatchClaimWinState | null
    opponentName: string | null
}) {
    const hasTimeout = tournament.matchJoinTimeoutMs > 0;
    const joinDeadline = hasTimeout ? tournament.matchStartedAt + tournament.matchJoinTimeoutMs : null;
    const joinRemaining = useCountdown(joinDeadline);
    const claimRemaining = useCountdown(claimWinState?.expiresAt ?? null);
    const [isClaimPending, setIsClaimPending] = useState(false);
    const [isExtensionPending, setIsExtensionPending] = useState(false);
    const extensionMinutes = Math.round(tournament.matchExtensionMs / 60_000);

    const isTimedOut = hasTimeout && joinRemaining !== null && joinRemaining <= 0;
    const hasActiveClaim = claimWinState !== null;

    if (!hasTimeout) {
        return null;
    }

    const handleClaimWin = async () => {
        try {
            setIsClaimPending(true);
            await claimMatchWin(tournament.tournamentId, tournament.matchId);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : `Failed to claim win.`;
            toast.error(message, { toastId: `claim-win-error` });
        } finally {
            setIsClaimPending(false);
        }
    };

    const handleRequestExtension = async () => {
        try {
            setIsExtensionPending(true);
            await requestMatchExtension(tournament.tournamentId, tournament.matchId);
            toast.success(`Extension requested. Waiting for organizer approval.`, { toastId: `extension-requested` });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : `Failed to request extension.`;
            toast.error(message, { toastId: `extension-error` });
        } finally {
            setIsExtensionPending(false);
        }
    };

    if (hasActiveClaim && claimRemaining !== null) {
        const claimSeconds = Math.ceil(claimRemaining / 1000);
        return (
            <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-4 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-200/80">
                    Claiming Win
                </div>
                <div className="mt-2 text-3xl font-black tabular-nums text-rose-100">
                    {claimSeconds}s
                </div>
                <p className="mt-1 text-xs text-rose-200/70">
                    {opponentName ?? `Opponent`} has {claimSeconds} second{claimSeconds !== 1 ? `s` : ``} to join before the match is forfeited.
                </p>
            </div>
        );
    }

    if (isTimedOut) {
        return (
            <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-4 text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                        Join Timer Expired
                    </div>
                    <p className="mt-2 text-sm text-amber-100/80">
                        {opponentName ?? `Your opponent`} did not join in time.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => void handleClaimWin()}
                    disabled={isClaimPending}
                    className="w-full rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
                >
                    {isClaimPending ? `Claiming...` : `Claim Win`}
                </button>

                <button
                    type="button"
                    onClick={() => void handleRequestExtension()}
                    disabled={isExtensionPending}
                    className="w-full rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-60"
                >
                    {isExtensionPending ? `Requesting...` : `Request Extension (+${extensionMinutes} min)`}
                </button>
            </div>
        );
    }

    return (
        <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                    {opponentName ? `${opponentName} Must Join Within` : `Opponent Must Join Within`}
                </div>
                <div className="mt-2 text-3xl font-black tabular-nums text-white">
                    {joinRemaining !== null ? formatCountdown(joinRemaining) : `--:--`}
                </div>
            </div>

            <button
                type="button"
                onClick={() => void handleRequestExtension()}
                disabled={isExtensionPending}
                className="w-full rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-60"
            >
                {isExtensionPending ? `Requesting...` : `Request Extension`}
            </button>
        </div>
    );
}

function WaitingScreen({
    sessionId,
    playerCount,
    localPlayerName,
    gameOptions,
    tournament,
    onInviteFriend,
    onPlayOffline,
    onCancel,
}: Readonly<WaitingScreenProps>) {
    const isTournament = tournament !== null;
    const claimWinState = useLiveGameStore((s) => s.claimWinState);
    const opponentName = isTournament
        ? (tournament.leftDisplayName === localPlayerName ? tournament.rightDisplayName : tournament.leftDisplayName)
        : null;
    const showOfflinePlayButton = !isTournament && gameOptions.visibility === `public` && playerCount < 2 && Boolean(onPlayOffline);

    return (
        <div className="max-w-368 mx-auto flex flex-1 flex-col px-4 py-4 text-white sm:px-6 sm:py-6">
            <div className="mx-auto flex gap-4 flex-col lg:flex-row lg:gap-8 lg:min-h-0 h-full flex-1 mt-4 lg:mt-[8vh]">
                <section className="hidden w-full xl:flex relative rounded-[1.75rem] p-6 sm:min-h-136 sm:rounded-4xl sm:p-8 md:p-10 sm:h-136">
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

                <section className="w-full relative flex min-h-[43rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/8 p-6 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[2rem] sm:p-8 md:p-10">
                    <div className="relative flex flex-1 flex-col justify-center">
                        {isTournament ? (
                            <div className="mx-auto inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-100">
                                Tournament Match
                            </div>
                        ) : (
                            <div className={`mx-auto inline-flex items-center rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] ${gameOptions.visibility === `private`
                                ? `border-amber-300/40 bg-amber-300/10 text-amber-100`
                                : `border-sky-300/35 bg-sky-300/10 text-sky-100`
                            }`}
                            >
                                {gameOptions.visibility === `private` ? `Private Lobby` : `Public Lobby`}
                            </div>
                        )}

                        <h2 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:mt-6 sm:text-5xl">
                            Waiting For
                            <br />
                            {isTournament ? (opponentName ?? `Opponent`) : `Another Player`}
                        </h2>

                        <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base sm:leading-7">
                            {isTournament
                                ? `Your opponent has been notified. The match will start automatically once they join.`
                                : gameOptions.visibility === `private`
                                    ? `Keep this session open and share the invite link with the player you want to join. The match will launch automatically once they arrive.`
                                    : `Keep this session open. As soon as the second player joins, the match will launch automatically.`}
                        </p>

                        <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2">
                            {isTournament ? (
                                <>
                                    <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                                        <div className="text-xs uppercase tracking-[0.28em] text-slate-300">
                                            Tournament
                                        </div>
                                        <div className="mt-2 break-words text-lg font-bold leading-tight text-white">
                                            {tournament.tournamentName}
                                        </div>
                                    </div>
                                    <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                                        <div className="text-xs uppercase tracking-[0.28em] text-slate-300">
                                            Time Control
                                        </div>
                                        <div className="mt-2 break-words text-xl font-bold leading-tight text-white sm:text-2xl">
                                            {formatTimeControl(gameOptions.timeControl)}
                                        </div>
                                        <div className="mt-1 whitespace-nowrap text-sm tabular-nums text-slate-400">
                                            {tournament.bracket.replace(/-/g, ` `)} R{tournament.round} · BO{tournament.bestOf} · Game {tournament.currentGameNumber} · Score {tournament.leftWins}‑{tournament.rightWins}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                                        <div className="text-xs uppercase tracking-[0.28em] text-slate-300">
                                            Session ID
                                        </div>
                                        <div className="mt-2 break-all text-2xl font-bold text-amber-200 sm:text-3xl">
                                            {sessionId}
                                        </div>
                                    </div>
                                    <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 sm:rounded-3xl sm:p-5">
                                        <div className="text-xs uppercase tracking-[0.28em] text-slate-300">
                                            Time Control
                                        </div>
                                        <div className="mt-2 break-words text-xl font-bold leading-tight text-white sm:text-2xl">
                                            {formatTimeControl(gameOptions.timeControl)}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:col-span-2 sm:rounded-3xl sm:p-5">
                                <div className="text-xs uppercase tracking-[0.28em] text-slate-300">
                                    {isTournament ? `Playing As` : `Hosting As`}
                                </div>

                                <div className="mt-2 wrap-break-word text-xl font-bold leading-tight text-white sm:text-2xl">
                                    {localPlayerName}
                                </div>

                                <div className="mt-1 text-sm text-slate-400">
                                    Players ready: {playerCount}/2
                                </div>
                            </div>
                        </div>

                        {isTournament && playerCount < 2 && (
                            <TournamentTimerSection
                                tournament={tournament}
                                claimWinState={claimWinState}
                                opponentName={opponentName}
                            />
                        )}

                        {!isTournament && (
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

                                {showOfflinePlayButton && (
                                    <button
                                        onClick={onPlayOffline}
                                        className="rounded-full border border-emerald-300/35 bg-emerald-400/12 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-50 transition hover:-translate-y-0.5 hover:bg-emerald-400/20"
                                    >
                                        Play Offline Vs Bot
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <ScreenFooter />
        </div>
    );
}

export default WaitingScreen;
