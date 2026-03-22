import type { GameTimeControl } from '@ih3t/shared'

function formatSeconds(totalSeconds: number) {
  if (totalSeconds % 60 === 0) {
    const minutes = totalSeconds / 60
    return `${minutes}m`
  }

  return `${totalSeconds}s`
}

export function formatTimeControl(timeControl: GameTimeControl) {
  if (timeControl.mode === 'unlimited') {
    return 'Unlimited'
  }

  if (timeControl.mode === 'turn') {
    return `Turn ${formatSeconds(Math.round(timeControl.turnTimeMs / 1000))}`
  }

  return `Match ${formatSeconds(Math.round(timeControl.mainTimeMs / 1000))} +${formatSeconds(Math.round(timeControl.incrementMs / 1000))}`
}

export function formatTimeControlDescription(timeControl: GameTimeControl) {
  if (timeControl.mode === 'unlimited') {
    return 'No clock is configured for this lobby.'
  }

  if (timeControl.mode === 'turn') {
    return `Each turn is configured for ${formatSeconds(Math.round(timeControl.turnTimeMs / 1000))}.`
  }

  return `Each player can keep up to ${formatSeconds(Math.round(timeControl.mainTimeMs / 1000))} total, gaining ${formatSeconds(Math.round(timeControl.incrementMs / 1000))} after each completed turn.`
}
