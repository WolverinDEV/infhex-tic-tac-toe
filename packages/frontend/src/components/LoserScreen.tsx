import type { SessionFinishReason } from '@ih3t/shared'
import FinishedPlayerScreen from './FinishedPlayerScreen'

interface LoserScreenProps {
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
  onReviewGame?: () => void
  onRequestRematch?: () => void
  isRematchAvailable?: boolean
  isRematchRequestedByCurrentPlayer?: boolean
  isRematchRequestedByOpponent?: boolean
}

function LoserScreen({
  reason,
  onReturnToLobby,
  onReviewGame,
  onRequestRematch,
  isRematchAvailable = true,
  isRematchRequestedByCurrentPlayer = false,
  isRematchRequestedByOpponent = false
}: Readonly<LoserScreenProps>) {
  const message = reason === 'timeout'
    ? 'You failed to place a cell before the timer ran out.'
    : reason === 'six-in-a-row'
      ? 'The other player completed a six-tile row.'
      : 'You left the match before it finished.'
  return (
    <FinishedPlayerScreen
      variant="lose"
      title="You Lost"
      message={message}
      reason={reason}
      onReturnToLobby={onReturnToLobby}
      onReviewGame={onReviewGame}
      onRequestRematch={onRequestRematch}
      isRematchAvailable={isRematchAvailable}
      isRematchRequestedByCurrentPlayer={isRematchRequestedByCurrentPlayer}
      isRematchRequestedByOpponent={isRematchRequestedByOpponent}
    />
  )
}

export default LoserScreen
