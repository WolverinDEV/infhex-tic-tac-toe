function getTotalSeconds(milliseconds: number, roundMode: 'ceil' | 'round' = 'round') {
  const round = roundMode === 'ceil' ? Math.ceil : Math.round
  return Math.max(0, round(milliseconds / 1000))
}

export function formatMinutesSeconds(milliseconds: number | null, nullLabel: string = '--:--') {
  if (milliseconds === null) {
    return nullLabel
  }

  const totalSeconds = getTotalSeconds(milliseconds, 'ceil')
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatCompactDuration(milliseconds: number) {
  const totalSeconds = getTotalSeconds(milliseconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${seconds}s`
}

export function formatDetailedDuration(milliseconds: number) {
  const totalSeconds = getTotalSeconds(milliseconds)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function formatLongDuration(milliseconds: number) {
  const totalSeconds = getTotalSeconds(milliseconds)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function formatCountdownDuration(milliseconds: number) {
  const totalSeconds = getTotalSeconds(milliseconds, 'ceil')
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export function formatRefreshCountdown(milliseconds: number) {
  if (milliseconds <= 0) {
    return 'Refreshing now'
  }

  const totalSeconds = getTotalSeconds(milliseconds, 'ceil')
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatBucketSize(bucketSizeMs: number) {
  const totalMinutes = Math.round(bucketSizeMs / 60_000)
  return `${totalMinutes}-minute`
}
