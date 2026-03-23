import { useEffect, useState } from 'react'
import type { Leaderboard, LeaderboardPlacement, LeaderboardPlayer } from '@ih3t/shared'
import { Link } from 'react-router'
import { useQueryAccount } from '../query/accountClient'
import { getInitialRenderTimestamp } from '../ssrState'
import { formatDateTime } from '../utils/dateTime'
import { formatRefreshCountdown } from '../utils/duration'

function LeaderboardAvatar({ player }: Readonly<{ player: LeaderboardPlayer }>) {
  if (player.image) {
    return (
      <img
        src={player.image}
        alt={player.displayName}
        className="h-10 w-10 flex-shrink-0 rounded-full object-cover sm:h-11 sm:w-11"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-xs font-black text-white sm:h-11 sm:w-11 sm:text-sm">
      {player.displayName.slice(0, 2).toUpperCase()}
    </div>
  )
}

function getProfileHref(profileId: string) {
  return `/profile/${encodeURIComponent(profileId)}`
}

function LeaderboardMetric({
  label,
  value,
  minWidth,
}: Readonly<{
  label: string
  value: string | number
  minWidth: string
}>) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap justify-end" style={{ minWidth }}>
      <div className="text-sm font-bold text-white sm:text-base text-right">{value}</div>
      <div className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-500 sm:text-[0.62rem]">{label}</div>
    </div >
  )
}

function getRankTone(rank: number) {
  if (rank === 1) {
    return 'border-amber-200/70 bg-amber-300 text-slate-950 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]'
  }

  if (rank === 2) {
    return 'border-slate-100/60 bg-slate-100 text-slate-950 shadow-[0_0_0_3px_rgba(226,232,240,0.12)]'
  }

  if (rank === 3) {
    return 'border-orange-200/60 bg-orange-300 text-slate-950 shadow-[0_0_0_3px_rgba(253,186,116,0.14)]'
  }

  return 'border-white/10 bg-white/8 text-slate-200'
}

function PersonalLeaderboardCard({
  placement
}: Readonly<{
  placement: LeaderboardPlacement | null
}>) {
  const queryAccount = useQueryAccount();
  if (!queryAccount.data?.user) {
    /* user is not logged in */
    return;
  }

  if (!placement) {
    return (
      <div className="mt-5 rounded-[1.35rem] border border-sky-300/20 bg-sky-400/10 px-4 py-4 text-sm shadow-[0_16px_60px_rgba(14,165,233,0.12)]">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-sky-200">Your Place</div>
        <Link
          to={getProfileHref(queryAccount.data.user.id)}
          className="mt-2 inline-flex text-base font-bold text-white transition hover:text-sky-100"
        >
          {queryAccount.data.user.username}
        </Link>
        <div className="mt-1 text-slate-300">
          You are not ranked yet. Finish a rated game to claim a leaderboard spot.
        </div>
      </div>
    )
  }

  return (
    <div className={"mt-5"}>
      <LeaderboardCard display={"self"} rank={placement?.rank} player={placement} />
    </div>
  )
}

