import type { GameTimeControl } from '@ih3t/shared'

export function formatGameTimeSeconds(totalSeconds: number) {
  if (totalSeconds % 60 === 0) {
    return `${totalSeconds / 60}m`
  }

  return `${totalSeconds}s`
}

export function formatTimeControl(timeControl: GameTimeControl) {
  if (timeControl.mode === 'unlimited') {
    return 'Unlimited'
  }

  if (timeControl.mode === 'turn') {
    return `Turn ${formatGameTimeSeconds(Math.round(timeControl.turnTimeMs / 1000))}`
  }

  return `Match ${formatGameTimeSeconds(Math.round(timeControl.mainTimeMs / 1000))} +${formatGameTimeSeconds(Math.round(timeControl.incrementMs / 1000))}`
}

export function formatTimeControlDescription(timeControl: GameTimeControl) {
  if (timeControl.mode === 'unlimited') {
    return 'No clock is configured for this lobby.'
  }

  if (timeControl.mode === 'turn') {
    return `Each turn is configured for ${formatGameTimeSeconds(Math.round(timeControl.turnTimeMs / 1000))}.`
  }

  return `Each player can keep up to ${formatGameTimeSeconds(Math.round(timeControl.mainTimeMs / 1000))} total, gaining ${formatGameTimeSeconds(Math.round(timeControl.incrementMs / 1000))} after each completed turn.`
}
