import type { TournamentDetail, TournamentExtensionRequest, TournamentMatch, TournamentParticipant, TournamentStanding } from '@ih3t/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';

import PageCorpus from '../components/PageCorpus';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import TournamentEditorCard, { buildCreateTournamentRequestFromDetail } from '../components/TournamentEditorCard';
import { useQueryAccount } from '../query/accountClient';
import { devResolveAll, devResolveCurrentRound, devResolveN, seedTournamentWithDevUsers } from '../query/devAuthClient';
import {
    addToAccessList,
    addTournamentParticipant,
    bulkAddToAccessList,
    awardTournamentWalkover,
    cancelTournament,
    checkInTournament,

    grantTournamentOrganizer,
    registerForTournament,
    removeFromAccessList,
    removeTournamentParticipant,
    reopenTournamentMatch,
    requestMatchExtension,
    resolveExtension,
    revokeTournamentOrganizer,
    searchTournamentPlayers,
    startTournament,
    swapTournamentParticipant,
    unsubscribeFromTournament,
    reorderTournamentSeeds,
    updateTournament,
    useQueryTournament,
    withdrawFromTournament,
} from '../query/tournamentClient';
import { formatDateTime, useIntlFormatProvider } from '../utils/dateTime';

/* ── Modal overlay ──────────────────────────────────── */

function Modal({ open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                <div className="flex shrink-0 items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-white">
                        {title}
                    </h3>

                    <button onClick={onClose} className="text-slate-500 transition hover:text-white">
                        &times;
                    </button>
                </div>

                <div className="mt-4 min-h-0 overflow-y-auto pr-1">
                    {children}
                </div>
            </div>
        </div>
    );
}

/* ── Tiny shared bits ───────────────────────────────── */

const STATUS_DOT: Record<string, string> = {
    draft: `bg-slate-400`, 'registration-open': `bg-sky-400`, 'check-in-open': `bg-amber-400`,
    'waitlist-open': `bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.6)]`,
    live: `bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]`, completed: `bg-slate-500`, cancelled: `bg-rose-400`,
};

const STATUS_LABEL: Record<string, string> = {
    draft: `Draft`, 'registration-open': `Registration Open`, 'check-in-open': `Check-In Open`,
    'waitlist-open': `Waitlist Open`, live: `Live`, completed: `Completed`, cancelled: `Cancelled`,
};

function Chip({ children, color = `default` }: { children: React.ReactNode; color?: `default` | `sky` | `amber` | `emerald` | `rose` }) {
    const c = color === `sky` ? `bg-sky-400/12 text-sky-200 border-sky-400/15`
        : color === `amber` ? `bg-amber-300/12 text-amber-200 border-amber-300/15`
            : color === `emerald` ? `bg-emerald-400/12 text-emerald-200 border-emerald-400/15`
                : color === `rose` ? `bg-rose-400/12 text-rose-200 border-rose-400/15`
                    : `bg-white/6 text-slate-300 border-white/8`;
    return (<span className={`inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${c}`}>
        {children}
    </span>);
}

function Confirm({ label, onConfirm, className }: { label: string; onConfirm: () => void; className: string }) {
    const [ask, setAsk] = useState(false);
    if (ask) return (
        <span className="inline-flex items-center gap-1">
            <button onClick={() => { setAsk(false); onConfirm(); }} className="rounded-md bg-rose-500/60 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-rose-500">
                Yes
            </button>

            <button onClick={() => setAsk(false)} className="rounded-md bg-white/8 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/14">
                No
            </button>
        </span>
    );
    return (<button onClick={() => setAsk(true)} className={className}>
        {label}
    </button>);
}

/* ── Waitlist banner ────────────────────────────────── */

function WaitlistBanner({ closesAt, availableSlots }: { closesAt: number; availableSlots: number }) {
    const [remaining, setRemaining] = useState(() => Math.max(0, closesAt - Date.now()));
    useEffect(() => {
        const timer = setInterval(() => setRemaining(Math.max(0, closesAt - Date.now())), 1000);
        return () => clearInterval(timer);
    }, [closesAt]);

    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1000);

    return (
        <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3">
            <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.6)]" />
                <span className="text-[12px] font-semibold text-orange-200">Waitlist check-in open</span>
                <span className="ml-auto text-[11px] tabular-nums text-orange-300">
                    {remaining > 0 ? `${mins}:${String(secs).padStart(2, `0`)}` : `Closing...`}
                </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
                {availableSlots > 0 ? `${availableSlots} spot${availableSlots === 1 ? `` : `s`} available` : `No spots remaining`}
                {` `}
                — first come, first served
            </div>
        </div>
    );
}

/* ── Round delay countdown ─────────────────────────── */

function RoundDelayCountdown({ tournament }: { tournament: TournamentDetail }) {
    const [, setTick] = useState(0);
    useEffect(() => {
        if (tournament.roundDelayMinutes <= 0) return;
        const timer = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(timer);
    }, [tournament.roundDelayMinutes]);

    if (tournament.roundDelayMinutes <= 0 || tournament.status !== `live`) return null;

    // Find the next round that's pending but whose previous round is complete
    const pendingMatches = tournament.matches.filter((m) => m.state === `pending`);
    if (pendingMatches.length === 0) return null;

    const nextRound = Math.min(...pendingMatches.map((m) => m.round));
    const bracket = pendingMatches.find((m) => m.round === nextRound)?.bracket;
    if (!bracket) return null;

    const prevRoundMatches = tournament.matches.filter((m) => m.bracket === bracket && m.round === nextRound - 1);
    if (prevRoundMatches.length === 0) return null;

    const allPrevCompleted = prevRoundMatches.every((m) => m.state === `completed`);
    if (!allPrevCompleted) return null;

    const latestResolved = Math.max(...prevRoundMatches.map((m) => m.resolvedAt ?? 0));
    const readyAt = latestResolved + tournament.roundDelayMinutes * 60_000;
    const remaining = Math.max(0, readyAt - Date.now());
    if (remaining <= 0) return null;

    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1000);

    return (
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3">
            <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
                <span className="text-[12px] font-semibold text-sky-200">Round break</span>
                <span className="ml-auto text-[11px] tabular-nums text-sky-300">
                    Next round in {mins}:{String(secs).padStart(2, `0`)}
                </span>
            </div>
        </div>
    );
}

/* ── Participant list ───────────────────────────────── */

type ParticipantSortMode = `status` | `name` | `record`;

const kStatusOrder: Record<string, number> = {
    'completed': 0,
    'checked-in': 1,
    'registered': 2,
    'waitlisted': 3,
    'eliminated': 4,
    'dropped': 5,
    'removed': 6,
};

function sortParticipants(
    participants: TournamentParticipant[],
    mode: ParticipantSortMode,
    standMap: Map<string, TournamentStanding>,
): TournamentParticipant[] {
    const sorted = [...participants];
    switch (mode) {
        case `status`:
            sorted.sort((a, b) => (kStatusOrder[a.status] ?? 9) - (kStatusOrder[b.status] ?? 9));
            break;
        case `name`:
            sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
            break;
        case `record`: {
            sorted.sort((a, b) => {
                const sa = standMap.get(a.profileId);
                const sb = standMap.get(b.profileId);
                if (!sa && !sb) return 0;
                if (!sa) return 1;
                if (!sb) return -1;
                const wr = (sb.wins - sb.losses) - (sa.wins - sa.losses);
                if (wr !== 0) return wr;
                return sb.wins - sa.wins;
            });
            break;
        }
    }
    return sorted;
}

