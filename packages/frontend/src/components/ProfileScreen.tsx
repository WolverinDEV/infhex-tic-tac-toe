import type { AccountEloHistory, AccountStatistics, FinishedGamesPage, FinishedGameSummary, LobbyInfo, PublicAccountProfile } from '@ih3t/shared';
import { type ReactNode, useMemo } from 'react';
import React from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { signInWithDiscord } from '../query/authClient';
import { buildFinishedGamePath, buildSessionPath } from '../routes/archiveRouteState';
import { useSsrCompatibleNow } from '../ssrState';
import {
    formatCalendarDate,
    formatChartDate,
    formatDateTime,
    formatRelativeTimeFrom,
    useIntlFormatProvider,
} from '../utils/dateTime';
import { formatCompactDuration, formatDetailedDuration } from '../utils/duration';
import { formatEloChange } from '../utils/elo';
import { getPersonalResultLabel, type PersonalResultTone } from '../utils/finishedGames';
import { getPlayerLabel, getPlayerTileColor } from '../utils/gameBoard';
import { formatTimeControl } from '../utils/gameTimeControl';
import { formatLobbyPlayers } from '../utils/lobby';
import {
    formatWinSummary,
    formatWorldRank,
} from '../utils/profileStats';
import AccountPicture from './AccountPicture';
import PageCorpus from './PageCorpus';

const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

function showErrorToast(message: string) {
    toast.error(message, {
        toastId: `error:${message}`,
    });
}

type ProfileScreenProps = {
    account: PublicAccountProfile | null
    statistics: AccountStatistics | null
    recentGames: FinishedGamesPage | null
    liveGame: LobbyInfo | null
    isLoading: boolean
    isStatisticsLoading: boolean
    isRecentGamesLoading: boolean
    errorMessage: string | null
    statisticsErrorMessage: string | null
    recentGamesErrorMessage: string | null
    isPublicView: boolean
};

type PrimaryStatCardProps = {
    label: string
    value: string | number
    detail: string
    accentClassName: string
};

function PrimaryStatCard({ label, value, detail, accentClassName }: Readonly<PrimaryStatCardProps>) {
    return (
        <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
            <div className={`text-xs font-semibold uppercase tracking-[0.28em] ${accentClassName}`}>
                {label}
            </div>

            <div className="mt-3 text-4xl font-black uppercase tracking-[0.04em] text-white sm:text-5xl">
                {value}
            </div>

            <div className="mt-3 text-sm leading-6 text-slate-300">
                {detail}
            </div>
        </div>
    );
}

type SecondaryStatCardProps = {
    label: string
    value: string | number
    detail: string
};

function SecondaryStatCard({ label, value, detail }: Readonly<SecondaryStatCardProps>) {
    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                {label}
            </div>

            <div className="mt-2 text-2xl font-black uppercase tracking-[0.05em] text-white">
                {value}
            </div>

            <div className="mt-2 text-sm text-slate-300">
                {detail}
            </div>
        </div>
    );
}

type AccountMetaItemProps = {
    label: string
    value: string
};

function AccountMetaItem({ label, value }: Readonly<AccountMetaItemProps>) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {label}
            </span>

            <span className="text-sm text-slate-200">
                {value}
            </span>
        </div>
    );
}

type StatisticsGroupProps = {
    eyebrow: string
    title: string
    description: string
    accentClassName: string
    cardGridClassName: string
    children: ReactNode
};

function StatisticsGroup({
    eyebrow,
    title,
    description,
    accentClassName,
    cardGridClassName,
    children,
}: Readonly<StatisticsGroupProps>) {
    return (
        <section className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.5))] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
            <div className={`text-xs uppercase tracking-[0.28em] ${accentClassName}`}>
                {eyebrow}
            </div>

            <h3 className="mt-3 text-xl font-black uppercase tracking-[0.08em] text-white">
                {title}
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-300">
                {description}
            </p>

            <div className={`mt-5 grid gap-4 ${cardGridClassName}`}>
                {children}
            </div>
        </section>
    );
}

function StatisticsLoadingState({ message = `Loading your statistics...` }: Readonly<{ message?: string }>) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 px-5 py-10 text-center text-sm text-slate-300 lg:col-span-2">
                {message}
            </div>
        </div>
    );
}

