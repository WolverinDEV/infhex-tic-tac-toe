import type {
    CreateTournamentRequest,
    TournamentDetail,
    TournamentFormat,
    TournamentGameTimeControl,
    TournamentSeriesBestOf,
} from '@ih3t/shared';
import { TOURNAMENT_BRACKET_SIZES, TOURNAMENT_SERIES_BEST_OF_VALUES } from '@ih3t/shared';
import { useEffect, useState } from 'react';

type TournamentEditorCardProps = {
    formKey: string
    title: string
    description: string
    defaultRequest: CreateTournamentRequest
    submitLabel: string
    submitting: boolean
    onSubmit: (request: CreateTournamentRequest) => void
};

type TournamentFormState = {
    name: string
    description: string
    format: TournamentFormat
    visibility: string
    scheduledStartAt: string
    checkInWindowMinutes: string
    maxPlayers: string
    swissRoundCount: string
    timeControlMode: TournamentGameTimeControl[`mode`]
    turnTimeSeconds: string
    mainTimeMinutes: string
    incrementSeconds: string
    earlyRoundsBestOf: string
    finalsBestOf: string
    grandFinalBestOf: string
    grandFinalResetEnabled: boolean
    matchJoinTimeoutMinutes: string
    matchExtensionMinutes: string
    lateRegistrationEnabled: boolean
    thirdPlaceMatchEnabled: boolean
    roundDelayMinutes: string
    waitlistEnabled: boolean
    waitlistCheckInMinutes: string
};

/* ── tiny reusable pieces ───────────────────────────── */

