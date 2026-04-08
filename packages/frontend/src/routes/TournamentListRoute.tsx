import type { CreateTournamentRequest, TournamentSummary, TournamentUpcomingMatch } from '@ih3t/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';

import PageCorpus from '../components/PageCorpus';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import TournamentEditorCard, { createDefaultTournamentRequest } from '../components/TournamentEditorCard';
import { useQueryAccount } from '../query/accountClient';
import { createQuickSealBotTournament, seedTournamentWithDevUsers } from '../query/devAuthClient';
import {
    createTournament,
    startTournament,
    unsubscribeFromTournament,
    useQueryTournaments,
} from '../query/tournamentClient';
import { formatDateTime, useIntlFormatProvider } from '../utils/dateTime';

/* ── constants ─────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
    draft: `text-slate-400`,
    'registration-open': `text-sky-300`,
    'check-in-open': `text-amber-300`,
    live: `text-emerald-300`,
    completed: `text-slate-400`,
    cancelled: `text-rose-300`,
};

const FORMAT_SHORT: Record<string, string> = {
    'single-elimination': `SE`,
    'double-elimination': `DE`,
    swiss: `Swiss`,
};

const DAY_NAMES = [`Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`] as const;

/* ── helpers ───────────────────────────────────────── */

function getMonday(d: Date): Date {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTimeShort(ts: number) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: `numeric`, minute: `2-digit` });
}

function describeTimeControl(t: TournamentSummary): string {
    if (t.timeControl.mode === `turn`) return `${Math.round(t.timeControl.turnTimeMs / 1000)}s/turn`;
    if (t.timeControl.mode === `match`) return `${Math.round(t.timeControl.mainTimeMs / 60_000)}+${Math.round(t.timeControl.incrementMs / 1000)}`;
    return `No clock`;
}

/* ── calendar types ────────────────────────────────── */

type CalendarEvent = {
    timestamp: number
    label: string
    type: `start` | `check-in` | `match`
    tournamentId: string
};

function buildCalendarEvents(tournaments: TournamentSummary[], upcomingMatches: TournamentUpcomingMatch[]): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const now = Date.now();
    for (const t of tournaments) {
        if (t.scheduledStartAt > now) {
            events.push({ timestamp: t.scheduledStartAt, label: t.name, type: `start`, tournamentId: t.id });
        }
        if (t.checkInOpensAt > now && t.checkInOpensAt !== t.scheduledStartAt) {
            events.push({ timestamp: t.checkInOpensAt, label: `${t.name} check-in`, type: `check-in`, tournamentId: t.id });
        }
    }
    for (const m of upcomingMatches) {
        events.push({ timestamp: now, label: `vs ${m.opponentDisplayName ?? `TBD`}`, type: `match`, tournamentId: m.tournamentId });
    }
    return events;
}

/* ── weekly calendar ───────────────────────────────── */

const EVENT_COLORS: Record<CalendarEvent[`type`], string> = {
    start: `bg-sky-400/15 text-sky-300 border-sky-400/20`,
    'check-in': `bg-amber-400/10 text-amber-300 border-amber-400/15`,
    match: `bg-emerald-400/12 text-emerald-300 border-emerald-400/20`,
};