function StatisticsErrorState({ message }: Readonly<{ message: string }>) {
    return (
        <div className="rounded-3xl border border-rose-300/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {message}
        </div>
    );
}

function StatisticsEmptyState({ message = `Statistics will appear here once your profile data is ready.` }: Readonly<{ message?: string }>) {
    return (
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 px-5 py-10 text-center text-sm text-slate-300">
            {message}
        </div>
    );
}

function LiveGameSection({
    liveGame,
}: Readonly<{
    liveGame: LobbyInfo
}>) {
    const intlFormatProvider = useIntlFormatProvider();
    return (
        <section className="rounded-[1.6rem] border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(6,78,59,0.38),rgba(15,23,42,0.62))] p-5 shadow-[0_24px_80px_rgba(6,78,59,0.18)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                            Live Game
                        </span>

                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${liveGame.rated
                            ? `bg-amber-300/15 text-amber-100`
                            : `bg-white/8 text-slate-200`
                            }`}
                        >
                            {liveGame.rated ? `Rated` : `Casual`}
                        </span>

                        <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                            {formatTimeControl(liveGame.timeControl)}
                        </span>
                    </div>

                    <h3 className="mt-3 text-xl font-black uppercase tracking-[0.08em] text-white">
                        Currently Playing
                    </h3>

                    <div className="mt-2 text-sm leading-6 text-slate-300">
                        {formatLobbyPlayers(liveGame.players, liveGame.rated, `Waiting for players`)}
                    </div>

                    {liveGame.startedAt && (
                        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-emerald-100/80">
                            {`Started `}
                            {formatDateTime(intlFormatProvider, liveGame.startedAt)}
                        </div>
                    )}
                </div>

                <Link
                    to={buildSessionPath(liveGame.id)}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/12 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-50 transition hover:-translate-y-0.5 hover:bg-emerald-400/20 lg:shrink-0"
                >
                    Watch Live Game
                </Link>
            </div>
        </section>
    );
}

function getRecentGamesPresentation(
    game: FinishedGameSummary,
    profileId: string,
): {
    label: string
    tone: PersonalResultTone
    cardClassName: string
    titleClassName: string
    sessionClassName: string
} {
    const result = getPersonalResultLabel(game, profileId);
    const sharedCardClassName = `border-white/10 bg-slate-950/55 hover:border-sky-300/30 hover:bg-slate-900/70`;

    if (result.tone === `win`) {
        return {
            ...result,
            cardClassName: `${sharedCardClassName} pl-6 shadow-[inset_3px_0_0_rgba(16,185,129,1),inset_22px_0_28px_-24px_rgba(16,185,129,0.95)]`,
            titleClassName: `text-white`,
            sessionClassName: `text-sky-200/75`,
        };
    }

    if (result.tone === `loss`) {
        return {
            ...result,
            cardClassName: `${sharedCardClassName} pl-6 shadow-[inset_3px_0_0_rgba(244,63,94,1),inset_22px_0_28px_-24px_rgba(244,63,94,0.95)]`,
            titleClassName: `text-white`,
            sessionClassName: `text-sky-200/75`,
        };
    }

    return {
        ...result,
        cardClassName: `${sharedCardClassName} pl-6`,
        titleClassName: `text-white`,
        sessionClassName: `text-sky-200/75`,
    };
}

function RecentGamesSection({
    profileId,
    recentGames,
    isLoading,
    errorMessage,
    isPublicView,
}: Readonly<{
    profileId: string
    recentGames: FinishedGamesPage | null
    isLoading: boolean
    errorMessage: string | null
    isPublicView: boolean
}>) {
    const intlFormatProvider = useIntlFormatProvider();
    const games = recentGames?.games ?? [];
    const archiveView = isPublicView ? `all` : `mine`;

    return (
        <section className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.5))] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
            <div>
                <div className="text-xs uppercase tracking-[0.28em] text-violet-200/85">
                    Match History
                </div>

                <h3 className="mt-3 text-xl font-black uppercase tracking-[0.08em] text-white">
                    Last 10 Games
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                    The most recent finished matches played on this profile.
                </p>
            </div>

            {isLoading ? (
                <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-300">
                    Loading recent games...
                </div>
            ) : errorMessage ? (
                <div className="mt-5 rounded-[1.25rem] border border-rose-300/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
                    {errorMessage}
                </div>
            ) : games.length === 0 ? (
                <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-300">
                    No finished games have been recorded for this profile yet.
                </div>
            ) : (
                <div className="mt-5 space-y-4">
                    {games.map((game) => {
                        const presentation = getRecentGamesPresentation(game, profileId);
                        const gamePath = buildFinishedGamePath(game.id, archiveView);
                        const profilePlayer = game.players.find((player) => player.profileId === profileId);
                        const profileEloChange = game.gameOptions.rated ? profilePlayer?.eloChange ?? null : null;

                        return (
                            <Link
                                key={game.id}
                                to={gamePath}
                                className={`block rounded-[1.2rem] border px-4 py-3.5 text-left transition hover:-translate-y-0.5 sm:rounded-3xl sm:px-4.5 sm:py-4 ${presentation.cardClassName}`}
                            >
                                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                    <div className="min-w-0">
                                        <div className={`break-all text-[11px] uppercase tracking-[0.24em] sm:text-xs sm:tracking-[0.28em] ${presentation.sessionClassName}`}>
                                            {`Session `}
                                            {game.sessionId}
                                        </div>

                                        <div className={`mt-1.5 text-lg font-bold sm:text-[1.45rem] ${presentation.titleClassName}`}>
                                            {presentation.label}
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-300 sm:text-xs">
                                            {profileEloChange !== null && (
                                                <span className={`rounded-full px-2.5 py-0.5 ${profileEloChange >= 0
                                                    ? `bg-emerald-400/12 text-emerald-200`
                                                    : `bg-rose-400/12 text-rose-200`
                                                    }`}
                                                >
                                                    {`ELO `}
                                                    {` `}
                                                    {formatEloChange(profileEloChange)}
                                                </span>
                                            )}

                                            <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">
                                                Moves:
                                                {` `}
                                                {game.moveCount}
                                            </span>

                                            <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">
                                                {`Duration: `}
                                                {formatCompactDuration(game.gameResult?.durationMs ?? 0)}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                                            {game.players.map((player) => (
                                                <span
                                                    key={player.playerId}
                                                    className="inline-flex items-center gap-2 rounded-full bg-slate-900/60 px-3 py-1"
                                                >
                                                    <span
                                                        className="h-2.5 w-2.5 rounded-full"
                                                        style={{ backgroundColor: getPlayerTileColor(game.playerTiles, player.playerId) }}
                                                    />

                                                    <span>
                                                        {getPlayerLabel(game.players, player.playerId)}
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="text-[11px] text-slate-300 sm:text-right sm:text-xs">
                                        <div className="font-semibold text-white">
                                            {formatDateTime(intlFormatProvider, game.finishedAt ?? game.startedAt)}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

type EloChartPoint = {
    timestamp: number
    elo: number
};
function EloHistoryChartSection({
    eloHistory,
    currentElo,
}: Readonly<{
    eloHistory: AccountEloHistory
    currentElo: number
}>) {
    const intlFormatProvider = useIntlFormatProvider();
    const ssrNow = useSsrCompatibleNow();
    const now = useMemo(() => ssrNow, [eloHistory]);

    /* align the own start with the bucket size */
    let windowStart = now - thirtyDaysMs;
    windowStart -= windowStart % eloHistory.bucketSizeMs;
    windowStart = Math.max(windowStart, eloHistory.points[0]?.timestamp ?? 0)

    const sortedPoints = [...eloHistory.points]
        .filter((point) => point.timestamp < now)
        .sort((left, right) => left.timestamp - right.timestamp);

    const currentPoint = {
        elo: currentElo,

        /* The current ELO is the same since the last bucket end as buckets are only provided if there happened any games. */
        timestamp: Math.min((sortedPoints.at(-1)?.timestamp ?? now) + eloHistory.bucketSizeMs, now),
    };

    sortedPoints.push(currentPoint);

    const chartPoints: EloChartPoint[] = [];

    let currentTimestamp = windowStart;
    let currentEloScore = 1000;
    let currentHistoryIndex = 0;

    while (currentTimestamp <= now) {
        while (currentHistoryIndex < sortedPoints.length) {
            if (sortedPoints[currentHistoryIndex].timestamp > currentTimestamp) {
                break;
            }

            currentEloScore = sortedPoints[currentHistoryIndex].elo;
            currentHistoryIndex++;
        }

        chartPoints.push({ timestamp: currentTimestamp, elo: currentEloScore });
        currentTimestamp += eloHistory.bucketSizeMs;
    }

    const highestPoint = sortedPoints.reduce(
        (highest, point) => point.elo > highest.elo ? point : highest,
        currentPoint,
    );

    const [lowestElo, highestElo] = chartPoints.reduce<[number, number]>(
        (range, point) => {
            return [
                Math.min(range[0], point.elo),
                Math.max(range[1], point.elo),
            ];
        },
        [currentElo, currentElo],
    );
    const yAxisPadding = Math.max(10, Math.ceil((highestElo - lowestElo) * 0.12));
    const yAxisDomain: [number, number] = [
        Math.max(0, lowestElo - yAxisPadding),
        highestElo + yAxisPadding,
    ];

    return (
        <React.Fragment>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-sky-200/85">
                        Competitive Trend
                    </div>

                    <h3 className="mt-3 text-xl font-black uppercase tracking-[0.08em] text-white">
                        ELO Rating
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                        ELO rating over the last 30 days.
                    </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                    <div className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">
                        Highest Rating
                    </div>

                    <div className="mt-1 text-lg font-bold leading-none text-white">
                        {highestPoint.elo}
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                        {`Reached `}
                        {formatDateTime(intlFormatProvider, highestPoint.timestamp)}
                    </div>
                </div>
            </div>

            <div className="mt-5 h-72 rounded-[1.25rem] border border-white/8 bg-slate-950/45 p-3">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartPoints} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                        <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />

                        <XAxis
                            dataKey="timestamp"
                            minTickGap={28}
                            stroke="#94a3b8"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(time: number) => formatChartDate(intlFormatProvider, time)}
                        />

                        <YAxis
                            allowDecimals={false}
                            domain={yAxisDomain}
                            stroke="#94a3b8"
                            tickLine={false}
                            axisLine={false}
                            width={48}
                        />

                        <Tooltip
                            cursor={{ stroke: `rgba(125,211,252,0.35)`, strokeWidth: 1 }}
                            contentStyle={{
                                backgroundColor: `rgba(2,6,23,0.94)`,
                                border: `1px solid rgba(148,163,184,0.2)`,
                                borderRadius: `1rem`,
                                color: `#e2e8f0`,
                            }}
                            formatter={(value) => [`${value as number} ELO`, `Rating`]}
                            labelFormatter={(label) => formatDateTime(intlFormatProvider, Number(label))}
                        />

                        <Line
                            type="monotone"
                            dataKey="elo"
                            stroke="#7dd3fc"
                            strokeWidth={3}
                            dot={chartPoints.length === 1}
                            activeDot={{ r: 5, fill: `#7dd3fc` }}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </React.Fragment>
    );
}

