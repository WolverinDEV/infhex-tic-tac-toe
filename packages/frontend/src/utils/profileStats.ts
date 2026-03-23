export function formatWorldRank(worldRank: number | null) {
  return worldRank === null ? '--' : `#${worldRank}`
}

export function formatWinSummary(won: number, played: number) {
  if (played <= 0) {
    return 'No finished games yet.'
  }

  const winRate = Math.round((won / played) * 100)
  return `${won} won · ${winRate}% win rate`
}

export function formatStreakDetail(streak: number) {
  return streak === 1 ? '1 consecutive rated win.' : `${streak} consecutive rated wins.`
}