function LeaderboardCard({
  display,
  rank,
  player
}: Readonly<{
  display: "self" | "normal",
  rank: number,
  player: LeaderboardPlayer,
}>) {

  const kRankTones: Record<string, string> & { "normal": string, "self": string } = {
    "rank-1": 'border-amber-300/35 bg-[linear-gradient(90deg,rgba(251,191,36,0.16),rgba(15,23,42,0.5)_42%)]',
    "rank-2": 'border-slate-200/22 bg-[linear-gradient(90deg,rgba(226,232,240,0.12),rgba(15,23,42,0.5)_42%)]',
    "rank-3": 'border-orange-300/30 bg-[linear-gradient(90deg,rgba(251,146,60,0.14),rgba(15,23,42,0.5)_42%)]',

    "self": 'border-sky-300/25 bg-[linear-gradient(120deg,rgba(14,165,233,0.18),rgba(15,23,42,0.82)_55%)]',
    "normal": 'border-white/10 bg-slate-950/36'
  };

  return (
    <div
      key={`${player.profileId}:${rank}`}
      className={`rounded-[1rem] border px-3 py-2.5 sm:rounded-[1.15rem] sm:px-3.5 sm:py-3 ${kRankTones[`rank-${rank}`] ?? kRankTones[display]}`}
    >
      {display === "self" && (
        <div className="text-[0.68rem] mb-3 font-semibold uppercase tracking-[0.24em] text-sky-200">Your Place</div>
      )}
      <div className="grid grid-cols-[min-content_1fr] sm:grid-cols-[min-content_auto_1fr] gap-x-3 gap-y-2 sm:gap-3.5">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border text-xs font-black sm:h-10 sm:w-10 sm:text-sm ${getRankTone(rank)}`}>
          {rank}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Link
            to={getProfileHref(player.profileId)}
            className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl transition hover:text-sky-100"
          >
            <LeaderboardAvatar player={player} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white transition group-hover:text-sky-100 sm:text-base">{player.displayName}</div>
            </div>
          </Link>
        </div>

        <div className="col-start-2 justify-end sm:col-span-1 flex-row-reverse sm:flex-row items-center flex w-full gap-x-4 gap-y-1.5 pt-0.5 text-left sm:w-auto sm:flex-nowrap sm:gap-x-5 sm:pt-0">
          <LeaderboardMetric label="Won" minWidth={"4em"} value={player.gamesWon} />
          <LeaderboardMetric label="Played" minWidth={"4em"} value={player.gamesPlayed} />
          <LeaderboardMetric label="ELO" minWidth={"4em"} value={player.elo} />
        </div>
      </div>
    </div>
  )
}

export function LeaderboardSection({
  leaderboard,
  isLoading,
  title = 'Top 10 Players',
  eyebrow = 'ELO Leaderboard',
  description = 'Ranked by ELO rating from rated games. Ties fall back to rated games played, then account age.',
  showSnapshot = true
}: Readonly<{
  leaderboard: Leaderboard,
  isLoading: boolean,
  currentUsername?: string | null
  title?: string
  eyebrow?: string
  description?: string
  showSnapshot?: boolean
}>) {
  const isOnLeaderboard = leaderboard.ownPlacement && leaderboard.players.some(player => player.profileId === leaderboard.ownPlacement!.profileId);

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-amber-200/80">{eyebrow}</div>
          <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.08em] text-white sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {description}
          </p>
        </div>
        {showSnapshot && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
            Snapshot {formatDateTime(leaderboard.generatedAt)}
          </div>
        )}
      </div>

      {leaderboard.players.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/35 px-5 py-10 text-center text-sm text-slate-400">
          No rated games yet, so the leaderboard is still empty.
        </div>
      ) : (
        <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-2.5">
          {leaderboard.players.map((player, index) => (
            <LeaderboardCard
              key={`${player.profileId}-${index}`}
              display={leaderboard.ownPlacement?.profileId === player.profileId ? "self" : "normal"}
              rank={index + 1}
              player={player}
            />
          ))}
        </div>
      )}

      {!isOnLeaderboard && (
        <PersonalLeaderboardCard placement={leaderboard.ownPlacement} />
      )}

      <LeaderboardRefreshIndicator leaderboard={leaderboard} isRefreshing={isLoading} />
    </section>
  )
}

export function LeaderboardRefreshIndicator({
  leaderboard,
  isRefreshing
}: Readonly<{
  leaderboard: Leaderboard
  isRefreshing: boolean
}>) {
  const [now, setNow] = useState(() => getInitialRenderTimestamp())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  const windowStart = leaderboard.nextRefreshAt - leaderboard.refreshIntervalMs
  const elapsedRatio = Math.min(1, Math.max(0, (now - windowStart) / leaderboard.refreshIntervalMs))
  const remainingMs = Math.max(0, leaderboard.nextRefreshAt - now)

  return (
    <div className="mt-5 min-w-[10em] w-full rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-emerald-100">
          <span className={`h-2.5 w-2.5 rounded-full ${isRefreshing ? 'animate-pulse bg-amber-300' : 'bg-emerald-300'}`} />
          Leaderboard Refresh
        </div>
        <div className="text-sm font-bold text-white">
          {isRefreshing ? 'Updating...' : formatRefreshCountdown(remainingMs)}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-300 via-emerald-300 to-amber-200 transition-[width] duration-700"
          style={{ width: `${elapsedRatio * 100}%` }}
        />
      </div>
      <div className="mt-3 text-sm text-emerald-50/85">
        Last updated {formatDateTime(leaderboard.generatedAt)}. Next recalculation {formatDateTime(leaderboard.nextRefreshAt)}
      </div>
    </div>
  )
}