function ProfileScreen({
    account,
    statistics,
    recentGames,
    liveGame,
    isLoading,
    isStatisticsLoading,
    isRecentGamesLoading,
    errorMessage,
    statisticsErrorMessage,
    recentGamesErrorMessage,
    isPublicView,
}: Readonly<ProfileScreenProps>) {
    const intlFormatProvider = useIntlFormatProvider();
    const now = useSsrCompatibleNow();

    const handleSignIn = async () => {
        try {
            await signInWithDiscord();
        } catch (error) {
            console.error(`Failed to start Discord sign in:`, error);
            showErrorToast(error instanceof Error ? error.message : `Failed to start Discord sign in.`);
        }
    };

    const isMissingPublicProfile = isPublicView && errorMessage === `Profile not found.`;
    const memberSinceLabel = account ? formatCalendarDate(intlFormatProvider, account.registeredAt) : null;
    const lastSeenLabel = account ? formatRelativeTimeFrom(intlFormatProvider, account.lastActiveAt, now) : null;

    return (
        <PageCorpus
            category={isPublicView ? `Profile` : `Account`}
            title={isPublicView ? (account?.username ?? `Player Profile`) : `Your Account`}
            description={isPublicView
                ? `Public profile details and competitive standing for this Infinity Hexagonal Tic-Tac-Toe player.`
                : `Account details and competitive standing for your Infinity Hexagonal Tic-Tac-Toe profile.`}
        >
            <div className="flex-1 px-4 pb-4 sm:px-6 sm:pb-6">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/6 px-6 py-10 text-center text-slate-300">
                        {isPublicView ? `Loading profile...` : `Loading your account...`}
                    </div>
                ) : isMissingPublicProfile ? (
                    <div className="flex h-full items-center justify-center">
                        <section className="w-full max-w-2xl rounded-[1.75rem] border border-white/10 bg-white/6 p-6 text-center shadow-[0_20px_80px_rgba(15,23,42,0.35)] sm:p-8">
                            <div className="text-xs uppercase tracking-[0.3em] text-sky-100/90">
                                Profile
                            </div>

                            <h2 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white">
                                Profile Not Found
                            </h2>

                            <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
                                This player profile is unavailable or no longer exists.
                            </p>
                        </section>
                    </div>
                ) : errorMessage ? (
                    <div className="rounded-3xl border border-rose-300/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                        {errorMessage}
                    </div>
                ) : !account ? (
                    isPublicView ? (
                        <div className="flex h-full items-center justify-center">
                            <section className="w-full max-w-2xl rounded-[1.75rem] border border-white/10 bg-white/6 p-6 text-center shadow-[0_20px_80px_rgba(15,23,42,0.35)] sm:p-8">
                                <div className="text-xs uppercase tracking-[0.3em] text-sky-100/90">
                                    Profile
                                </div>

                                <h2 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white">
                                    Profile Not Found
                                </h2>

                                <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
                                    This player profile is unavailable or no longer exists.
                                </p>
                            </section>
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center">
                            <section className="w-full max-w-2xl rounded-[1.75rem] border border-amber-300/20 bg-amber-300/10 p-6 text-center shadow-[0_20px_80px_rgba(15,23,42,0.35)] sm:p-8">
                                <div className="text-xs uppercase tracking-[0.3em] text-amber-100/90">
                                    Profile Access
                                </div>

                                <h2 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white">
                                    Sign In Required
                                </h2>

                                <p className="mt-4 text-sm leading-6 text-amber-50/85 sm:text-base">
                                    Sign in with Discord to view your account details and competitive standing.
                                </p>

                                <button
                                    onClick={() => void handleSignIn()}
                                    className="mt-6 rounded-full bg-[#5865F2] px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-[#6f7cff]"
                                >
                                    Sign In With Discord
                                </button>
                            </section>
                        </div>
                    )
                ) : (
                    <div className="space-y-6">
                        <section className="relative overflow-hidden rounded-4xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_30%),rgba(255,255,255,0.05)] p-6 shadow-[0_24px_100px_rgba(15,23,42,0.34)] sm:p-8">
                            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-sky-200/50 to-transparent" />

                            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] xl:items-end">
                                <div className="min-w-0 flex items-center my-auto">
                                    <div className="flex min-w-0 items-start gap-4">
                                        <AccountPicture username={account.username} image={account.image} className="h-20 w-20 sm:h-24 sm:w-24 mr-4" />

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100">
                                                    {account.role === `admin` ? `Administrator` : `Player Profile`}
                                                </span>

                                                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-200">
                                                    Discord Account
                                                </span>
                                            </div>

                                            <h2 className="mt-4 truncate text-3xl font-black uppercase tracking-[0.06em] text-white sm:text-4xl">
                                                {account.username}
                                            </h2>

                                            <div className="mt-4 flex flex-col text-slate-300">
                                                <AccountMetaItem label="Member Since" value={memberSinceLabel ?? `Unavailable`} />
                                                <AccountMetaItem label="Last Seen" value={lastSeenLabel ?? `Unavailable`} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    {isStatisticsLoading ? (
                                        <StatisticsLoadingState message={isPublicView ? `Loading profile statistics...` : `Loading your statistics...`} />
                                    ) : statisticsErrorMessage ? (
                                        <StatisticsErrorState message={statisticsErrorMessage} />
                                    ) : statistics ? (
                                        <div className="grid gap-4 lg:grid-cols-2">
                                            <PrimaryStatCard
                                                label="World Rank"
                                                value={formatWorldRank(statistics.worldRank)}
                                                detail={statistics.worldRank === null ? `Finish a ranked game to enter the global standings.` : `Current global placement based on ELO.`}
                                                accentClassName="text-amber-200"
                                            />

                                            <PrimaryStatCard
                                                label="ELO Rating"
                                                value={statistics.elo}
                                                detail="Current rating from ranked play."
                                                accentClassName="text-sky-200"
                                            />
                                        </div>
                                    ) : (
                                        <StatisticsEmptyState message={isPublicView
                                            ? `Statistics will appear here once this profile has competitive data ready.`
                                            : `Statistics will appear here once your profile data is ready.`}
                                        />
                                    )}
                                </div>
                            </div>
                        </section>

                        {liveGame ? (
                            <LiveGameSection liveGame={liveGame} />
                        ) : null}

                        <section className="">
                            {isStatisticsLoading ? (
                                <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-300">
                                    {isPublicView ? `Loading profile statistics...` : `Loading your statistics...`}
                                </div>
                            ) : statisticsErrorMessage ? (
                                <div className="mt-6 rounded-[1.25rem] border border-rose-300/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
                                    {statisticsErrorMessage}
                                </div>
                            ) : statistics ? (
                                <>
                                    <section className="mt-6 rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.5))] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
                                        <EloHistoryChartSection
                                            eloHistory={statistics.eloHistory}
                                            currentElo={statistics.elo}
                                        />

                                        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                                            <SecondaryStatCard
                                                label="Ranked Games"
                                                value={statistics.rankedGames.played}
                                                detail={formatWinSummary(statistics.rankedGames.won, statistics.rankedGames.played)}
                                            />

                                            <SecondaryStatCard
                                                label="Current Win Streak"
                                                value={statistics.rankedGames.currentWinStreak}
                                                detail="Current number of unbeaten rated games"
                                            />

                                            <SecondaryStatCard
                                                label="Longest Win Streak"
                                                value={statistics.rankedGames.longestWinStreak}
                                                detail="Longest streak of unbeaten rated games"
                                            />
                                        </div>
                                    </section>

                                    <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1.2fr_0.95fr]">
                                        <StatisticsGroup
                                            eyebrow="Overview"
                                            title="Overall Games"
                                            description={`All finished games, regardless of queue type, along with the volume of moves you've logged.`}
                                            accentClassName="text-sky-200/85"
                                            cardGridClassName="sm:grid-cols-2 xl:grid-cols-1"
                                        >
                                            <SecondaryStatCard
                                                label="Total Games"
                                                value={statistics.totalGames.played}
                                                detail={formatWinSummary(statistics.totalGames.won, statistics.totalGames.played)}
                                            />

                                            <SecondaryStatCard
                                                label="Total Moves"
                                                value={statistics.totalMovesMade}
                                                detail="Moves recorded across all of your finished matches."
                                            />
                                        </StatisticsGroup>

                                        <StatisticsGroup
                                            eyebrow="Records"
                                            title="Personal Highlights"
                                            description="Personal highlights like longest match measured by time or move count."
                                            accentClassName="text-emerald-200/85"
                                            cardGridClassName="sm:grid-cols-2 xl:grid-cols-1"
                                        >
                                            <SecondaryStatCard
                                                label="Longest Game"
                                                value={formatDetailedDuration(statistics.longestGamePlayedMs)}
                                                detail="Your longest finished game by duration."
                                            />

                                            <SecondaryStatCard
                                                label="Longest By Moves"
                                                value={statistics.longestGameByMoves}
                                                detail="Your longest finished game by move count."
                                            />
                                        </StatisticsGroup>
                                    </div>
                                </>
                            ) : (
                                <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-300">
                                    Statistics will appear here once your profile data is ready.
                                </div>
                            )}
                        </section>

                        <RecentGamesSection
                            profileId={account.id}
                            recentGames={recentGames}
                            isLoading={isRecentGamesLoading}
                            errorMessage={recentGamesErrorMessage}
                            isPublicView={isPublicView}
                        />
                    </div>
                )}
            </div>
        </PageCorpus>
    );
}

export default ProfileScreen;
