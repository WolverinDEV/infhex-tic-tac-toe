import type {
  AdminActiveGamesTimeline,
  AdminLongestGameInDuration,
  AdminLongestGameInMoves,
  AdminStatsResponse,
  AdminStatsWindow,
  AdminUserStatsWindow
} from '@ih3t/shared'
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { formatChartDateTime, formatDateTime } from '../utils/dateTime'
import { formatBucketSize, formatLongDuration } from '../utils/duration'
import PageCorpus from './PageCorpus'

interface AdminStatsScreenProps {
  stats: AdminStatsResponse | null
  isLoading: boolean
  errorMessage: string | null
  onOpenControls: () => void
  onRefresh: () => void
  onOpenGame: (gameId: string) => void
}

function SummaryCard({
  label,
  value,
  tone = 'default'
}: {
  label: string
  value: string | number
  tone?: 'default' | 'accent'
}) {
  return (
    <div className={`rounded-[1.35rem] border px-4 py-3 shadow-[0_14px_40px_rgba(15,23,42,0.2)] ${tone === 'accent'
      ? 'border-amber-300/25 bg-amber-300/10'
      : 'border-white/10 bg-white/6'
      }`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 text-[0.65rem] uppercase tracking-[0.28em] text-slate-300">{label}</div>
        <div className="text-2xl font-black leading-none text-white sm:text-[1.8rem]">{value}</div>
      </div>
    </div>
  )
}

function StatStripItem({
  label,
  value
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2.5">
      <div className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold leading-none text-white">{value}</div>
    </div>
  )
}

function LongestGameCard({
  label,
  emptyLabel,
  game,
  value,
  onOpenGame
}: {
  label: string
  emptyLabel: string
  game: AdminLongestGameInMoves | AdminLongestGameInDuration | null
  value: string | null
  onOpenGame: (gameId: string) => void
}) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/45 p-3">
      <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      {game && value ? (
        <>
          <div className="mt-2 text-xl font-bold leading-tight text-white">{value}</div>
          <div className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">{game.players.join(' vs ') || game.sessionId}</div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">{game.sessionId}</div>
          <div className="mt-1 text-xs text-slate-400">Finished {formatDateTime(game.finishedAt)}</div>
          <button
            onClick={() => onOpenGame(game.gameId)}
            className="mt-3 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-sky-100 transition hover:bg-sky-400/20"
          >
            Open Replay
          </button>
        </>
      ) : (
        <div className="mt-2 text-sm leading-5 text-slate-400">{emptyLabel}</div>
      )}
    </div>
  )
}