function Pill<T extends string>({ value, options, onChange, disabled }: {
    value: T
    options: { value: T; label: string }[]
    onChange: (v: T) => void
    disabled?: boolean
}) {
    return (
        <div className="inline-flex rounded-lg border border-white/8 bg-slate-950/60 p-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(o.value)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                        value === o.value
                            ? `bg-white/12 text-white shadow-sm`
                            : `text-slate-400 hover:text-slate-200`
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function Row({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
    return (
        <div className={inline ? `flex items-center gap-3` : `space-y-1`}>
            <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                {label}
            </span>

            {children}
        </div>
    );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
    const { className = ``, ...rest } = props;
    return (
        <input
            {...rest}
            className={`rounded-md border border-white/8 bg-slate-950/60 px-2.5 py-1.5 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/30 ${className}`}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    const { className = ``, children, ...rest } = props;
    return (
        <select
            {...rest}
            className={`rounded-md border border-white/8 bg-slate-950/60 px-2.5 py-1.5 text-[13px] text-white outline-none transition focus:border-sky-400/30 ${className}`}
        >
            {children}
        </select>
    );
}

function BestOfOptions() {
    return TOURNAMENT_SERIES_BEST_OF_VALUES.map((value) => (
        <option key={value} value={value}>
            {`BO${value}`}
        </option>
    ));
}

/* ── helpers ─────────────────────────────────────────── */

export function buildCreateTournamentRequestFromDetail(tournament: TournamentDetail): CreateTournamentRequest {
    return {
        name: tournament.name,
        description: tournament.description ?? undefined,
        format: tournament.format,
        visibility: tournament.visibility,
        scheduledStartAt: tournament.scheduledStartAt,
        checkInWindowMinutes: tournament.checkInWindowMinutes,
        maxPlayers: tournament.maxPlayers,
        swissRoundCount: tournament.swissRoundCount ?? undefined,
        timeControl: { ...tournament.timeControl },
        seriesSettings: { ...tournament.seriesSettings },
        matchJoinTimeoutMinutes: tournament.matchJoinTimeoutMinutes,
        matchExtensionMinutes: tournament.matchExtensionMinutes,
        lateRegistrationEnabled: tournament.lateRegistrationEnabled,
        thirdPlaceMatchEnabled: tournament.thirdPlaceMatchEnabled,
        roundDelayMinutes: tournament.roundDelayMinutes,
        waitlistEnabled: tournament.waitlistEnabled,
        waitlistCheckInMinutes: tournament.waitlistCheckInMinutes,
    };
}

export function createDefaultTournamentRequest(): CreateTournamentRequest {
    return {
        name: ``,
        description: ``,
        format: `double-elimination`,
        visibility: `private`,
        scheduledStartAt: Date.now() + 60 * 60 * 1000,
        checkInWindowMinutes: 30,
        maxPlayers: 16,
        timeControl: { mode: `turn`, turnTimeMs: 45_000 },
        seriesSettings: { earlyRoundsBestOf: 1, finalsBestOf: 3, grandFinalBestOf: 5, grandFinalResetEnabled: true },
        matchJoinTimeoutMinutes: 5,
        matchExtensionMinutes: 5,
    };
}

function toLocal(ts: number) {
    const d = new Date(ts);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatUtcHint(localDateTime: string): string | null {
    const parsed = new Date(localDateTime);
    if (!Number.isFinite(parsed.valueOf())) {
        return null;
    }

    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, `0`);
    const day = String(parsed.getUTCDate()).padStart(2, `0`);
    const hours = String(parsed.getUTCHours()).padStart(2, `0`);
    const minutes = String(parsed.getUTCMinutes()).padStart(2, `0`);
    return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

function init(r: CreateTournamentRequest): TournamentFormState {
    return {
        name: r.name,
        description: r.description ?? ``,
        format: r.format ?? `double-elimination`,
        visibility: r.visibility,
        scheduledStartAt: toLocal(r.scheduledStartAt),
        checkInWindowMinutes: String(r.checkInWindowMinutes),
        maxPlayers: String(r.maxPlayers),
        swissRoundCount: r.swissRoundCount ? String(r.swissRoundCount) : ``,
        timeControlMode: r.timeControl.mode,
        turnTimeSeconds: r.timeControl.mode === `turn` ? String(Math.round(r.timeControl.turnTimeMs / 1000)) : `45`,
        mainTimeMinutes: r.timeControl.mode === `match` ? String(Math.round(r.timeControl.mainTimeMs / 60_000)) : `5`,
        incrementSeconds: r.timeControl.mode === `match` ? String(Math.round(r.timeControl.incrementMs / 1000)) : `0`,
        earlyRoundsBestOf: String(r.seriesSettings.earlyRoundsBestOf),
        finalsBestOf: String(r.seriesSettings.finalsBestOf),
        grandFinalBestOf: String(r.seriesSettings.grandFinalBestOf),
        grandFinalResetEnabled: r.seriesSettings.grandFinalResetEnabled,
        matchJoinTimeoutMinutes: String(r.matchJoinTimeoutMinutes ?? 5),
        matchExtensionMinutes: String(r.matchExtensionMinutes ?? r.matchJoinTimeoutMinutes ?? 5),
        lateRegistrationEnabled: r.lateRegistrationEnabled ?? false,
        thirdPlaceMatchEnabled: r.thirdPlaceMatchEnabled ?? false,
        roundDelayMinutes: String(r.roundDelayMinutes ?? 0),
        waitlistEnabled: r.waitlistEnabled ?? false,
        waitlistCheckInMinutes: String(r.waitlistCheckInMinutes ?? 5),
    };
}

function bo(v: string): TournamentSeriesBestOf { return v === `7` ? 7 : v === `5` ? 5 : v === `3` ? 3 : 1; }

/* ── estimated duration ────────────────────────────── */

function EstimatedDuration({ form }: { form: TournamentFormState }) {
    const mp = Number.parseInt(form.maxPlayers, 10) || 8;
    const bracketSize = [4, 8, 16, 32, 64, 128, 256].find((s) => s >= mp) ?? 256;
    const roundCount = Math.log2(bracketSize);
    const roundDelay = Math.max(0, Number.parseInt(form.roundDelayMinutes, 10) || 0);
    const checkInMin = Math.max(5, Number.parseInt(form.checkInWindowMinutes, 10) || 30);
    const waitlistMin = form.waitlistEnabled ? Math.max(1, Number.parseInt(form.waitlistCheckInMinutes, 10) || 5) : 0;

    let totalRounds: number;
    if (form.format === `swiss`) {
        totalRounds = Number.parseInt(form.swissRoundCount, 10) || Math.ceil(Math.log2(mp));
    } else if (form.format === `double-elimination`) {
        // winners + losers + GF (+ reset)
        totalRounds = roundCount + Math.max(0, (roundCount - 1) * 2) + 1 + (form.grandFinalResetEnabled ? 1 : 0);
    } else {
        totalRounds = roundCount + (form.thirdPlaceMatchEnabled ? 1 : 0);
    }

    // Estimate per-game time in minutes
    let gameMinutes: number;
    if (form.timeControlMode === `turn`) {
        const sec = Number.parseInt(form.turnTimeSeconds, 10) || 45;
        gameMinutes = Math.ceil((sec * 40) / 60); // ~40 moves per game
    } else if (form.timeControlMode === `match`) {
        const mainMin = Number.parseInt(form.mainTimeMinutes, 10) || 5;
        const incSec = Number.parseInt(form.incrementSeconds, 10) || 0;
        gameMinutes = mainMin * 2 + Math.ceil((incSec * 40) / 60);
    } else {
        gameMinutes = 10;
    }

    const earlyBo = Number.parseInt(form.earlyRoundsBestOf, 10) || 1;
    const finalsBo = Number.parseInt(form.finalsBestOf, 10) || 3;
    const avgBo = totalRounds > 2 ? ((earlyBo * (totalRounds - 2) + finalsBo * 2) / totalRounds) : finalsBo;
    const matchMinutes = gameMinutes * avgBo;

    const totalMinutes = checkInMin + waitlistMin + (totalRounds * matchMinutes) + (Math.max(0, totalRounds - 1) * roundDelay);
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    const display = hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;

    return (
        <div className="mb-3 text-[10px] text-slate-500">
            Estimated max duration: <span className="text-slate-400">{display}</span> <span className="text-slate-600">(approximate)</span>
        </div>
    );
}

/* ── component ──────────────────────────────────────── */

function TournamentEditorCard({
    formKey, title, description, defaultRequest,
    submitLabel, submitting, onSubmit,
}: TournamentEditorCardProps) {
    const [f, setF] = useState<TournamentFormState>(() => init(defaultRequest));

    useEffect(() => { setF(init(defaultRequest)); }, [defaultRequest, formKey]);

    const set = <K extends keyof TournamentFormState>(k: K, v: TournamentFormState[K]) =>
        setF((c) => ({ ...c, [k]: v }));
    const scheduledStartUtcHint = formatUtcHint(f.scheduledStartAt);

    const submit = () => {
        const sd = new Date(f.scheduledStartAt);
        const startAt = Number.isFinite(sd.valueOf()) ? sd.valueOf() : Date.now() + 3_600_000;
        const mpRaw = Number.parseInt(f.maxPlayers, 10);
        const mp = f.format === `swiss`
            ? Math.max(2, Math.min(256, mpRaw || 8))
            : (TOURNAMENT_BRACKET_SIZES.includes(mpRaw as typeof TOURNAMENT_BRACKET_SIZES[number]) ? mpRaw : 4);
        const ciw = Number.parseInt(f.checkInWindowMinutes, 10);
        const sr = f.format === `swiss` && f.swissRoundCount.trim() ? Number.parseInt(f.swissRoundCount, 10) : undefined;

        const tc: TournamentGameTimeControl = f.timeControlMode === `match`
            ? { mode: `match`, mainTimeMs: Math.max(60_000, (Number.parseInt(f.mainTimeMinutes, 10) || 5) * 60_000), incrementMs: Math.max(0, (Number.parseInt(f.incrementSeconds, 10) || 0) * 1000) }
            : f.timeControlMode === `turn`
                ? { mode: `turn`, turnTimeMs: Math.max(5_000, (Number.parseInt(f.turnTimeSeconds, 10) || 45) * 1000) }
                : { mode: `unlimited` };

        onSubmit({
            name: f.name.trim(), description: f.description.trim() || undefined,
            format: f.format, visibility: f.visibility as CreateTournamentRequest[`visibility`],
            scheduledStartAt: startAt, checkInWindowMinutes: Math.max(5, ciw || 30),
            maxPlayers: mp,
            swissRoundCount: sr, timeControl: tc,
            seriesSettings: { earlyRoundsBestOf: bo(f.earlyRoundsBestOf), finalsBestOf: bo(f.finalsBestOf), grandFinalBestOf: bo(f.grandFinalBestOf), grandFinalResetEnabled: f.grandFinalResetEnabled },
            matchJoinTimeoutMinutes: Math.max(0, Math.min(30, Number.parseInt(f.matchJoinTimeoutMinutes, 10) || 0)),
            matchExtensionMinutes: Math.max(0, Math.min(30, Number.parseInt(f.matchExtensionMinutes, 10) || 0)),
            lateRegistrationEnabled: f.lateRegistrationEnabled,
            thirdPlaceMatchEnabled: f.format === `single-elimination` ? f.thirdPlaceMatchEnabled : false,
            roundDelayMinutes: Math.max(0, Math.min(60, Number.parseInt(f.roundDelayMinutes, 10) || 0)),
            waitlistEnabled: f.waitlistEnabled,
            waitlistCheckInMinutes: f.waitlistEnabled ? Math.max(1, Math.min(30, Number.parseInt(f.waitlistCheckInMinutes, 10) || 5)) : undefined,
        });
    };

    return (
        <div className="rounded-xl border border-white/8 bg-slate-900/50 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            {/* Header */}
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-white">{title}</h3>
                <span className="text-[10px] text-slate-500">{description}</span>
            </div>

            {/* Name */}
            <Input
                value={f.name} onChange={(e) => set(`name`, e.target.value)}
                placeholder="Event name" className="mb-3 w-full"
            />

            {/* Description */}
            <textarea
                value={f.description} onChange={(e) => set(`description`, e.target.value)}
                rows={2} placeholder="Description (optional)"
                className="mb-3 w-full rounded-md border border-white/8 bg-slate-950/60 px-2.5 py-1.5 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/30"
            />

            {/* Format toggle */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Row label="Format" inline>
                    <Pill value={f.format} options={[{ value: `single-elimination`, label: `Single Elim` }, { value: `double-elimination`, label: `Double Elim` }, { value: `swiss`, label: `Swiss` }]}
                        onChange={(v) => set(`format`, v)} />
                </Row>
            </div>

            {/* Players */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Players</span>

                {f.format === `swiss` ? (
                    <Input type="number" min={2} max={256} value={f.maxPlayers}
                        onChange={(e) => set(`maxPlayers`, e.target.value)} className="w-16 text-center" />
                ) : (
                    <div className="inline-flex rounded-lg border border-white/8 bg-slate-950/60 p-0.5">
                        {[4, 8, 16, 32, 64, 128, 256].map((n) => (
                            <button key={n} type="button" onClick={() => set(`maxPlayers`, String(n))}
                                className={`rounded-md px-2 py-1 text-[11px] font-medium tabular-nums transition ${
                                    f.maxPlayers === String(n) ? `bg-white/12 text-white shadow-sm` : `text-slate-400 hover:text-slate-200`}`}>
                                {n}
                            </button>
                        ))}
                    </div>
                )}

                {f.format === `swiss` && (
                    <>
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Rounds</span>
                        <Input type="number" min={1} max={15} value={f.swissRoundCount}
                            onChange={(e) => set(`swissRoundCount`, e.target.value)} placeholder="Auto" className="w-16 text-center" />
                    </>
                )}
            </div>

            {/* Schedule — two inline fields */}
            <div className="mb-3 grid grid-cols-2 gap-3">
                <Row label="Start">
                    <Input type="datetime-local" value={f.scheduledStartAt} onChange={(e) => set(`scheduledStartAt`, e.target.value)} className="w-full" />
                    <div className="text-[10px] text-slate-500">
                        Times are entered in your local timezone.
                        {scheduledStartUtcHint && (
                            <>
                                {` `}
                                <span className="text-slate-400">
                                    {`UTC: ${scheduledStartUtcHint}`}
                                </span>
                            </>
                        )}
                    </div>
                </Row>
                <Row label="Check-in (min)"><Input type="number" min={5} max={1440} value={f.checkInWindowMinutes} onChange={(e) => set(`checkInWindowMinutes`, e.target.value)} className="w-full" /></Row>
            </div>

            {/* Clock */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Row label="Clock" inline>
                    <Pill value={f.timeControlMode}
                        options={[{ value: `turn`, label: `Turn` }, { value: `match`, label: `Match` }, { value: `unlimited`, label: `None` }]}
                        onChange={(v) => set(`timeControlMode`, v)} />
                </Row>

                {f.timeControlMode === `turn` && (
                    <Row label="sec/turn" inline>
                        <Input type="number" min={5} max={120} value={f.turnTimeSeconds} onChange={(e) => set(`turnTimeSeconds`, e.target.value)} className="w-14 text-center" />
                    </Row>
                )}

                {f.timeControlMode === `match` && (
                    <>
                        <Row label="min" inline>
                            <Input type="number" min={1} max={60} value={f.mainTimeMinutes} onChange={(e) => set(`mainTimeMinutes`, e.target.value)} className="w-14 text-center" />
                        </Row>
                        <Row label="+sec" inline>
                            <Input type="number" min={0} max={300} value={f.incrementSeconds} onChange={(e) => set(`incrementSeconds`, e.target.value)} className="w-14 text-center" />
                        </Row>
                    </>
                )}
            </div>

            {/* Series — single row */}
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Series</span>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    Early
                    <Select value={f.earlyRoundsBestOf} onChange={(e) => set(`earlyRoundsBestOf`, e.target.value)}>
                        <BestOfOptions />
                    </Select>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    Finals
                    <Select value={f.finalsBestOf} onChange={(e) => set(`finalsBestOf`, e.target.value)}>
                        <BestOfOptions />
                    </Select>
                </div>
                {f.format === `double-elimination` && (
                    <>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            GF
                            <Select value={f.grandFinalBestOf} onChange={(e) => set(`grandFinalBestOf`, e.target.value)}>
                                <BestOfOptions />
                            </Select>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <input type="checkbox" checked={f.grandFinalResetEnabled} onChange={(e) => set(`grandFinalResetEnabled`, e.target.checked)}
                                className="h-3 w-3 rounded border-white/20 bg-slate-900 text-amber-300" />
                            Reset
                        </label>
                    </>
                )}

                <span className="text-slate-600">|</span>

                <Row label="Join timeout" inline>
                    <Input type="number" min={0} max={30} value={f.matchJoinTimeoutMinutes} onChange={(e) => set(`matchJoinTimeoutMinutes`, e.target.value)} className="w-14 text-center" />
                    <span className="text-[10px] text-slate-500">{Number(f.matchJoinTimeoutMinutes) === 0 ? `(no limit)` : `min`}</span>
                </Row>

                {Number(f.matchJoinTimeoutMinutes) > 0 && (
                    <>
                        <Row label="Extension" inline>
                            <Input type="number" min={0} max={30} value={f.matchExtensionMinutes} onChange={(e) => set(`matchExtensionMinutes`, e.target.value)} className="w-14 text-center" />
                            <span className="text-[10px] text-slate-500">{Number(f.matchExtensionMinutes) === 0 ? `(none)` : `min`}</span>
                        </Row>
                        <span className="text-slate-600">|</span>
                    </>
                )}

                <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={f.lateRegistrationEnabled} onChange={(e) => set(`lateRegistrationEnabled`, e.target.checked)} className="accent-sky-400" />
                    <span className="text-[10px] text-slate-400">Late registration</span>
                </label>
            </div>

            {/* Extra settings */}
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {f.format === `single-elimination` && (
                    <label className="flex cursor-pointer items-center gap-1.5">
                        <input type="checkbox" checked={f.thirdPlaceMatchEnabled} onChange={(e) => set(`thirdPlaceMatchEnabled`, e.target.checked)} className="accent-sky-400" />
                        <span className="text-[10px] text-slate-400">3rd place match</span>
                    </label>
                )}

                <Row label="Round delay" inline>
                    <Input type="number" min={0} max={60} value={f.roundDelayMinutes} onChange={(e) => set(`roundDelayMinutes`, e.target.value)} className="w-14 text-center" />
                    <span className="text-[10px] text-slate-500">{Number(f.roundDelayMinutes) === 0 ? `(none)` : `min`}</span>
                </Row>

                <span className="text-slate-600">|</span>

                <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={f.waitlistEnabled} onChange={(e) => set(`waitlistEnabled`, e.target.checked)} className="accent-sky-400" />
                    <span className="text-[10px] text-slate-400">Waitlist</span>
                </label>

                {f.waitlistEnabled && (
                    <Row label="Waitlist window" inline>
                        <Input type="number" min={1} max={30} value={f.waitlistCheckInMinutes} onChange={(e) => set(`waitlistCheckInMinutes`, e.target.value)} className="w-14 text-center" />
                        <span className="text-[10px] text-slate-500">min</span>
                    </Row>
                )}
            </div>

            {/* Estimated duration */}
            <EstimatedDuration form={f} />

            {/* Submit */}
            <div className="flex justify-end border-t border-white/6 pt-3">
                <button type="button" onClick={submit} disabled={submitting || f.name.trim().length < 3}
                    className="rounded-full bg-amber-300 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-950 shadow-[0_4px_14px_rgba(251,191,36,0.3)] transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
                    {submitting ? `Saving...` : submitLabel}
                </button>
            </div>
        </div>
    );
}

export default TournamentEditorCard;
