import type { FinishedGameSummary, SessionFinishReason } from '@ih3t/shared'

export type PersonalResultTone = 'win' | 'loss' | 'neutral'

type ResultLabelKey = `${SessionFinishReason}-${PersonalResultTone}`

const RESULT_LABELS: Record<ResultLabelKey, string> = {
  'disconnect-neutral': 'Won by disconnect',
  'disconnect-win': 'Won by disconnect',
  'disconnect-loss': 'Lost due to disconnect',
  'surrender-neutral': 'Won by surrender',
  'surrender-win': 'Won by surrender',
  'surrender-loss': 'Lost due to surrender',
  'timeout-neutral': 'Won on time',
  'timeout-win': 'Won on time',
  'timeout-loss': 'Lost due to timeout',
  'terminated-neutral': 'Match terminated',
  'terminated-win': 'Match terminated',
  'terminated-loss': 'Match terminated',
  'six-in-a-row-neutral': 'Won by six in a row',
  'six-in-a-row-win': 'Won by six in a row',
  'six-in-a-row-loss': 'Lost due to six in a row'
}

function getResultLabel(reason: SessionFinishReason, tone: PersonalResultTone) {
  return RESULT_LABELS[`${reason}-${tone}`]
}

export function getOwnPlayerId(game: FinishedGameSummary, currentProfileId: string | null) {
  if (!currentProfileId) {
    return null
  }

  return game.players.find((player) => player.profileId === currentProfileId)?.playerId ?? null
}

export function getNeutralResultLabel(game: FinishedGameSummary) {
  return getResultLabel(game.gameResult?.reason ?? 'terminated', 'neutral')
}

export function getPersonalResultLabel(game: FinishedGameSummary, currentProfileId: string | null) {
  const ownPlayerId = getOwnPlayerId(game, currentProfileId)
  const reason = game.gameResult?.reason ?? 'terminated'
  const winningPlayerId = game.gameResult?.winningPlayerId ?? null

  if (!ownPlayerId || !winningPlayerId || !game.gameResult) {
    return {
      label: getResultLabel(reason, 'neutral'),
      tone: 'neutral' as const
    }
  }

  const didWin = ownPlayerId === winningPlayerId
  const tone = didWin ? 'win' as const : 'loss' as const

  return {
    label: getResultLabel(reason, tone),
    tone
  }
}