function UserWindowCard({
  title,
  windowStats
}: {
  title: string
  windowStats: AdminUserStatsWindow
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
      <div className="text-[0.68rem] uppercase tracking-[0.3em] text-emerald-200/80">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">
        {formatDateTime(windowStats.startAt)} to {formatDateTime(windowStats.endAt)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatStripItem label="New Users" value={windowStats.newUsers} />
        <StatStripItem label="Active Users" value={windowStats.activeUsers} />
      </div>
    </section>
  )
}

function ActiveGamesChartSection({
  timeline
}: {
  timeline: AdminActiveGamesTimeline
}) {
  return (
    <section className="rounded-[1.6rem] border border-white/10 bg-white/6 p-4 shadow-[0_22px_70px_rgba(15,23,42,0.3)] sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[0.68rem] uppercase tracking-[0.3em] text-sky-200/80">Active Games Timeline</div>
          <div className="mt-1 text-sm font-semibold text-white">
            Peak concurrent active games in {formatBucketSize(timeline.bucketSizeMs)} buckets over the last 7 days
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-400">
            Drag the range selector below the chart to zoom into a narrower time window.
          </div>
        </div>
        <div className="text-xs leading-5 text-slate-400">
          {formatDateTime(timeline.startAt)} to {formatDateTime(timeline.endAt)}
        </div>
      </div>

      <div className="mt-5 h-72 rounded-[1.25rem] border border-white/8 bg-slate-950/45 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline.points} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
            <XAxis
              dataKey="timestamp"
              minTickGap={28}
              stroke="#94a3b8"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatChartDateTime}
            />
            <YAxis
              allowDecimals={false}
              stroke="#94a3b8"
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(125,211,252,0.35)', strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: 'rgba(2,6,23,0.94)',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: '1rem',
                color: '#e2e8f0'
              }}
              formatter={(value) => [`${value} games`, 'Active']}
              labelFormatter={(label) => formatDateTime(Number(label))}
            />
            <Brush
              dataKey="timestamp"
              height={28}
              stroke="#7dd3fc"
              travellerWidth={10}
              tickFormatter={formatChartDateTime}
              fill="rgba(15,23,42,0.92)"
            />
            <Line
              type="monotone"
              dataKey="activeGames"
              stroke="#7dd3fc"
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function IntervalSection({
  title,
  windowStats,
  onOpenGame
}: {
  title: string
  windowStats: AdminStatsWindow
  onOpenGame: (gameId: string) => void
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
      <div className="flex flex-col gap-2">
        <div>
          <div className="text-[0.68rem] uppercase tracking-[0.3em] text-sky-200/80">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">
            {formatDateTime(windowStats.startAt)} to {formatDateTime(windowStats.endAt)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatStripItem label="Games" value={windowStats.gamesPlayed} />
        <StatStripItem label="Visits" value={windowStats.siteVisits} />
        <StatStripItem label="Played" value={formatLongDuration(windowStats.timePlayedMs)} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <LongestGameCard
          label="Longest Game In Moves"
          emptyLabel="No completed games in this interval yet."
          game={windowStats.longestGameInMoves}
          value={windowStats.longestGameInMoves ? `${windowStats.longestGameInMoves.moveCount} moves` : null}
          onOpenGame={onOpenGame}
        />
        <LongestGameCard
          label="Longest Game In Duration"
          emptyLabel="No completed timed results in this interval yet."
          game={windowStats.longestGameInDuration}
          value={windowStats.longestGameInDuration ? formatLongDuration(windowStats.longestGameInDuration.durationMs) : null}
          onOpenGame={onOpenGame}
        />
      </div>
    </section>
  )
}

function AdminStatsScreen({
  stats,
  isLoading,
  errorMessage,
  onRefresh,
  onOpenGame
}: Readonly<AdminStatsScreenProps>) {
  return (
    <PageCorpus
      category={"Admin"}
      title={"Site Statistics"}
      description={
        <>
          Live activity, traffic, and completed-game records across the main reporting windows.
          {stats && (
            <span className="inline-block text-sm text-slate-400">Last updated {formatDateTime(stats.generatedAt)}</span>
          )}
        </>
      }

      onRefresh={onRefresh}
    >
      <div className={"px-4 sm:px-6 pb-6"}>
        {errorMessage && (
          <div className="mt-6 rounded-[1.5rem] border border-rose-300/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {errorMessage}
          </div>
        )}

        {isLoading && !stats ? (
          <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/6 px-6 py-10 text-center text-slate-300">
            Loading statistics...
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-4 xl:grid-cols-4">
              <SummaryCard label="Total Users" value={stats.users.total} tone="accent" />
              <UserWindowCard title="Since Midnight" windowStats={stats.users.intervals.sinceMidnight} />
              <UserWindowCard title="Last 7 Days" windowStats={stats.users.intervals.last7Days} />
              <UserWindowCard title="Last Month" windowStats={stats.users.intervals.lastMonth} />
            </div>

            <div className="grid mt-5  gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Active Games" value={stats.activeGames.total ?? '...'} tone="accent" />
              <SummaryCard label="Public Games" value={stats.activeGames.public ?? '...'} />
              <SummaryCard label="Private Games" value={stats.activeGames.private ?? '...'} />
              <SummaryCard label="Connected Clients" value={stats.connectedClients ?? '...'} />
            </div>

            <div className="mt-4">
              <ActiveGamesChartSection timeline={stats.activeGamesTimeline} />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <IntervalSection title="Since Midnight" windowStats={stats.intervals.sinceMidnight} onOpenGame={onOpenGame} />
              <IntervalSection title="Last 24 Hours" windowStats={stats.intervals.last24Hours} onOpenGame={onOpenGame} />
              <IntervalSection title="Last 7 Days" windowStats={stats.intervals.last7Days} onOpenGame={onOpenGame} />
            </div>
          </>
        ) : null}
      </div>
    </PageCorpus>
  )
}

export default AdminStatsScreen
