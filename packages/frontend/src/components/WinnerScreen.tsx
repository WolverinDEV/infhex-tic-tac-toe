import type { SessionFinishReason } from '@ih3t/shared'
import FinishedPlayerScreen from './FinishedPlayerScreen'

interface WinnerScreenProps {
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
  onReviewGame?: () => void
  onRequestRematch?: () => void
  isRematchAvailable?: boolean
  isRematchRequestedByCurrentPlayer?: boolean
  isRematchRequestedByOpponent?: boolean
}

function WinnerScreen({
  reason,
  onReturnToLobby,
  onReviewGame,
  onRequestRematch,
  isRematchAvailable = true,
  isRematchRequestedByCurrentPlayer = false,
  isRematchRequestedByOpponent = false
}: Readonly<WinnerScreenProps>) {
  const message = reason === 'timeout'
    ? 'The other player failed to place a cell before the timer ran out.'
    : reason === 'six-in-a-row'
      ? 'You completed a six-tile row.'
      : 'The other player disconnected.'

  return (
    <FinishedPlayerScreen
      variant="win"
      title="You've Won"
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

export default WinnerScreen
