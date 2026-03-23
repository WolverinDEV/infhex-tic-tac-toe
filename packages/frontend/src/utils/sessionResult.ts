import type { SessionFinishReason } from '@ih3t/shared'

export function getSessionFinishReasonLabel(reason: SessionFinishReason | null | undefined) {
  if (reason === 'six-in-a-row') {
    return 'Six In A Row'
  }

  if (reason === 'timeout') {
    return 'Timeout'
  }

  if (reason === 'surrender') {
    return 'Surrender'
  }

  if (reason === 'disconnect') {
    return 'Disconnect'
  }

  return 'Terminated'
}

export function getSessionFinishReasonSentenceLabel(reason: SessionFinishReason | null | undefined) {
  if (reason === 'six-in-a-row') {
    return 'Six in a row'
  }

  if (reason === 'timeout') {
    return 'Timeout'
  }

  if (reason === 'surrender') {
    return 'Surrender'
  }

  if (reason === 'disconnect') {
    return 'Disconnect'
  }

  return 'Terminated'
}

export function getWinnerResultMessage(reason: SessionFinishReason | null | undefined) {
  if (reason === 'timeout') {
    return 'The other player ran out of time.'
  }

  if (reason === 'six-in-a-row') {
    return 'You completed a six-tile row.'
  }

  if (reason === 'surrender') {
    return 'The other player surrendered.'
  }

  if (reason === 'disconnect') {
    return 'The other player disconnected.'
  }

  return 'The match has been terminated.'
}

export function getLoserResultMessage(reason: SessionFinishReason | null | undefined) {
  if (reason === 'timeout') {
    return 'You ran out of time.'
  }

  if (reason === 'six-in-a-row') {
    return 'The other player completed a six-tile row.'
  }

  if (reason === 'surrender') {
    return 'You surrendered the match.'
  }

  if (reason === 'disconnect') {
    return 'You left the match before it finished.'
  }

  return 'The match has been terminated.'
}

export function getSpectatorResultTitle(winnerName: string | null) {
  if (winnerName) {
    return `${winnerName} Won`
  }

  return 'Match Finished'
}

export function getSpectatorResultMessage(
  reason: SessionFinishReason | null | undefined,
  winnerName: string | null
) {
  const winningPlayerLabel = winnerName ?? 'A player'

  if (reason === 'timeout') {
    return `${winningPlayerLabel} won on time after the other player ran out of time.`
  }

  if (reason === 'six-in-a-row') {
    return `${winningPlayerLabel} connected six hexagons in a row.`
  }

  if (reason === 'surrender') {
    return `${winningPlayerLabel} won after the other player surrendered.`
  }

  if (reason === 'disconnect') {
    return `${winningPlayerLabel} won after the other player disconnected.`
  }

  return 'The match was terminated before a winner could be declared.'
}