function ParticipantList({ participants, standings, canManage, isLive, viewerProfileId, tournamentId, tournamentStatus, onRemove, onSwapSelect, swapTarget }: {
    participants: TournamentParticipant[]; standings: TournamentStanding[]; canManage: boolean; isLive: boolean; viewerProfileId: string | null
    tournamentId: string; tournamentStatus: string
    onRemove: (id: string) => void; onSwapSelect: (id: string | null) => void; swapTarget: string | null
}) {
    const standMap = new Map(standings.map((s) => [s.profileId, s]));
    const [sortMode, setSortMode] = useState<ParticipantSortMode>(`status`);
    const [showRemoved, setShowRemoved] = useState(false);
    const [seedMode, setSeedMode] = useState(false);
    const [seedOrder, setSeedOrder] = useState<string[]>([]);
    const [savingSeeds, setSavingSeeds] = useState(false);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const isPreStart = tournamentStatus === `registration-open` || tournamentStatus === `check-in-open`;
    const canSeed = canManage && isPreStart;

    const sorted = sortParticipants(participants, seedMode ? `status` : sortMode, standMap);
    const active = sorted.filter((p) => p.status !== `removed` && p.status !== `dropped` && p.status !== `waitlisted`);
    const waitlisted = sorted.filter((p) => p.status === `waitlisted`);
    const removed = sorted.filter((p) => p.status === `removed`);
    const dqd = sorted.filter((p) => p.status === `dropped`);
    const visible = [...active, ...dqd, ...waitlisted];

    // Initialize seed order from active participants when entering seed mode
    const enterSeedMode = () => {
        const ordered = [...active].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity));
        setSeedOrder(ordered.map((p) => p.profileId));
        setSeedMode(true);
    };

    const saveSeedOrder = async () => {
        setSavingSeeds(true);
        try {
            await reorderTournamentSeeds(tournamentId, seedOrder);
            setSeedMode(false);
            toast.success(`Seed order saved`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : `Failed to save seeds`);
        } finally {
            setSavingSeeds(false);
        }
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (dragIdx === null || dragIdx === idx) return;
        const next = [...seedOrder];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(idx, 0, moved!);
        setSeedOrder(next);
        setDragIdx(idx);
    };

    const pColor = (s: string) => s === `checked-in` ? `sky` as const : s === `waitlisted` ? `amber` as const : s === `eliminated` || s === `removed` || s === `dropped` ? `rose` as const : s === `completed` ? `emerald` as const : `default` as const;
    const pLabel = (s: string) => s === `dropped` ? `DQ` : s === `checked-in` ? `in` : s === `waitlisted` ? `waitlist` : s;

    const seedRow = (profileId: string, idx: number) => {
        const p = participants.find((pp) => pp.profileId === profileId);
        if (!p) return null;
        const isSelf = p.profileId === viewerProfileId;
        return (
            <div
                key={profileId}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={() => setDragIdx(null)}
                className={`flex cursor-grab items-center gap-2 rounded-lg px-2.5 py-1.5 active:cursor-grabbing ${isSelf ? `bg-sky-400/10 ring-1 ring-sky-400/25` : `bg-white/3`} ${dragIdx === idx ? `opacity-50` : ``}`}
            >
                <span className="w-5 shrink-0 text-center text-[10px] font-bold tabular-nums text-amber-300">{idx + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">{p.displayName}</span>
                <span className="text-[9px] text-slate-500">&#x2630;</span>
            </div>
        );
    };

    const row = (p: TournamentParticipant) => {
        const st = standMap.get(p.profileId);
        const isActive = p.status !== `removed` && p.status !== `dropped` && p.status !== `waitlisted`;
        const isSelf = p.profileId === viewerProfileId;
        return (
            <div
                key={`${p.profileId}:${p.registeredAt}`}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${isSelf ? `bg-sky-400/10 ring-1 ring-sky-400/25` : isActive ? `bg-white/3` : `bg-white/1 opacity-50`}`}
            >
                {p.seed && <span className="w-5 shrink-0 text-center text-[10px] font-bold tabular-nums text-slate-500">
                    {p.seed}
                           </span>}

                <span className={`min-w-0 flex-1 truncate text-[13px] font-medium text-white ${!isActive ? `line-through decoration-slate-500` : ``}`}>
                    {p.displayName}
                </span>

                {st && <span className="text-[10px] tabular-nums text-slate-500">
                    {st.wins}
                    W
                    {` `}
                    {st.losses}
                    L
                       </span>}

                <Chip color={pColor(p.status)}>
                    {pLabel(p.status)}
                </Chip>

                {canManage && isActive && (
                    <span className="flex shrink-0 gap-1">
                        <button
                            onClick={() => onSwapSelect(swapTarget === p.profileId ? null : p.profileId)}
                            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition ${swapTarget === p.profileId ? `bg-sky-400 text-slate-950` : `bg-white/6 text-slate-400 hover:text-white`}`}
                        >
                            {swapTarget === p.profileId ? `×` : `Swap`}
                        </button>

                        <Confirm
                            label={isLive ? `DQ` : `×`} onConfirm={() => onRemove(p.profileId)}
                            className="rounded bg-white/6 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300 transition hover:bg-rose-500/20"
                        />
                    </span>
                )}
            </div>
        );
    };

    const sortBtn = (mode: ParticipantSortMode, label: string) => (
        <button
            onClick={() => setSortMode(mode)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition ${sortMode === mode ? `bg-white/10 text-white` : `text-slate-500 hover:text-slate-300`}`}
        >
            {label}
        </button>
    );

    if (seedMode) {
        return (
            <div className="space-y-1">
                <div className="flex items-center gap-2 pb-1">
                    <span className="text-[10px] font-medium text-amber-300">Drag to reorder seeds</span>
                    <button onClick={saveSeedOrder} disabled={savingSeeds}
                        className="rounded bg-amber-300/20 px-2 py-0.5 text-[9px] font-semibold text-amber-200 transition hover:bg-amber-300/30 disabled:opacity-40">
                        {savingSeeds ? `Saving...` : `Save`}
                    </button>
                    <button onClick={() => setSeedMode(false)}
                        className="rounded bg-white/6 px-2 py-0.5 text-[9px] font-semibold text-slate-400 transition hover:text-white">
                        Cancel
                    </button>
                </div>
                {seedOrder.map((id, i) => seedRow(id, i))}
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {participants.length > 0 && (
                <div className="flex items-center gap-1 pb-0.5">
                    <span className="text-[9px] font-medium tracking-wide text-slate-600">Sort</span>
                    {sortBtn(`status`, `Status`)}
                    {sortBtn(`name`, `Name`)}
                    {sortBtn(`record`, `W/L`)}
                    {canSeed && (
                        <button onClick={enterSeedMode}
                            className="ml-auto rounded bg-amber-300/15 px-2 py-0.5 text-[9px] font-semibold text-amber-200 transition hover:bg-amber-300/25">
                            Seed
                        </button>
                    )}
                </div>
            )}

            {visible.length === 0 && <div className="py-3 text-center text-[11px] text-slate-600">
                No participants yet
            </div>}

            {visible.map(row)}

            {removed.length > 0 && (
                <button onClick={() => setShowRemoved(!showRemoved)} className="text-[10px] text-slate-600 transition hover:text-slate-400">
                    {showRemoved ? `Hide` : `Show`}
                    {` `}
                    {removed.length}
                    {` `}
                    removed
                </button>
            )}

            {showRemoved && removed.map(row)}
        </div>
    );
}

/* ── Final standings ───────────────────────────────── */

type StandingsFormat = `single-elimination` | `double-elimination` | `swiss`;

function getExitInfo(
    s: TournamentStanding,
    participant: TournamentParticipant | undefined,
    matches: TournamentMatch[],
    format: StandingsFormat,
): { label: string; color: `gold` | `silver` | `bronze` | `rose` | `default` } {
    if (participant?.status === `dropped`) return { label: `Disqualified`, color: `rose` };
    if (s.rank === 1) return { label: `Champion`, color: `gold` };
    if (s.rank === 2) return { label: `Finalist`, color: `silver` };
    if (s.rank === 3) return { label: `3rd Place`, color: `bronze` };

    if (format === `swiss`) return { label: ``, color: `default` };

    // For elimination, find which round they were knocked out
    const elimMatch = matches
        .filter((m) => m.state === `completed` && m.loserProfileId === s.profileId)
        .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))[0];

    if (!elimMatch) return { label: ``, color: `default` };

    if (elimMatch.bracket === `grand-final` || elimMatch.bracket === `grand-final-reset`) return { label: `Grand Final`, color: `silver` };

    const totalRounds = Math.max(...matches.filter((m) => m.bracket === elimMatch.bracket).map((m) => m.round));
    const roundsFromEnd = totalRounds - elimMatch.round;

    if (roundsFromEnd === 0) return { label: `${bracketLabel(elimMatch.bracket)} Final`, color: `default` };
    if (roundsFromEnd === 1) return { label: `${bracketLabel(elimMatch.bracket)} Semifinal`, color: `default` };
    if (roundsFromEnd === 2) return { label: `${bracketLabel(elimMatch.bracket)} Quarterfinal`, color: `default` };
    return { label: `${bracketLabel(elimMatch.bracket)} R${elimMatch.round}`, color: `default` };
}

function bracketLabel(bracket: string): string {
    if (bracket === `winners`) return `Winners`;
    if (bracket === `losers`) return `Losers`;
    return ``;
}

function getMatchPath(profileId: string, matches: TournamentMatch[]): { matchId: string; opponent: string; won: boolean; bracket: string; round: number; resultType: string | null }[] {
    return matches
        .filter((m) => m.state === `completed` && m.slots.some((s) => s.profileId === profileId))
        .sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0))
        .map((m) => {
            const opponent = m.slots.find((s) => s.profileId !== profileId && !s.isBye);
            return {
                matchId: m.id,
                opponent: opponent?.displayName ?? (m.slots.some((s) => s.isBye) ? `BYE` : `???`),
                won: m.winnerProfileId === profileId,
                bracket: m.bracket,
                round: m.round,
                resultType: m.resultType,
            };
        });
}

function scrollToMatch(matchId: string) {
    const el = document.getElementById(`match-${matchId}`);
    if (el) {
        el.scrollIntoView({ behavior: `smooth`, block: `center` });
        el.classList.add(`ring-2`, `ring-amber-400/60`, `shadow-[0_0_16px_rgba(251,191,36,0.25)]`);
        setTimeout(() => el.classList.remove(`ring-2`, `ring-amber-400/60`, `shadow-[0_0_16px_rgba(251,191,36,0.25)]`), 2500);
    }
}

function tierLabel(rank: number): string {
    if (rank === 1) return `Champion`;
    if (rank === 2) return `Finalist`;
    if (rank <= 4) return `Top 4`;
    if (rank <= 8) return `Top 8`;
    if (rank <= 16) return `Top 16`;
    if (rank <= 32) return `Top 32`;
    if (rank <= 64) return `Top 64`;
    if (rank <= 128) return `Top 128`;
    if (rank <= 256) return `Top 256`;
    return `#${rank}`;
}

function ordinal(n: number): string {
    const s = [`th`, `st`, `nd`, `rd`];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function exportStandingsCsv(
    standings: TournamentStanding[],
    participants: TournamentParticipant[],
    matches: TournamentMatch[],
    format: StandingsFormat,
    tournamentName: string,
) {
    const participantMap = new Map(participants.map((p) => [p.profileId, p]));
    const header = [`Rank`, `Player`, `Wins`, `Losses`, `Record`, `Exit Round`, `Status`, `Match Points`, `Buchholz`, `Sonneborn-Berger`];
    const rows = standings.map((s) => {
        const p = participantMap.get(s.profileId);
        const exit = getExitInfo(s, p, matches, format);
        return [
            s.rank,
            s.displayName,
            s.wins,
            s.losses,
            `${s.wins}-${s.losses}`,
            exit.label || `-`,
            p?.status ?? `-`,
            s.matchPoints,
            s.buchholz,
            s.sonnebornBerger,
        ].map((v) => `"${String(v).replace(/"/g, `""`)}"`)
            .join(`,`);
    });

    const csv = [header.join(`,`), ...rows].join(`\n`);
    const blob = new Blob([csv], { type: `text/csv` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement(`a`);
    a.href = url;
    a.download = `${tournamentName.replace(/[^a-zA-Z0-9-_ ]/g, ``).trim()}-standings.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/* ── Podium card ── */

function PodiumCard({ standing, exit, isSelf, rank, matches }: {
    standing: TournamentStanding; exit: { label: string; color: string }; isSelf: boolean; rank: 1 | 2 | 3; matches: TournamentMatch[]
}) {
    const medal = rank === 1
        ? { icon: `\u{1F947}`, ring: `ring-amber-400/40`, bg: `bg-gradient-to-b from-amber-400/12 to-amber-400/3`, border: `border-amber-400/25`, text: `text-amber-300`, glow: `shadow-[0_0_40px_rgba(251,191,36,0.15)]` }
        : rank === 2
            ? { icon: `\u{1F948}`, ring: `ring-slate-300/30`, bg: `bg-gradient-to-b from-slate-300/8 to-slate-400/2`, border: `border-slate-400/20`, text: `text-slate-300`, glow: `shadow-[0_0_30px_rgba(148,163,184,0.08)]` }
            : { icon: `\u{1F949}`, ring: `ring-amber-600/30`, bg: `bg-gradient-to-b from-amber-700/10 to-amber-800/3`, border: `border-amber-700/20`, text: `text-amber-600`, glow: `shadow-[0_0_25px_rgba(180,83,9,0.08)]` };

    const initials = standing.displayName.split(` `).map((w) => w[0]).join(``).slice(0, 2).toUpperCase();

    return (
        <div className={`relative flex flex-col items-center rounded-xl border px-3 pb-3 ${rank === 1 ? `pt-4` : `pt-3`} ${medal.bg} ${medal.border} ${medal.glow} ${isSelf ? `ring-2 ${medal.ring}` : ``}`}>
            {/* Medal icon */}
            <span className={`${rank === 1 ? `text-2xl` : `text-xl`}`}>{medal.icon}</span>

            {/* Avatar */}
            {standing.image
                ? <img src={standing.image} alt="" className={`mt-1.5 ${rank === 1 ? `size-12` : `size-10`} rounded-full border-2 ${medal.border} object-cover`} />
                : (
                    <div className={`mt-1.5 flex ${rank === 1 ? `size-12 text-sm` : `size-10 text-xs`} items-center justify-center rounded-full border-2 ${medal.border} bg-slate-800 font-bold ${medal.text}`}>
                        {initials}
                    </div>
                )}

            {/* Name */}
            <span className={`mt-2 max-w-full truncate text-center ${rank === 1 ? `text-[13px]` : `text-[12px]`} font-bold text-white`}>
                {standing.displayName}
            </span>

            {/* Record */}
            <span className="mt-0.5 text-[10px] tabular-nums text-slate-400">
                {standing.wins}
                W
                {` `}
                {standing.losses}
                L
            </span>

            {/* Label */}
            <span className={`mt-1.5 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                rank === 1 ? `bg-amber-400/15 text-amber-300` : rank === 2 ? `bg-slate-400/12 text-slate-300` : `bg-amber-700/12 text-amber-600`
            }`}>
                {exit.label}
            </span>

            {/* Match path — togglable */}
            <PodiumMatchPath profileId={standing.profileId} matches={matches} />
        </div>
    );
}

function PodiumMatchPath({ profileId, matches }: { profileId: string; matches: TournamentMatch[] }) {
    const [show, setShow] = useState(false);
    const path = getMatchPath(profileId, matches);
    if (path.length === 0) return null;

    return (
        <div className="mt-2 w-full">
            <button
                onClick={() => setShow(!show)}
                className={`mx-auto block rounded px-2 py-0.5 text-[10px] font-medium transition ${show ? `bg-white/8 text-slate-300` : `text-slate-600 hover:text-slate-400`}`}
            >
                {show ? `Hide Matches` : `Matches`}
            </button>

            {show && (
                <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                    {path.map((step, i) => (
                        <button
                            key={i}
                            onClick={() => scrollToMatch(step.matchId)}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition hover:brightness-125 ${
                                step.resultType === `bye` ? `bg-slate-700/50 text-slate-500`
                                    : step.won ? `bg-emerald-400/8 text-emerald-400` : `bg-rose-400/8 text-rose-300`
                            }`}
                        >
                            <span className="font-semibold">{step.won ? `W` : step.resultType === `bye` ? `B` : `L`}</span>
                            <span className="text-white/50">vs</span>
                            <span className="max-w-[6rem] truncate">{step.opponent}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Expandable match path ── */

function MatchPath({ profileId, matches }: { profileId: string; matches: TournamentMatch[] }) {
    const path = getMatchPath(profileId, matches);
    if (path.length === 0) return null;

    return (
        <div className="mt-1.5 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            {path.map((step, i) => (
                <button
                    key={i}
                    onClick={() => scrollToMatch(step.matchId)}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition hover:brightness-125 ${
                        step.resultType === `bye` ? `bg-slate-700/50 text-slate-500`
                            : step.won ? `bg-emerald-400/8 text-emerald-400` : `bg-rose-400/8 text-rose-300`
                    }`}
                >
                    <span className="font-semibold">{step.won ? `W` : step.resultType === `bye` ? `B` : `L`}</span>
                    <span className="text-white/50">vs</span>
                    <span className="max-w-[8rem] truncate">{step.opponent}</span>
                </button>
            ))}
        </div>
    );
}

/* ── Main standings component ── */

function FinalStandings({ standings, participants, matches, format, tournamentName, viewerProfileId }: {
    standings: TournamentStanding[]; participants: TournamentParticipant[]; matches: TournamentMatch[]
    format: StandingsFormat; tournamentName: string; viewerProfileId: string | null
}) {
    if (standings.length === 0) return null;

    const [expandedId, setExpandedId] = useState<string | null>(null);

    const participantMap = new Map(participants.map((p) => [p.profileId, p]));

    const top3 = standings.filter((s) => s.rank <= 3);
    const rest = standings.filter((s) => s.rank > 3);

    // Group rest into tiers
    const tiers = new Map<string, TournamentStanding[]>();
    for (const s of rest) {
        const tier = tierLabel(s.rank);
        const list = tiers.get(tier) ?? [];
        list.push(s);
        tiers.set(tier, list);
    }

    const isSwiss = format === `swiss`;

    const exitColor = (c: string) =>
        c === `gold` ? `bg-amber-400/12 text-amber-300` : c === `silver` ? `bg-slate-400/10 text-slate-300`
            : c === `bronze` ? `bg-amber-700/10 text-amber-600` : c === `rose` ? `bg-rose-400/12 text-rose-300`
                : `bg-white/5 text-slate-400`;

    const standingRow = (s: TournamentStanding) => {
        const p = participantMap.get(s.profileId);
        const exit = getExitInfo(s, p, matches, format);
        const isSelf = s.profileId === viewerProfileId;
        const isExpanded = expandedId === s.profileId;
        const isDq = p?.status === `dropped`;
        const initials = s.displayName.split(` `).map((w) => w[0]).join(``).slice(0, 2).toUpperCase();

        return (
            <div
                key={s.profileId}
                className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors ${isSelf ? `border-sky-400/25 bg-sky-400/6` : `border-white/5 bg-white/[0.02] hover:bg-white/[0.05]`}`}
                onClick={() => setExpandedId(isExpanded ? null : s.profileId)}
                role="button"
            >
                <div className="flex items-center gap-2.5">
                    {/* Rank */}
                    <span className="w-7 shrink-0 text-center text-[13px] font-black tabular-nums text-slate-500">
                        {ordinal(s.rank)}
                    </span>

                    {/* Avatar */}
                    {s.image
                        ? <img src={s.image} alt="" className="size-7 rounded-full object-cover" />
                        : (
                            <div className="flex size-7 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-slate-400">
                                {initials}
                            </div>
                        )}

                    {/* Name */}
                    <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${isDq ? `text-slate-500 line-through decoration-slate-600` : `text-white`}`}>
                        {s.displayName}
                    </span>

                    {/* W-L pill */}
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                        {s.wins}
                        -
                        {s.losses}
                    </span>

                    {/* Swiss tiebreakers */}
                    {isSwiss && (s.buchholz > 0 || s.sonnebornBerger > 0) && (
                        <span className="hidden text-[9px] tabular-nums text-slate-600 sm:inline" title="Buchholz / Sonneborn-Berger">
                            {s.buchholz}
                            /
                            {s.sonnebornBerger}
                        </span>
                    )}

                    {/* Exit label */}
                    {exit.label && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${exitColor(exit.color)}`}>
                            {exit.label}
                        </span>
                    )}

                    {/* Expand toggle */}
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition ${isExpanded ? `bg-white/8 text-slate-300` : `text-slate-600 hover:text-slate-400`}`}>
                        {isExpanded ? `Hide` : `Matches`}
                    </span>
                </div>

                {/* Expanded match path */}
                {isExpanded && <MatchPath profileId={s.profileId} matches={matches} />}
            </div>
        );
    };

    // Podium: reorder for visual layout — 2nd, 1st, 3rd
    // Desktop: 2nd-1st-3rd (podium layout). Mobile: 1st-2nd-3rd (stacked).
    // Use CSS order to swap on sm+ breakpoint.
    const podiumOrder = [top3.find((s) => s.rank === 2), top3.find((s) => s.rank === 1), top3.find((s) => s.rank === 3)].filter(Boolean) as TournamentStanding[];
    const podiumCssOrder = (rank: number) => rank === 1 ? `order-first sm:order-2` : rank === 2 ? `order-2 sm:order-1` : `order-3`;

    return (
        <div className="space-y-5">
            {/* Header + actions */}
            <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Final Standings
                    <span className="ml-2 text-slate-600">
                        {standings.length}
                        {` `}
                        players
                    </span>
                </div>

                <button
                    onClick={() => exportStandingsCsv(standings, participants, matches, format, tournamentName)}
                    className="rounded-md bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/8 hover:text-white"
                >
                    Export CSV
                </button>
            </div>

            {/* Podium — top 3 */}
            {top3.length > 0 && (
                <div className={`grid gap-3 ${top3.length >= 3 ? `grid-cols-1 sm:grid-cols-3` : top3.length === 2 ? `grid-cols-1 sm:grid-cols-2` : `grid-cols-1`} items-end`}>
                    {podiumOrder.map((s) => {
                        const p = participantMap.get(s.profileId);
                        const exit = getExitInfo(s, p, matches, format);
                        return (
                            <div key={s.profileId} className={podiumCssOrder(s.rank)}>
                                <PodiumCard
                                    standing={s}
                                    exit={exit}
                                    isSelf={s.profileId === viewerProfileId}
                                    rank={s.rank as 1 | 2 | 3}
                                    matches={matches}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Tiered list */}
            {[...tiers.entries()].map(([tier, group]) => (
                <TierGroup key={tier} tier={tier} standings={group} renderRow={standingRow} />
            ))}
        </div>
    );
}

function TierGroup({ tier, standings, renderRow }: {
    tier: string; standings: TournamentStanding[]; renderRow: (s: TournamentStanding) => React.ReactNode
}) {
    const [collapsed, setCollapsed] = useState(standings.length > 16);

    return (
        <div>
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="mb-1.5 flex w-full items-center gap-2 text-left"
            >
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tier}
                </span>

                <span className="h-px flex-1 bg-white/5" />

                <span className="text-[11px] tabular-nums text-slate-600">
                    {standings.length}
                </span>

                <span className={`text-[20px] text-slate-500 transition-transform ${collapsed ? `` : `rotate-180`}`}>
                    &#9662;
                </span>
            </button>

            {!collapsed && <div className="space-y-1">{standings.map(renderRow)}</div>}
        </div>
    );
}

/* ── Countdown hook ─────────────────────────────────── */

function useCountdown(deadlineMs: number | null) {
    const [remaining, setRemaining] = useState(() => deadlineMs ? Math.max(0, deadlineMs - Date.now()) : 0);

    useEffect(() => {
        if (!deadlineMs) return;
        const tick = () => setRemaining(Math.max(0, deadlineMs - Date.now()));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [deadlineMs]);

    if (!deadlineMs) return null;
    const totalSec = Math.ceil(remaining / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return { remaining, min, sec, expired: remaining <= 0, label: `${min}:${String(sec).padStart(2, `0`)}` };
}

/* ── Match card ─────────────────────────────────────── */

function MatchCard({ match, canManage, viewerProfileId, timeoutAt, timeoutMinutes, pendingExtension, claimWinExpiresAt, onOpen, onWalkover, onReopen, onRequestExtension, onResolveExtension }: {
    match: TournamentMatch; canManage: boolean; viewerProfileId: string | null
    timeoutAt: number | null; timeoutMinutes: number; pendingExtension: TournamentExtensionRequest | null; claimWinExpiresAt: number | null
    onOpen: (sid: string) => void; onWalkover: (mid: string, pid: string) => void; onReopen: (mid: string) => void
    onRequestExtension: (mid: string) => void; onResolveExtension: (eid: string, approve: boolean) => void
}) {
    const countdown = useCountdown(timeoutAt);
    const claimCountdown = useCountdown(claimWinExpiresAt);
    const timedOut = countdown?.expired ?? false;
    const stateColor = match.state === `completed` ? `emerald` as const : match.state === `in-progress` ? `sky` as const : match.state === `ready` ? `amber` as const : `default` as const;
    const isParticipant = Boolean(viewerProfileId && match.slots.some((s) => s.profileId === viewerProfileId));
    const canJoin = isParticipant && match.sessionId && (match.state === `ready` || match.state === `in-progress`) && !timedOut;
    const canSpectate = !isParticipant && match.sessionId && match.state === `in-progress` && match.startedAt !== null;
    const isInProgress = match.state === `in-progress`;

    const slot = (s: TournamentMatch[`slots`][number], wins: number, isW: boolean) => {
        const isTbd = !s.profileId && !s.isBye;
        const sourceMatch = s.source && s.source.type !== `seed` ? s.source : null;
        const canNavigate = isTbd && sourceMatch;
        return (
            <div
                className={`flex items-center justify-between rounded px-2 py-1 ${isW ? `bg-emerald-400/8` : s.isBye ? `bg-white/2` : `bg-white/3`} ${canNavigate ? `cursor-pointer transition hover:bg-white/6` : ``}`}
                onClick={canNavigate ? () => scrollToMatch(sourceMatch.matchId) : undefined}
            >
                <span className={`flex items-center gap-1.5 text-[12px] ${s.isBye ? `italic text-slate-600` : isTbd ? `italic text-slate-500` : isW ? `font-bold text-emerald-200` : `font-medium text-white`}`}>
                    {s.seed && <span className="text-[9px] text-slate-500">
                        {s.seed}
                               </span>}

                    {s.displayName ?? `TBD`}
                    {canNavigate && <span className="text-[9px] text-slate-600">
                        {sourceMatch.type === `winner` ? `W` : `L`}
                        {` `}
                        of
                        {` `}
                        {sourceMatch.matchId.replace(`match-`, ``)}
                                    </span>}
                </span>

                {!s.isBye && s.profileId && <span className={`text-[12px] tabular-nums ${isW ? `font-bold text-emerald-300` : `text-slate-500`}`}>
                    {wins}
                                            </span>}
            </div>
        );
    };

    return (
        <div id={`match-${match.id}`} className="rounded-lg border border-white/6 bg-slate-950/40 p-2 transition-shadow duration-700 ease-out">
            <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-[9px] font-semibold tabular-nums text-slate-600">
                    M
                    {match.order}
                </span>

                <Chip color={stateColor}>
                    {match.state === `in-progress` ? `live` : match.state}
                </Chip>

                <Chip>
                    BO
                    {match.bestOf}
                </Chip>

                {canJoin && (
                    <button
                        onClick={() => onOpen(match.sessionId!)}
                        className="ml-auto rounded bg-amber-300 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-950 shadow-[0_2px_8px_rgba(251,191,36,0.3)] transition hover:bg-amber-200"
                    >
                        Join
                    </button>
                )}

                {canSpectate && (
                    <Link
                        to={`/session/${match.sessionId}`}
                        className="ml-auto text-[9px] text-slate-500 transition hover:text-slate-300"
                    >
                        spectate &rarr;
                    </Link>
                )}
            </div>

            <div className="space-y-0.5">
                {slot(match.slots[0], match.leftWins, match.winnerProfileId !== null && match.winnerProfileId === match.slots[0].profileId)}
                {slot(match.slots[1], match.rightWins, match.winnerProfileId !== null && match.winnerProfileId === match.slots[1].profileId)}
            </div>

            {/* Join countdown timer */}
            {countdown && !timedOut && isInProgress && (
                <div className="mt-1.5 flex items-center justify-between rounded bg-slate-800/60 px-2 py-1">
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold tabular-nums ${countdown.remaining < 60_000 ? `text-rose-300` : countdown.remaining < 120_000 ? `text-amber-300` : `text-slate-400`}`}>
                            {countdown.label}
                        </span>

                        <span className="text-[9px] text-slate-500">
                            to join
                        </span>
                    </div>

                    {isParticipant && !pendingExtension && (
                        <button
                            onClick={() => onRequestExtension(match.id)}
                            className="rounded bg-amber-300/15 px-2 py-0.5 text-[9px] font-semibold text-amber-200 transition hover:bg-amber-300/25"
                        >
                            Request Extension (+{timeoutMinutes} min)
                        </button>
                    )}
                </div>
            )}

            {/* Pending extension — always visible when it exists */}
            {pendingExtension && match.state !== `completed` && (
                <div className="mt-1.5 rounded bg-amber-300/6 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] text-amber-200/70">
                            Extension requested by
                            {` `}
                            <span className="font-semibold text-amber-200">
                                {pendingExtension.requestedByDisplayName}
                            </span>
                        </span>

                        {canManage && (
                            <span className="inline-flex shrink-0 gap-1">
                                <button
                                    onClick={() => onResolveExtension(pendingExtension.id, true)}
                                    className="rounded bg-emerald-400/20 px-2 py-0.5 text-[9px] font-semibold text-emerald-200 transition hover:bg-emerald-400/30"
                                >
                                    Approve
                                </button>

                                <button
                                    onClick={() => onResolveExtension(pendingExtension.id, false)}
                                    className="rounded bg-rose-400/20 px-2 py-0.5 text-[9px] font-semibold text-rose-200 transition hover:bg-rose-400/30"
                                >
                                    Deny
                                </button>
                            </span>
                        )}

                        {!canManage && (
                            <span className="text-[9px] text-amber-200/50">
                                Waiting for organizer...
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Active claim-win countdown */}
            {claimCountdown && !claimCountdown.expired && match.state !== `completed` && (
                <div className="mt-1.5 rounded bg-rose-400/10 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold tabular-nums text-rose-300">
                            {claimCountdown.label}
                        </span>

                        <span className="text-[9px] text-rose-200/70">
                            Win claim active — opponent must join
                        </span>
                    </div>
                </div>
            )}

            {/* Timed out — no claim win on tournament page, only in lobby */}
            {timedOut && !claimCountdown && !pendingExtension && match.state !== `completed` && (
                <div className="mt-1.5 rounded bg-amber-300/8 px-2 py-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-amber-200">
                            Timed out — waiting for player
                        </span>

                        {isParticipant && (
                            <button
                                onClick={() => onRequestExtension(match.id)}
                                className="rounded bg-amber-300/20 px-2 py-0.5 text-[9px] font-semibold text-amber-100 transition hover:bg-amber-300/30"
                            >
                                Request Extension (+{timeoutMinutes} min)
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Timed out but extension is pending — just show timed out label, extension block above handles the rest */}
            {timedOut && !claimCountdown && pendingExtension && match.state !== `completed` && (
                <div className="mt-1.5 rounded bg-amber-300/8 px-2 py-1">
                    <span className="text-[9px] font-semibold text-amber-200">
                        Timed out — extension pending
                    </span>
                </div>
            )}

            {match.state === `completed` && match.gameIds.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5">
                    <Link
                        to={`/games/${match.gameIds[match.gameIds.length - 1]}`}
                        className="rounded bg-white/6 px-2 py-0.5 text-[9px] text-slate-400 transition hover:text-white"
                    >
                        Review
                    </Link>

                    {match.gameIds.length > 1 && match.gameIds.map((gid, i) => (
                        <Link key={gid} to={`/games/${gid}`} className="rounded bg-white/4 px-1.5 py-0.5 text-[9px] text-slate-500 transition hover:text-white">
                            G
                            {i + 1}
                        </Link>
                    ))}
                </div>
            )}

            {canManage && match.state !== `completed` && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {match.slots.filter((s): s is typeof s & { profileId: string } => Boolean(s.profileId) && !s.isBye).map((s) => (
                        <Confirm
                            key={s.profileId} label={`Award ${s.displayName}`} onConfirm={() => onWalkover(match.id, s.profileId)}
                            className="rounded bg-sky-400/10 px-2 py-0.5 text-[9px] text-sky-200 transition hover:bg-sky-400/20"
                        />
                    ))}

                    <Confirm
                        label="Reopen" onConfirm={() => onReopen(match.id)}
                        className="rounded bg-white/6 px-2 py-0.5 text-[9px] text-slate-400 transition hover:text-white"
                    />
                </div>
            )}
        </div>
    );
}

/* ── Main route ─────────────────────────────────────── */

function TournamentRoute() {
    const { tournamentId } = useParams<{ tournamentId: string }>();
    const nav = useNavigate();
    const intl = useIntlFormatProvider();
    const acctQ = useQueryAccount({ enabled: true });
    const tQ = useQueryTournament(tournamentId ?? null, { enabled: true });

    const [busy, setBusy] = useState(false);
    const [searchQ, setSearchQ] = useState(``);
    const [searchRes, setSearchRes] = useState<Awaited<ReturnType<typeof searchTournamentPlayers>>[`users`]>([]);
    const [swapTarget, setSwapTarget] = useState<string | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [wlText, setWlText] = useState(``);
    const [wlResult, setWlResult] = useState<{ matched: string[]; unmatched: string[] } | null>(null);
    const [blText, setBlText] = useState(``);
    const [blResult, setBlResult] = useState<{ matched: string[]; unmatched: string[] } | null>(null);
    const [devCount, setDevCount] = useState(8);
    const [devState, setDevState] = useState<`registered` | `checked-in`>(`checked-in`);

    const t = tQ.data ?? null;
    const acct = acctQ.data?.user ?? null;

    const [shownSubscribedToast, setShownSubscribedToast] = useState(false);
    useEffect(() => {
        const viewerParticipant = t?.participants.find((p) => p.profileId === acct?.id);
        const isOut = viewerParticipant?.status === `eliminated` || viewerParticipant?.status === `dropped`;
        if (shownSubscribedToast || !t || !t.viewer.autoSubscribedOnView || t.viewer.isCreator || t.viewer.canManage || t.status === `completed` || t.status === `cancelled` || isOut) return;
        setShownSubscribedToast(true);
        toast.info(`Subscribed to ${t.name}.`, { toastId: `subscribed:${t.id}` });
    }, [t, shownSubscribedToast]);

    const run = async (action: () => Promise<unknown>, msg: string) => {
        try { setBusy(true); await action(); toast.success(msg, { toastId: `ok:${msg}` }); await tQ.refetch(); }
        catch (e: unknown) { toast.error(e instanceof Error ? e.message : `Failed.`, { toastId: `err` }); }
        finally { setBusy(false); }
    };

    const doSearch = async () => {
        if (!searchQ.trim()) return;
        try { setSearchRes((await searchTournamentPlayers(searchQ)).users); }
        catch (e: unknown) { toast.error(e instanceof Error ? e.message : `Search failed.`, { toastId: `search-err` }); }
    };

    if (!tournamentId) return null;
    const dot = STATUS_DOT[t?.status ?? ``] ?? `bg-slate-400`;
    const label = STATUS_LABEL[t?.status ?? ``] ?? t?.status ?? ``;
    const formatLabel = t?.format === `swiss`
        ? `Swiss`
        : t?.format === `single-elimination`
            ? `Single Elim`
            : t?.format === `double-elimination`
                ? `Double Elim`
                : ``;
    const formatBadge = t?.format === `swiss`
        ? `Swiss`
        : t?.format === `single-elimination`
            ? `SE`
            : t?.format === `double-elimination`
                ? `DE`
                : t?.format ?? ``;

    // Group matches by bracket:round
    const grouped = new Map<string, TournamentMatch[]>();
    for (const m of t?.matches ?? []) {
        const k = `${m.bracket}:${m.round}`;
        (grouped.get(k) ?? (() => { const a: TournamentMatch[] = []; grouped.set(k, a); return a; })()).push(m);
    }
    const bracketName = (b: string) =>
        b === `swiss` ? `Swiss` : b === `winners` ? `Winners` : b === `losers` ? `Losers` : b === `grand-final` ? `Grand Final` : b === `grand-final-reset` ? `GF Reset` : b === `third-place` ? `Third Place` : b;

    return (
        <>
            <PageMetadata
                title={t ? `${t.name} • ${DEFAULT_PAGE_TITLE}` : `Tournament • ${DEFAULT_PAGE_TITLE}`}
                description={t?.description ?? `Tournament bracket and live matches.`}
            />

            <PageCorpus
                category="Tournament" title={t?.name ?? `Loading...`}
                description={t ? `${formatLabel} · ${formatDateTime(intl, t.scheduledStartAt)}` : ``}
                back="Tournaments" onBack={() => void nav(`/tournaments`)} onRefresh={() => void tQ.refetch()}
            >

                {!t ? (
                    <div className="px-4 pb-6 sm:px-6">
                        <div className="rounded-xl border border-white/8 bg-slate-900/50 p-6 text-center text-sm text-slate-500">
                            Loading...
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 px-4 pb-6 sm:px-6">
                        {/* ── Status bar ── */}
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-slate-900/50 px-4 py-3">
                            <span className={`h-2 w-2 rounded-full ${dot}`} />

                            <span className="text-[13px] font-semibold text-white">
                                {label}
                            </span>

                            <Chip>
                                {formatBadge}
                            </Chip>

                            <div className="ml-auto flex items-center gap-2 text-[12px] tabular-nums">
                                <span className="font-bold text-white">
                                    {t.checkedInCount}

                                    <span className="font-normal text-slate-500">
                                        /
                                        {t.maxPlayers}
                                    </span>
                                </span>

                                <span className="text-slate-600">
                                    ·
                                </span>

                                <span className="text-slate-400">
                                    Check-in
                                    {formatDateTime(intl, t.checkInOpensAt)}
                                </span>

                                <span className="text-slate-600">
                                    ·
                                </span>

                                <span className="text-slate-400">
                                    Start
                                    {formatDateTime(intl, t.scheduledStartAt)}
                                </span>

                                {t.matches.length > 0 && (
                                    <>
                                        <span className="text-slate-600">
                                            ·
                                        </span>

                                        <button
                                            onClick={() => void nav(`/tournaments/${t.id}/bracket`)}
                                            className="font-semibold text-sky-300 transition hover:text-sky-200"
                                        >
                                            View Bracket
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* ── Next match banner ── */}
                        {t.viewer.nextMatch && (
                            <div className="flex items-center gap-3 rounded-xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.1),rgba(15,23,42,0.8)_60%)] px-4 py-3 shadow-[0_4px_20px_rgba(251,191,36,0.1)]">
                                <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />

                                <div className="flex-1">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/70">
                                        Your Match · 
                                        {` `}
                                        {t.viewer.nextMatch.bracket.replace(/-/g, ` `)}
                                        {` `}
                                        R
                                        {t.viewer.nextMatch.round}
                                    </div>

                                    <div className="mt-0.5 text-[13px] font-bold text-white">
                                        {t.viewer.nextMatch.opponentDisplayName
                                            ? `vs ${t.viewer.nextMatch.opponentDisplayName}`
                                            : `Waiting for opponent`}

                                        {(t.viewer.nextMatch.leftWins > 0 || t.viewer.nextMatch.rightWins > 0) && (
                                            <span className="ml-2 text-[11px] font-normal tabular-nums text-slate-400">
                                                {t.viewer.nextMatch.leftWins}
                                                –
                                                {t.viewer.nextMatch.rightWins}
                                                {` `}
                                                in BO
                                                {t.viewer.nextMatch.bestOf}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        const el = document.getElementById(`match-${t.viewer.nextMatch!.matchId}`);
                                        if (el) {
                                            el.scrollIntoView({ behavior: `smooth`, block: `center` });
                                            el.classList.add(`ring-2`, `ring-amber-400/60`, `shadow-[0_0_16px_rgba(251,191,36,0.25)]`);
                                            setTimeout(() => el.classList.remove(`ring-2`, `ring-amber-400/60`, `shadow-[0_0_16px_rgba(251,191,36,0.25)]`), 2500);
                                        }
                                    }}
                                    className="shrink-0 rounded-full bg-amber-300 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-[0_4px_16px_rgba(251,191,36,0.35)] transition hover:-translate-y-0.5 hover:bg-amber-200"
                                >
                                    Go to Match
                                </button>
                            </div>
                        )}

                        {/* Waitlist banner */}
                        {t.status === `waitlist-open` && t.waitlistClosesAt && (
                            <WaitlistBanner closesAt={t.waitlistClosesAt} availableSlots={t.maxPlayers - t.checkedInCount} />
                        )}

                        {/* ── Actions ── */}
                        <div className="flex flex-wrap items-center gap-2">
                            {t.viewer.canRegister && (
                                <button
                                    onClick={() => void run(() => registerForTournament(t.id), `Registered.`)} disabled={busy}
                                    className="rounded-full bg-amber-300 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-[0_4px_14px_rgba(251,191,36,0.3)] transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:opacity-50"
                                >
                                    Register
                                </button>
                            )}

                            {t.viewer.canJoinWaitlist && (
                                <button
                                    onClick={() => void run(() => registerForTournament(t.id), `Joined waitlist.`)} disabled={busy}
                                    className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200 transition hover:-translate-y-0.5 hover:bg-amber-300/20 disabled:opacity-50"
                                >
                                    Join Waitlist
                                </button>
                            )}

                            {t.viewer.canCheckIn && (
                                <button
                                    onClick={() => void run(() => checkInTournament(t.id), t.status === `waitlist-open` ? `Checked in from waitlist!` : `Checked in.`)} disabled={busy}
                                    className="rounded-full bg-sky-400 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:opacity-50"
                                >
                                    {t.status === `waitlist-open` ? `Claim Spot` : `Check In`}
                                </button>
                            )}

                            {t.viewer.canWithdraw && (
                                <Confirm
                                    label="Withdraw" onConfirm={() => void run(() => withdrawFromTournament(t.id), `Withdrawn.`)}
                                    className="rounded-full border border-white/10 bg-white/6 px-4 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/12 disabled:opacity-50"
                                />
                            )}

                            <button
                                onClick={() => {
                                    void navigator.clipboard.writeText(`${window.location.origin}/tournaments/${t.id}`);
                                    toast.success(`Link copied!`, { toastId: `copy-link` });
                                }}
                                className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:bg-white/12 hover:text-white"
                            >
                                Copy Link
                            </button>

                            {t.status === `live` && (
                                <Link
                                    to={`/tournaments/${t.id}/multiview`}
                                    className="rounded-full border border-sky-300/20 bg-sky-300/12 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-100 transition hover:-translate-y-0.5 hover:bg-sky-300/18"
                                >
                                    Multiview (Beta)
                                </Link>
                            )}

                            {/* Organizer buttons */}
                            {t.viewer.canManage && (
                                <div className="ml-auto flex items-center gap-2">
                                    {t.status === `check-in-open` && (
                                        <button
                                            onClick={() => void run(() => startTournament(t.id), `Started.`)} disabled={busy}
                                            className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase text-amber-200 transition hover:bg-amber-300/20 disabled:opacity-50"
                                        >
                                            Start
                                        </button>
                                    )}

                                    {t.status !== `live` && t.status !== `completed` && t.status !== `cancelled` && (
                                        <button
                                            onClick={() => setEditOpen(true)}
                                            className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                                        >
                                            Edit
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setManageOpen(true)}
                                        className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/12"
                                    >
                                        Manage
                                    </button>

                                    {t.status !== `completed` && t.status !== `cancelled` && (
                                        <Confirm
                                            label="Cancel" onConfirm={() => void run(() => cancelTournament(t.id), `Cancelled.`)}
                                            className="rounded-full border border-rose-400/15 bg-rose-400/8 px-3 py-1.5 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-400/15"
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                        {t.description && (
                            <p className="text-[13px] leading-5 text-slate-400">
                                {t.description}
                            </p>
                        )}

                        {/* ── Final standings (completed tournaments) ── */}
                        {t.status === `completed` && t.standings.length > 0 && (
                            <FinalStandings
                                standings={t.standings} participants={t.participants} matches={t.matches}
                                format={t.format as StandingsFormat} tournamentName={t.name}
                                viewerProfileId={acct?.id ?? null}
                            />
                        )}

                        {/* Round delay countdown */}
                        {t.status === `live` && t.roundDelayMinutes > 0 && (
                            <RoundDelayCountdown tournament={t} />
                        )}

                        {/* ── Two-column: bracket + sidebar ── */}
                        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                            {/* Matches */}
                            <div className="space-y-4">
                                {grouped.size === 0 ? (
                                    <div className="rounded-xl border border-dashed border-white/6 bg-slate-950/30 py-8 text-center text-[12px] text-slate-600">
                                        Bracket appears when the tournament goes live.
                                    </div>
                                ) : (
                                    Array.from(grouped.entries()).map(([key, matches]) => {
                                        const [bracket, round] = key.split(`:`);
                                        return (
                                            <div key={key}>
                                                <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                                                    {bracketName(bracket)}
                                                    {` `}
                                                    · R
                                                    {round}
                                                </div>

                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {matches.sort((a, b) => a.order - b.order).map((m) => (
                                                        <MatchCard
                                                            key={m.id} match={m} canManage={t.viewer.canManage}
                                                            viewerProfileId={acct?.id ?? null}
                                                            timeoutAt={t.matchJoinTimeoutMinutes > 0 && m.state === `in-progress` && m.startedAt !== null ? m.startedAt + t.matchJoinTimeoutMinutes * 60_000 : null}
                                                            timeoutMinutes={t.matchJoinTimeoutMinutes}
                                                            pendingExtension={t.extensionRequests.find((r) => r.matchId === m.id && r.status === `pending`) ?? null}
                                                            claimWinExpiresAt={null}
                                                            onOpen={(sid) => void nav(`/session/${sid}`)}
                                                            onWalkover={(mid, pid) => void run(() => awardTournamentWalkover(t.id, mid, pid), `Walkover.`)}
                                                            onReopen={(mid) => void run(() => reopenTournamentMatch(t.id, mid), `Reopened.`)}
                                                            onRequestExtension={(mid) => void run(() => requestMatchExtension(t.id, mid), `Extension requested.`)}
                                                            onResolveExtension={(eid, approve) => void run(() => resolveExtension(t.id, eid, approve), approve ? `Extension approved.` : `Extension denied.`)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Sidebar: standings + participants + activity */}
                            <div className="space-y-4">
                                {/* Swiss standings */}
                                {t.format === `swiss` && t.standings.length > 0 && (
                                    <div className="rounded-xl border border-white/8 bg-slate-900/50 p-3">
                                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                            Standings
                                        </div>

                                        <div className="space-y-0.5">
                                            {t.standings.map((s, i) => (
                                                <div
                                                    key={s.profileId}
                                                    className={`flex items-center gap-2 rounded px-2 py-1 ${i === 0 ? `bg-amber-300/8` : `bg-white/2`}`}
                                                >
                                                    <span className={`w-4 text-center text-[10px] font-bold ${i === 0 ? `text-amber-300` : `text-slate-500`}`}>
                                                        {s.rank}
                                                    </span>

                                                    <span className="flex-1 truncate text-[12px] font-medium text-white">
                                                        {s.displayName}
                                                    </span>

                                                    <span className="text-[11px] font-bold tabular-nums text-white">
                                                        {s.matchPoints}
                                                    </span>

                                                    <span className="text-[10px] tabular-nums text-slate-500">
                                                        {s.wins}
                                                        -
                                                        {s.losses}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Participants */}
                                <div className="rounded-xl border border-white/8 bg-slate-900/50 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                            Participants
                                        </span>

                                        <span className="text-[10px] tabular-nums text-slate-600">
                                            {t.registeredCount}
                                        </span>
                                    </div>

                                    <ParticipantList
                                        participants={t.participants} standings={t.standings}
                                        canManage={t.viewer.canManage} isLive={t.status === `live`}
                                        viewerProfileId={acct?.id ?? null}
                                        tournamentId={t.id} tournamentStatus={t.status}
                                        onRemove={(pid) => void run(() => removeTournamentParticipant(t.id, pid), t.status === `live` ? `Disqualified.` : `Removed.`)}
                                        onSwapSelect={setSwapTarget} swapTarget={swapTarget}
                                    />
                                </div>

                                {/* Activity */}
                                <div className="rounded-xl border border-white/8 bg-slate-900/50 p-3">
                                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                        Activity
                                    </div>

                                    {t.activity.length === 0
                                        ? <div className="py-2 text-center text-[11px] text-slate-600">
                                            No activity
                                        </div>
                                        : (
                                            <div className="max-h-48 space-y-0.5 overflow-y-auto">
                                                {t.activity.slice(0, 40).map((e) => (
                                                    <div key={e.id} className="flex items-baseline justify-between gap-2 rounded px-2 py-1 text-[11px]">
                                                        <span className="text-slate-300">
                                                            {e.message}
                                                        </span>

                                                        <span className="shrink-0 text-[9px] tabular-nums text-slate-600">
                                                            {formatDateTime(intl, e.timestamp)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </PageCorpus>

            {/* ── Edit modal ── */}
            <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Tournament">
                {t && (
                    <TournamentEditorCard
                        formKey={`${t.id}:${t.updatedAt}`} title="Settings" description=""
                        defaultRequest={buildCreateTournamentRequestFromDetail(t)}
                        submitLabel="Save" submitting={busy}
                        onSubmit={(request) => void run(() => updateTournament(t.id, request), `Updated.`).then(() => setEditOpen(false))}
                    />
                )}
            </Modal>

            {/* ── Manage modal (search + add/swap + dev seed) ── */}
            <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="Manage Players">
                {t && (
                    <div className="space-y-4">
                        {/* Search */}
                        <div className="flex gap-2">
                            <input
                                value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                                onKeyDown={(e) => { if (e.key === `Enter`) void doSearch(); }}
                                className="flex-1 rounded-lg border border-white/8 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30"
                                placeholder="Search Discord username..."
                            />

                            <button
                                onClick={() => void doSearch()}
                                className="rounded-lg bg-sky-400 px-4 py-2 text-[11px] font-bold text-slate-950 transition hover:bg-sky-300"
                            >
                                Search
                            </button>
                        </div>

                        {swapTarget && (
                            <div className="rounded-lg border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-[11px] text-amber-200">
                                Swapping 
                                {` `}

                                <strong>
                                    {t.participants.find((p) => p.profileId === swapTarget)?.displayName ?? `player`}
                                </strong>

                                {` `}
                                — pick replacement below
                            </div>
                        )}

                        {searchRes.length > 0 ? (
                            <div className="space-y-1">
                                {searchRes.map((u) => (
                                    <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/4 px-3 py-2">
                                        <span className="text-[13px] font-medium text-white">
                                            {u.username}
                                        </span>

                                        <div className="flex gap-1.5">
                                            <button
                                                onClick={() => void run(() => addTournamentParticipant(t.id, u.id), `Added ${u.username}.`)}
                                                className="rounded bg-emerald-400/12 px-2 py-1 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                                            >
                                                Add
                                            </button>

                                            {swapTarget && (
                                                <button
                                                    onClick={() => void run(() => swapTournamentParticipant(t.id, { profileId: swapTarget, replacementProfileId: u.id }), `Swapped.`).then(() => setSwapTarget(null))}
                                                    className="rounded bg-sky-400/12 px-2 py-1 text-[10px] font-semibold text-sky-200 transition hover:bg-sky-400/20"
                                                >
                                                    Swap In
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : searchQ.trim() && (
                            <div className="py-2 text-center text-[11px] text-slate-600">
                                No results
                            </div>
                        )}

                        {/* Organizer management */}
                        {t.viewer.canManage && (
                            <div className="border-t border-white/6 pt-3">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/60">
                                    Organizers
                                </div>

                                {t.organizers.length === 0 ? (
                                    <div className="py-1 text-[11px] text-slate-600">
                                        No additional organizers
                                    </div>
                                ) : (
                                    <div className="space-y-1 mb-2">
                                        {t.organizers.map((org) => (
                                            <div key={org.profileId} className="flex items-center justify-between gap-2 rounded-lg bg-white/4 px-3 py-1.5">
                                                <span className="text-[13px] font-medium text-white">
                                                    {org.displayName}
                                                </span>

                                                <Confirm
                                                    label="Remove" onConfirm={() => void run(() => revokeTournamentOrganizer(t.id, org.profileId), `Removed organizer.`)}
                                                    className="rounded bg-rose-400/12 px-2 py-0.5 text-[9px] font-semibold text-rose-200 transition hover:bg-rose-400/20"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="text-[10px] text-slate-500">
                                    Search above and use the buttons below to grant organizer access:
                                </div>

                                {searchRes.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                        {searchRes.map((u) => (
                                            <div key={`org-${u.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/3 px-3 py-1.5">
                                                <span className="text-[12px] text-slate-300">
                                                    {u.username}
                                                </span>

                                                <button
                                                    onClick={() => void run(() => grantTournamentOrganizer(t.id, u.id), `Granted organizer.`)}
                                                    className="rounded bg-amber-300/12 px-2 py-0.5 text-[9px] font-semibold text-amber-200 transition hover:bg-amber-300/20"
                                                >
                                                    Grant
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Whitelist */}
                        {t.viewer.canManage && (
                            <div className="border-t border-white/6 pt-3">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/60">
                                    Whitelist
                                    {t.whitelist.length > 0 && <span className="ml-1 text-slate-600">({t.whitelist.length})</span>}
                                </div>

                                <p className="mb-2 text-[10px] text-slate-600">
                                    Only whitelisted users can register. Leave empty to allow everyone.
                                </p>

                                {t.whitelist.map((entry) => (
                                    <div key={entry.profileId} className="flex items-center justify-between gap-2 rounded-lg bg-white/4 px-3 py-1.5 mb-1">
                                        <span className="text-[13px] font-medium text-white">{entry.displayName}</span>
                                        <Confirm
                                            label="Remove" onConfirm={() => void run(() => removeFromAccessList(t.id, `whitelist`, entry.profileId), `Removed.`)}
                                            className="rounded bg-rose-400/12 px-2 py-0.5 text-[9px] font-semibold text-rose-200 transition hover:bg-rose-400/20"
                                        />
                                    </div>
                                ))}

                                <textarea
                                    value={wlText} onChange={(e) => { setWlText(e.target.value); setWlResult(null); }}
                                    rows={3} placeholder="Paste usernames, one per line"
                                    className="mt-2 w-full rounded-md border border-white/8 bg-slate-950/60 px-2.5 py-1.5 text-[12px] text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/30"
                                />
                                <button
                                    disabled={busy || !wlText.trim()}
                                    onClick={async () => {
                                        const names = wlText.split(`\n`).map((n) => n.trim()).filter(Boolean);
                                        if (names.length === 0) return;
                                        try {
                                            setBusy(true);
                                            const result = await bulkAddToAccessList(t.id, `whitelist`, names);
                                            setWlResult(result);
                                            setWlText(``);
                                            await tQ.refetch();
                                            if (result.matched.length > 0) toast.success(`Added ${result.matched.length} to whitelist.`, { toastId: `wl-bulk` });
                                        } catch (e: unknown) {
                                            toast.error(e instanceof Error ? e.message : `Failed.`, { toastId: `wl-bulk-err` });
                                        } finally { setBusy(false); }
                                    }}
                                    className="mt-1 rounded bg-emerald-400/12 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    + Add Whitelist
                                </button>

                                {wlResult && (
                                    <div className="mt-2 space-y-1 text-[11px]">
                                        {wlResult.matched.length > 0 && (
                                            <div className="text-emerald-300">
                                                Matched: {wlResult.matched.join(`, `)}
                                            </div>
                                        )}
                                        {wlResult.unmatched.length > 0 && (
                                            <div className="text-rose-300">
                                                Not found: {wlResult.unmatched.join(`, `)}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {searchRes.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                        {searchRes.filter((u) => !t.whitelist.some((e) => e.profileId === u.id)).map((u) => (
                                            <div key={`wl-${u.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/3 px-3 py-1.5">
                                                <span className="text-[12px] text-slate-300">{u.username}</span>
                                                <button
                                                    onClick={() => void run(() => addToAccessList(t.id, `whitelist`, u.id), `Added to whitelist.`)}
                                                    className="rounded bg-emerald-400/12 px-2 py-0.5 text-[9px] font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                                                >
                                                    + Whitelist
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Blacklist */}
                        {t.viewer.canManage && (
                            <div className="border-t border-white/6 pt-3">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300/60">
                                    Blacklist
                                    {t.blacklist.length > 0 && <span className="ml-1 text-slate-600">({t.blacklist.length})</span>}
                                </div>

                                <p className="mb-2 text-[10px] text-slate-600">
                                    Blacklisted users cannot register for this tournament.
                                </p>

                                {t.blacklist.map((entry) => (
                                    <div key={entry.profileId} className="flex items-center justify-between gap-2 rounded-lg bg-white/4 px-3 py-1.5 mb-1">
                                        <span className="text-[13px] font-medium text-white">{entry.displayName}</span>
                                        <Confirm
                                            label="Remove" onConfirm={() => void run(() => removeFromAccessList(t.id, `blacklist`, entry.profileId), `Removed.`)}
                                            className="rounded bg-rose-400/12 px-2 py-0.5 text-[9px] font-semibold text-rose-200 transition hover:bg-rose-400/20"
                                        />
                                    </div>
                                ))}

                                <textarea
                                    value={blText} onChange={(e) => { setBlText(e.target.value); setBlResult(null); }}
                                    rows={3} placeholder="Paste usernames, one per line"
                                    className="mt-2 w-full rounded-md border border-white/8 bg-slate-950/60 px-2.5 py-1.5 text-[12px] text-white outline-none transition placeholder:text-slate-600 focus:border-rose-400/30"
                                />
                                <button
                                    disabled={busy || !blText.trim()}
                                    onClick={async () => {
                                        const names = blText.split(`\n`).map((n) => n.trim()).filter(Boolean);
                                        if (names.length === 0) return;
                                        try {
                                            setBusy(true);
                                            const result = await bulkAddToAccessList(t.id, `blacklist`, names);
                                            setBlResult(result);
                                            setBlText(``);
                                            await tQ.refetch();
                                            if (result.matched.length > 0) toast.success(`Added ${result.matched.length} to blacklist.`, { toastId: `bl-bulk` });
                                        } catch (e: unknown) {
                                            toast.error(e instanceof Error ? e.message : `Failed.`, { toastId: `bl-bulk-err` });
                                        } finally { setBusy(false); }
                                    }}
                                    className="mt-1 rounded bg-rose-400/12 px-2.5 py-1 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    + Add Blacklist
                                </button>

                                {blResult && (
                                    <div className="mt-2 space-y-1 text-[11px]">
                                        {blResult.matched.length > 0 && (
                                            <div className="text-emerald-300">
                                                Matched: {blResult.matched.join(`, `)}
                                            </div>
                                        )}
                                        {blResult.unmatched.length > 0 && (
                                            <div className="text-rose-300">
                                                Not found: {blResult.unmatched.join(`, `)}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {searchRes.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                        {searchRes.filter((u) => !t.blacklist.some((e) => e.profileId === u.id)).map((u) => (
                                            <div key={`bl-${u.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/3 px-3 py-1.5">
                                                <span className="text-[12px] text-slate-300">{u.username}</span>
                                                <button
                                                    onClick={() => void run(() => addToAccessList(t.id, `blacklist`, u.id), `Added to blacklist.`)}
                                                    className="rounded bg-rose-400/12 px-2 py-0.5 text-[9px] font-semibold text-rose-200 transition hover:bg-rose-400/20"
                                                >
                                                    + Blacklist
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Transfer ownership + leave (creator only) */}
                        {t.viewer.isCreator && t.organizers.length > 0 && t.status !== `completed` && t.status !== `cancelled` && (
                            <div className="border-t border-white/6 pt-3">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300/60">
                                    Transfer Ownership
                                </div>

                                <p className="mb-2 text-[11px] text-slate-500">
                                    Transfer your role as primary organizer to another organizer and unsubscribe from this tournament.
                                </p>

                                <div className="space-y-1">
                                    {t.organizers.map((org) => (
                                        <Confirm
                                            key={`transfer-${org.profileId}`}
                                            label={`Transfer to ${org.displayName} & Leave`}
                                            onConfirm={() => void run(
                                                () => unsubscribeFromTournament(t.id, org.profileId),
                                                `Ownership transferred to ${org.displayName}.`,
                                            )}
                                            className="block w-full rounded-lg border border-rose-300/15 bg-rose-400/6 px-3 py-2 text-left text-[12px] font-medium text-rose-200 transition hover:bg-rose-400/12"
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Dev seeder */}
                        {import.meta.env.DEV && t.status !== `live` && t.status !== `completed` && t.status !== `cancelled` && (
                            <div className="border-t border-white/6 pt-3">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/60">
                                    Dev Seed
                                </div>

                                <div className="flex items-center gap-3">
                                    <input
                                        type="number" min={1} max={t.maxPlayers} value={devCount}
                                        onChange={(e) => setDevCount(Number.parseInt(e.target.value, 10) || 1)}
                                        className="w-16 rounded border border-white/8 bg-slate-950/60 px-2 py-1 text-center text-sm text-white outline-none"
                                    />

                                    <select
                                        value={devState} onChange={(e) => setDevState(e.target.value as `registered` | `checked-in`)}
                                        className="rounded border border-white/8 bg-slate-950/60 px-2 py-1 text-sm text-white outline-none"
                                    >
                                        <option value="checked-in">
                                            Checked In
                                        </option>

                                        <option value="registered">
                                            Registered
                                        </option>
                                    </select>

                                    <button
                                        onClick={() => void run(() => seedTournamentWithDevUsers(t.id, { count: Math.max(1, Math.min(devCount, t.maxPlayers)), state: devState }), `Seeded.`)}
                                        disabled={busy}
                                        className="rounded bg-emerald-400 px-3 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                                    >
                                        Seed
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Dev match resolver */}
                        {import.meta.env.DEV && t.status === `live` && (
                            <div className="border-t border-white/6 pt-3">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/60">
                                    Dev Resolve
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => void run(() => devResolveN(t.id, 1), `Resolved 1 match.`)}
                                        disabled={busy}
                                        className="rounded bg-amber-400 px-3 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
                                    >
                                        Resolve 1
                                    </button>

                                    <button
                                        onClick={() => void run(() => devResolveN(t.id, 5), `Resolved up to 5.`)}
                                        disabled={busy}
                                        className="rounded bg-amber-400 px-3 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
                                    >
                                        Resolve 5
                                    </button>

                                    <button
                                        onClick={() => void run(() => devResolveCurrentRound(t.id), `Round resolved.`)}
                                        disabled={busy}
                                        className="rounded bg-amber-400 px-3 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
                                    >
                                        Resolve Round
                                    </button>

                                    <button
                                        onClick={() => void run(() => devResolveAll(t.id), `All resolved.`)}
                                        disabled={busy}
                                        className="rounded bg-rose-400 px-3 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-rose-300 disabled:opacity-50"
                                    >
                                        Resolve All
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </Modal>
        </>
    );
}

export default TournamentRoute;