function WeeklyCalendar({ tournaments, upcomingMatches, onNavigate }: {
    tournaments: TournamentSummary[]
    upcomingMatches: TournamentUpcomingMatch[]
    onNavigate: (tournamentId: string) => void
}) {
    const [weekOffset, setWeekOffset] = useState(0);
    const today = new Date();
    const baseMonday = getMonday(today);
    const monday = new Date(baseMonday);
    monday.setDate(monday.getDate() + weekOffset * 7);

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        return d;
    });

    const events = useMemo(() => buildCalendarEvents(tournaments, upcomingMatches), [tournaments, upcomingMatches]);

    const isCurrentWeek = weekOffset === 0;

    const weekLabel = (() => {
        const sun = days[6]!;
        const mMonth = monday.toLocaleString(undefined, { month: `short` });
        const sMonth = sun.toLocaleString(undefined, { month: `short` });
        if (mMonth === sMonth) return `${mMonth} ${monday.getDate()}–${sun.getDate()}`;
        return `${mMonth} ${monday.getDate()} – ${sMonth} ${sun.getDate()}`;
    })();

    return (
        <div className="rounded-2xl border border-white/8 bg-slate-950/50">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
                <button type="button" onClick={() => setWeekOffset((w) => w - 1)}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/6 hover:text-white">
                    &larr;
                </button>
                <div className="text-center">
                    <div className="text-[13px] font-bold text-white">{weekLabel}</div>
                    {!isCurrentWeek && (
                        <button type="button" onClick={() => setWeekOffset(0)}
                            className="text-[9px] text-sky-400 transition hover:text-sky-300">Return to This Week</button>
                    )}
                </div>
                <button type="button" onClick={() => setWeekOffset((w) => w + 1)}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/6 hover:text-white">
                    &rarr;
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-white/4">
                {DAY_NAMES.map((name) => (
                    <div key={name} className="py-1.5 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        {name}
                    </div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
                {days.map((day, i) => {
                    const isToday = isSameDay(day, today);
                    const dayEvents = events.filter((e) => isSameDay(new Date(e.timestamp), day));
                    return (
                        <div
                            key={i}
                            className={`min-h-[11.13rem] border-r border-white/4 p-1.5 last:border-r-0 ${isToday ? `bg-white/[0.03]` : ``}`}
                        >
                            <div className={`mb-1 text-center text-[11px] font-bold tabular-nums ${isToday ? `text-sky-300` : `text-slate-500`}`}>
                                {day.getDate()}
                            </div>
                            <div className="space-y-0.5">
                                {[...dayEvents].sort((a, b) => a.timestamp - b.timestamp).map((e, ei) => (
                                    <button
                                        key={ei} type="button"
                                        onClick={() => onNavigate(e.tournamentId)}
                                        className={`block w-full rounded border px-1 py-0.5 text-left text-[8px] font-medium leading-tight break-words transition hover:brightness-125 ${EVENT_COLORS[e.type]}`}
                                    >
                                        {e.type !== `match` && <span className="text-[7px] opacity-60">{formatTimeShort(e.timestamp)} </span>}
                                        {e.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── tournament card (taller) ──────────────────────── */

function TournamentCard({ tournament, onClick, onUnsubscribe }: {
    tournament: TournamentSummary; onClick: () => void; onUnsubscribe?: () => void
}) {
    const intl = useIntlFormatProvider();
    const statusColor = STATUS_COLORS[tournament.status] ?? `text-slate-400`;
    const statusBg = statusColor.replace(`text-`, `bg-`);
    const [confirmUnsub, setConfirmUnsub] = useState(false);

    return (
        <div className="group relative rounded-2xl border border-white/6 bg-slate-950/40 transition hover:border-white/12 hover:bg-slate-900/60">
            <button type="button" onClick={onClick} className="w-full px-4 py-4 text-left">
                {/* Top row: name + status */}
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${statusBg}`} />
                            <span className="truncate text-[15px] font-bold text-white group-hover:text-sky-50">
                                {tournament.name}
                            </span>
                        </div>
                        <div className="mt-1 pl-4 text-[11px] text-slate-500">
                            by {tournament.createdByDisplayName}
                        </div>
                    </div>

                    <div className="shrink-0 text-right">
                        <div className="text-lg font-black tabular-nums text-white">
                            {tournament.checkedInCount}
                            <span className="text-[12px] font-medium text-slate-500">/{tournament.maxPlayers}</span>
                        </div>
                    </div>
                </div>

                {/* Details row */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {FORMAT_SHORT[tournament.format] ?? tournament.format}
                    </span>
                    <span className="rounded-md border border-white/6 bg-white/3 px-2 py-0.5 text-[10px] text-slate-500">
                        {describeTimeControl(tournament)}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusColor}`}>
                        {tournament.status.replace(/-/g, ` `)}
                    </span>
                </div>

                {/* Time */}
                <div className="mt-2 text-[11px] text-slate-600">
                    {formatDateTime(intl, tournament.scheduledStartAt)}
                </div>
            </button>

            {/* Unsubscribe */}
            {onUnsubscribe && !confirmUnsub && (
                <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmUnsub(true); }}
                    className="absolute right-2.5 top-2.5 rounded-md bg-white/4 px-2 py-0.5 text-[9px] font-semibold text-slate-500 opacity-0 transition hover:bg-white/8 hover:text-slate-300 group-hover:opacity-100">
                    &times;
                </button>
            )}
            {onUnsubscribe && confirmUnsub && (
                <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => { setConfirmUnsub(false); onUnsubscribe(); }}
                        className="rounded-md bg-rose-500/60 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-rose-500">Yes</button>
                    <button type="button" onClick={() => setConfirmUnsub(false)}
                        className="rounded-md bg-white/8 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/14">No</button>
                </span>
            )}
        </div>
    );
}

/* ── section header ────────────────────────────────── */

function SectionHeader({ label, count }: { label: string; count: number }) {
    return (
        <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
            <span className="text-[10px] tabular-nums text-slate-600">{count}</span>
        </div>
    );
}

/* ── main route ────────────────────────────────────── */

function TournamentListRoute() {
    const nav = useNavigate();
    const acctQ = useQueryAccount({ enabled: true });
    const [pastPage, setPastPage] = useState(1);
    const tQ = useQueryTournaments({ enabled: true, pastPage });
    const [submitting, setSubmitting] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [quickCreating, setQuickCreating] = useState(false);
    const [quickSealBotCreating, setQuickSealBotCreating] = useState(false);

    const acct = acctQ.data?.user ?? null;
    const data = tQ.data;
    const pastTotal = data?.pastTotal ?? 0;
    const pastPageCount = Math.max(1, Math.ceil(pastTotal / 20));
    const tournaments = data?.tournaments ?? [];
    const upcomingMatches = data?.upcomingMatches ?? [];

    const handleCreate = async (request: CreateTournamentRequest) => {
        try {
            setSubmitting(true);
            const t = await createTournament(request);
            void nav(`/tournaments/${t.id}`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : `Failed to create tournament.`, { toastId: `create-err` });
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnsubscribe = async (tournamentId: string) => {
        try {
            await unsubscribeFromTournament(tournamentId);
            toast.success(`Unsubscribed.`, { toastId: `unsub` });
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : `Failed to unsubscribe.`, { toastId: `unsub-err` });
        }
    };

    const handleQuickCreate = async () => {
        if (!import.meta.env.DEV) return;
        try {
            setQuickCreating(true);
            const request: CreateTournamentRequest = {
                name: `Quick Test ${new Date().toLocaleTimeString()}`,
                format: `double-elimination`,
                visibility: `private`,
                scheduledStartAt: Date.now() + 60_000,
                checkInWindowMinutes: 5,
                maxPlayers: 256,
                timeControl: { mode: `turn`, turnTimeMs: 45_000 },
                seriesSettings: { earlyRoundsBestOf: 1, finalsBestOf: 3, grandFinalBestOf: 5, grandFinalResetEnabled: true },
                matchJoinTimeoutMinutes: 5,
                matchExtensionMinutes: 5,
            };
            const t = await createTournament(request);
            toast.info(`Created. Seeding 256 players...`, { toastId: `quick-create` });
            await seedTournamentWithDevUsers(t.id, { count: 256, state: `checked-in` });
            toast.info(`Seeded. Starting...`, { toastId: `quick-create` });
            await startTournament(t.id);
            toast.success(`Tournament started!`, { toastId: `quick-create` });
            void nav(`/tournaments/${t.id}`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : `Quick create failed.`, { toastId: `quick-create-err` });
        } finally {
            setQuickCreating(false);
        }
    };

    const handleQuickSealBotCreate = async () => {
        if (!import.meta.env.DEV) return;

        try {
            setQuickSealBotCreating(true);
            const tournament = await createQuickSealBotTournament();
            toast.success(`8-player Seal Bot tournament created.`, { toastId: `quick-seal-bot` });
            void nav(`/tournaments/${tournament.id}`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : `Quick Seal Bot tournament failed.`, { toastId: `quick-seal-bot-err` });
        } finally {
            setQuickSealBotCreating(false);
        }
    };

    return (
        <>
            <PageMetadata
                title={`Tournaments • ${DEFAULT_PAGE_TITLE}`}
                description="Browse and create Infinity Hexagonal Tic-Tac-Toe tournaments."
            />

            <PageCorpus
                category="Competition" title="Tournaments"
                description="Create a tournament and share the link to invite players."
                onRefresh={() => void tQ.refetch()}
            >
                <div className="grid gap-6 px-4 pb-6 sm:px-6 xl:grid-cols-2">
                    {/* Left — tournament lists */}
                    <div className="space-y-5">
                        {/* Active */}
                        <div>
                            <SectionHeader label="Active" count={tournaments.length} />
                            {tournaments.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/6 px-4 py-8 text-center text-[12px] text-slate-600">
                                    No active tournaments. Create one or open a tournament link to subscribe.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tournaments.map((t) => (
                                        <TournamentCard
                                            key={t.id} tournament={t}
                                            onClick={() => void nav(`/tournaments/${t.id}`)}
                                            onUnsubscribe={() => void handleUnsubscribe(t.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Past */}
                        {pastTotal > 0 && <div>
                            <SectionHeader label="Past" count={pastTotal} />
                            {(data?.past ?? []).length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/6 px-4 py-4 text-center text-[12px] text-slate-600">
                                    None yet
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(data?.past ?? []).map((t) => (
                                        <TournamentCard
                                            key={t.id} tournament={t}
                                            onClick={() => void nav(`/tournaments/${t.id}`)}
                                        />
                                    ))}
                                </div>
                            )}

                            {pastPageCount > 1 && (
                                <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-slate-500">
                                    <button type="button" disabled={pastPage <= 1}
                                        onClick={() => setPastPage((p) => Math.max(1, p - 1))}
                                        className="rounded px-2 py-0.5 transition hover:text-white disabled:opacity-30">Prev</button>
                                    <span className="tabular-nums">{pastPage} / {pastPageCount}</span>
                                    <button type="button" disabled={pastPage >= pastPageCount}
                                        onClick={() => setPastPage((p) => p + 1)}
                                        className="rounded px-2 py-0.5 transition hover:text-white disabled:opacity-30">Next</button>
                                </div>
                            )}
                        </div>}
                    </div>

                    {/* Right — calendar + create */}
                    <div className="space-y-4">
                        <WeeklyCalendar
                            tournaments={tournaments}
                            upcomingMatches={upcomingMatches}
                            onNavigate={(id) => void nav(`/tournaments/${id}`)}
                        />

                        {import.meta.env.DEV && acct && (
                            <div className="grid gap-2">
                                <button
                                    type="button"
                                    onClick={() => void handleQuickSealBotCreate()}
                                    disabled={quickSealBotCreating}
                                    className="w-full rounded-lg border border-dashed border-sky-300/30 bg-sky-300/6 px-3 py-2 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-300/12 disabled:opacity-40"
                                >
                                    {quickSealBotCreating ? `Creating...` : `Quick Create 8-Player Seal Bot Tournament`}
                                </button>

                                <button
                                    type="button" onClick={() => void handleQuickCreate()} disabled={quickCreating}
                                    className="w-full rounded-lg border border-dashed border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-40"
                                >
                                    {quickCreating ? `Creating...` : `Quick Create 256-Player Tournament`}
                                </button>
                            </div>
                        )}

                        {acct ? (
                            <>
                                {!showCreateForm && (
                                    <button
                                        type="button" onClick={() => setShowCreateForm(true)}
                                        className="w-full rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-4 text-center text-[12px] font-semibold text-slate-400 transition hover:border-white/20 hover:bg-slate-900/60 hover:text-white"
                                    >
                                        + Create Tournament
                                    </button>
                                )}
                                {showCreateForm && (
                                    <div>
                                        <TournamentEditorCard
                                            formKey="create" title="New Tournament"
                                            description=""
                                            defaultRequest={{ ...createDefaultTournamentRequest(), visibility: `private` }}
                                            submitLabel="Create" submitting={submitting}
                                            onSubmit={(request) => void handleCreate(request)}
                                        />
                                        <button
                                            type="button" onClick={() => setShowCreateForm(false)}
                                            className="mt-2 w-full text-center text-[10px] text-slate-600 transition hover:text-slate-400"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="rounded-xl border border-white/8 bg-slate-900/50 p-4">
                                <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-white">Tournaments</h3>
                                <p className="mt-1 text-xs text-slate-400">Sign in with Discord to create tournaments and join events.</p>
                            </div>
                        )}
                    </div>
                </div>
            </PageCorpus>
        </>
    );
}

export default TournamentListRoute;
