import { useState } from 'react';
import type { TournamentMatch } from '@ih3t/shared';
import { Link, useNavigate, useParams } from 'react-router';

import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { useQueryTournament } from '../query/tournamentClient';

/* ── Match node ─────────────────────────────────────── */

const STATE_COLORS: Record<string, { dot: string; border: string }> = {
    pending: { dot: `bg-slate-600`, border: `border-white/6` },
    ready: { dot: `bg-amber-400`, border: `border-amber-400/20` },
    'in-progress': { dot: `bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.6)]`, border: `border-sky-400/30 shadow-[0_0_16px_rgba(56,189,248,0.08)]` },
    completed: { dot: `bg-emerald-400`, border: `border-emerald-400/15` },
};

function MatchNode({ match, onSpectate }: { match: TournamentMatch; onSpectate: (sid: string) => void }) {
    const { dot, border } = STATE_COLORS[match.state] ?? STATE_COLORS.pending!;
    const isLive = match.state === `in-progress` && match.sessionId;
    const handleSpectate = () => {
        if (isLive) {
            onSpectate(match.sessionId!);
        }
    };

    const slot = (s: TournamentMatch[`slots`][number], wins: number, isWinner: boolean, side: `top` | `bottom`) => (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 ${
            side === `top` ? `rounded-t` : `rounded-b`
        } ${isWinner ? `bg-emerald-400/8` : s.isBye ? `bg-white/[0.015]` : `bg-white/[0.025]`}`}>
            <span className="w-4 shrink-0 text-center text-[9px] font-bold tabular-nums text-slate-600">
                {s.seed ?? ``}
            </span>
            <span className={`min-w-0 flex-1 truncate text-[11px] ${
                s.isBye ? `italic text-slate-600`
                    : isWinner ? `font-bold text-emerald-200`
                        : s.profileId ? `font-medium text-slate-200` : `text-slate-600`
            }`}>
                {s.displayName ?? (s.isBye ? `BYE` : `TBD`)}
            </span>
            {!s.isBye && s.profileId && (
                <span className={`shrink-0 text-[11px] font-bold tabular-nums ${isWinner ? `text-emerald-300` : `text-slate-500`}`}>
                    {wins}
                </span>
            )}
        </div>
    );

    return (
        <div
            className={`w-48 overflow-hidden rounded-lg border transition ${border} ${isLive ? `cursor-pointer` : ``}`}
            onClick={handleSpectate}
            onKeyDown={(event) => {
                if (!isLive) {
                    return;
                }

                if (event.key === `Enter` || event.key === ` `) {
                    event.preventDefault();
                    handleSpectate();
                }
            }}
            role={isLive ? `button` : undefined}
            tabIndex={isLive ? 0 : undefined}
        >
            <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">M{match.order}</span>
                <span className="text-[8px] text-slate-600">BO{match.bestOf}</span>
                {isLive && <span className="ml-auto text-[8px] font-bold tracking-wide text-sky-300">LIVE</span>}
            </div>
            <div className="divide-y divide-white/[0.04]">
                {slot(match.slots[0], match.leftWins, match.winnerProfileId !== null && match.winnerProfileId === match.slots[0].profileId, `top`)}
                {slot(match.slots[1], match.rightWins, match.winnerProfileId !== null && match.winnerProfileId === match.slots[1].profileId, `bottom`)}
            </div>
        </div>
    );
}

/* ── SVG connector lines ───────────────────────────── */

const MATCH_W = 192;  // w-48
const MATCH_H = 72;   // approx height of a match node
const COL_GAP = 64;   // gap between round columns
const ROW_GAP = 12;   // vertical gap between matches within a round
const BRACKET_ZOOM_LEVELS = [0.25, 0.33, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5] as const;
const DEFAULT_BRACKET_ZOOM_INDEX = BRACKET_ZOOM_LEVELS.indexOf(1);

function getMatchY(index: number, count: number, totalHeight: number, matchHeight: number): number {
    if (count <= 1) return totalHeight / 2 - matchHeight / 2;
    const usable = totalHeight - matchHeight;
    return (usable / (count - 1)) * index;
}

function ScaledMatchNode({
    match,
    onSpectate,
    scale,
}: {
    match: TournamentMatch
    onSpectate: (sid: string) => void
    scale: number
}) {
    return (
        <div className="relative shrink-0" style={{ width: MATCH_W * scale, height: MATCH_H * scale }}>
            <div className="origin-top-left" style={{ width: MATCH_W, transform: `scale(${scale})` }}>
                <MatchNode match={match} onSpectate={onSpectate} />
            </div>
        </div>
    );
}

function BracketConnectors({
    rounds,
    totalHeight,
    matchWidth,
    matchHeight,
    columnGap,
}: {
    rounds: { round: number; matches: TournamentMatch[] }[]
    totalHeight: number
    matchWidth: number
    matchHeight: number
    columnGap: number
}) {
    const paths: React.ReactNode[] = [];

    for (let i = 0; i < rounds.length - 1; i++) {
        const curr = rounds[i]!;
        const next = rounds[i + 1]!;
        const x1 = i * (matchWidth + columnGap) + matchWidth;
        const x2 = (i + 1) * (matchWidth + columnGap);
        const midX = (x1 + x2) / 2;

        for (let j = 0; j < next.matches.length; j++) {
            const targetY = getMatchY(j, next.matches.length, totalHeight, matchHeight) + matchHeight / 2;

            // Each next match is fed by 2 matches from current round (standard bracket)
            const sourceIndices = [j * 2, j * 2 + 1];
            for (const si of sourceIndices) {
                if (si >= curr.matches.length) continue;
                const sourceY = getMatchY(si, curr.matches.length, totalHeight, matchHeight) + matchHeight / 2;

                paths.push(
                    <path
                        key={`${i}-${si}-${j}`}
                        d={`M ${x1} ${sourceY} H ${midX} V ${targetY} H ${x2}`}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth={1.5}
                    />,
                );
            }
        }
    }

    return (
        <svg
            className="pointer-events-none absolute inset-0"
            width={rounds.length * (matchWidth + columnGap) - columnGap}
            height={totalHeight}
        >
            {paths}
        </svg>
    );
}

/* ── Bracket section with connectors ───────────────── */

function BracketSection({ label, rounds, onSpectate, scale }: {
    label: string
    rounds: { round: number; matches: TournamentMatch[] }[]
    onSpectate: (sid: string) => void
    scale: number
}) {
    if (rounds.length === 0) return null;
    const matchWidth = MATCH_W * scale;
    const matchHeight = MATCH_H * scale;
    const columnGap = COL_GAP * scale;
    const rowGap = ROW_GAP * scale;

    const maxMatchesInRound = Math.max(...rounds.map((r) => r.matches.length));
    const totalHeight = Math.max(maxMatchesInRound * (matchHeight + rowGap) - rowGap, matchHeight);
    const totalWidth = rounds.length * (matchWidth + columnGap) - columnGap;

    return (
        <div className="mb-8">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="overflow-x-auto pb-4">
                <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
                    <BracketConnectors
                        rounds={rounds}
                        totalHeight={totalHeight}
                        matchWidth={matchWidth}
                        matchHeight={matchHeight}
                        columnGap={columnGap}
                    />
                    {rounds.map((r, colIdx) => (
                        <div
                            key={r.round}
                            className="absolute top-0 flex flex-col"
                            style={{
                                left: colIdx * (matchWidth + columnGap),
                                width: matchWidth,
                                height: totalHeight,
                                justifyContent: `space-around`,
                            }}
                        >
                            <div className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                                R{r.round}
                            </div>
                            {r.matches.sort((a, b) => a.order - b.order).map((m, idx) => (
                                <div
                                    key={m.id}
                                    style={{
                                        position: `absolute`,
                                        top: getMatchY(idx, r.matches.length, totalHeight, matchHeight),
                                    }}
                                >
                                    <ScaledMatchNode match={m} onSpectate={onSpectate} scale={scale} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ── Swiss view ────────────────────────────────────── */

function SwissView({
    matches,
    onSpectate,
    scale,
}: {
    matches: TournamentMatch[]
    onSpectate: (sid: string) => void
    scale: number
}) {
    const rounds = new Map<number, TournamentMatch[]>();
    const gap = 12 * scale;
    for (const m of matches) {
        const arr = rounds.get(m.round) ?? [];
        arr.push(m);
        rounds.set(m.round, arr);
    }

    return (
        <div className="space-y-6">
            {Array.from(rounds.entries()).sort(([a], [b]) => a - b).map(([round, rMatches]) => (
                <div key={round}>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Round {round}</div>
                    <div className="flex flex-wrap" style={{ gap }}>
                        {rMatches.sort((a, b) => a.order - b.order).map((m) => (
                            <ScaledMatchNode key={m.id} match={m} onSpectate={onSpectate} scale={scale} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── Double Elimination view ───────────────────────── */

function DoubleElimView({
    matches,
    onSpectate,
    scale,
}: {
    matches: TournamentMatch[]
    onSpectate: (sid: string) => void
    scale: number
}) {
    const winners = new Map<number, TournamentMatch[]>();
    const losers = new Map<number, TournamentMatch[]>();
    const grandFinal: TournamentMatch[] = [];
    const grandFinalReset: TournamentMatch[] = [];

    for (const m of matches) {
        if (m.bracket === `winners`) {
            const arr = winners.get(m.round) ?? [];
            arr.push(m);
            winners.set(m.round, arr);
        } else if (m.bracket === `losers`) {
            const arr = losers.get(m.round) ?? [];
            arr.push(m);
            losers.set(m.round, arr);
        } else if (m.bracket === `grand-final`) {
            grandFinal.push(m);
        } else if (m.bracket === `grand-final-reset`) {
            grandFinalReset.push(m);
        }
    }

    const toRounds = (map: Map<number, TournamentMatch[]>) =>
        Array.from(map.entries())
            .sort(([a], [b]) => a - b)
            .map(([round, ms]) => ({ round, matches: ms }));

    const gfRounds: { round: number; matches: TournamentMatch[] }[] = [];
    if (grandFinal.length > 0) gfRounds.push({ round: 1, matches: grandFinal });
    if (grandFinalReset.length > 0) gfRounds.push({ round: 2, matches: grandFinalReset });

    return (
        <div className="space-y-2">
            <BracketSection label="Winners Bracket" rounds={toRounds(winners)} onSpectate={onSpectate} scale={scale} />
            <BracketSection label="Losers Bracket" rounds={toRounds(losers)} onSpectate={onSpectate} scale={scale} />
            {gfRounds.length > 0 && <BracketSection label="Grand Final" rounds={gfRounds} onSpectate={onSpectate} scale={scale} />}
        </div>
    );
}

/* ── Main route ────────────────────────────────────── */

function TournamentBracketRoute() {
    const { tournamentId } = useParams<{ tournamentId: string }>();
    const nav = useNavigate();
    const tQ = useQueryTournament(tournamentId ?? null, { enabled: true });
    const t = tQ.data ?? null;
    const [zoomIndex, setZoomIndex] = useState(DEFAULT_BRACKET_ZOOM_INDEX);
    const scale = BRACKET_ZOOM_LEVELS[zoomIndex] ?? 1;

    const handleSpectate = (sessionId: string) => void nav(`/session/${sessionId}`);

    return (
        <>
            <PageMetadata
                title={t ? `${t.name} Bracket • ${DEFAULT_PAGE_TITLE}` : `Bracket • ${DEFAULT_PAGE_TITLE}`}
                description="Live tournament bracket visualization." />

            <div className="flex min-h-0 flex-1 flex-col text-white">
                {/* Top bar */}
                <div className="sticky top-12 z-30 border-b border-white/6 bg-slate-950/90 backdrop-blur-md">
                    <div className="mx-auto flex max-w-[2000px] items-center gap-4 px-4 py-2.5 sm:px-6">
                        <Link to={`/tournaments/${tournamentId}`}
                            className="text-[11px] font-medium text-slate-400 transition hover:text-white">
                            &larr; Back
                        </Link>

                        <h1 className="min-w-0 truncate text-sm font-bold text-white">
                            {t?.name ?? `Loading...`}
                        </h1>

                        {t && (
                            <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
                                <span>{t.format === `swiss` ? `Swiss` : `Double Elimination`}</span>
                                <span>·</span>
                                <span>{t.checkedInCount}/{t.maxPlayers} players</span>
                                <span>·</span>
                                <span className={t.status === `live` ? `text-emerald-400` : ``}>{t.status}</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <span className="hidden text-[10px] font-medium text-slate-500 sm:inline">
                                {Math.round(scale * 100)}%
                            </span>

                            <button
                                type="button"
                                onClick={() => setZoomIndex((current) => Math.max(current - 1, 0))}
                                disabled={zoomIndex <= 0}
                                className="rounded-md bg-white/6 px-2.5 py-1 text-[10px] font-medium text-slate-400 transition enabled:hover:bg-white/10 enabled:hover:text-white disabled:cursor-default disabled:opacity-50"
                            >
                                -
                            </button>

                            <button
                                type="button"
                                onClick={() => setZoomIndex((current) => Math.min(current + 1, BRACKET_ZOOM_LEVELS.length - 1))}
                                disabled={zoomIndex >= BRACKET_ZOOM_LEVELS.length - 1}
                                className="rounded-md bg-white/6 px-2.5 py-1 text-[10px] font-medium text-slate-400 transition enabled:hover:bg-white/10 enabled:hover:text-white disabled:cursor-default disabled:opacity-50"
                            >
                                +
                            </button>

                            <button
                                type="button"
                                onClick={() => setZoomIndex(DEFAULT_BRACKET_ZOOM_INDEX)}
                                disabled={scale === 1}
                                className="rounded-md bg-white/6 px-2.5 py-1 text-[10px] font-medium text-slate-400 transition enabled:hover:bg-white/10 enabled:hover:text-white disabled:cursor-default disabled:opacity-50"
                            >
                                Reset
                            </button>
                        </div>

                        <button onClick={() => void tQ.refetch()}
                            className="rounded-md bg-white/6 px-2.5 py-1 text-[10px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white">
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Bracket content */}
                <div className="min-h-0 flex-1 overflow-x-auto px-4 py-6 sm:px-6">
                    <div className="mx-auto max-w-[2000px]">
                        {!t ? (
                            <div className="py-20 text-center text-sm text-slate-600">Loading bracket...</div>
                        ) : t.matches.length === 0 ? (
                            <div className="py-20 text-center text-sm text-slate-600">
                                Bracket will appear when the tournament goes live.
                            </div>
                        ) : t.format === `swiss` ? (
                            <SwissView matches={t.matches} onSpectate={handleSpectate} scale={scale} />
                        ) : (
                            <DoubleElimView matches={t.matches} onSpectate={handleSpectate} scale={scale} />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default TournamentBracketRoute;
