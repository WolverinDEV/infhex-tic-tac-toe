import type { FinishedGameRecord } from '@ih3t/shared'
import FinishedGameReviewError from './finished-game-review/FinishedGameReviewError'
import FinishedGameReviewLoading from './finished-game-review/FinishedGameReviewLoading'
import FinishedGameReviewNotFound from './finished-game-review/FinishedGameReviewNotFound'
import FinishedGameReplayView from './finished-game-review/FinishedGameReplayView'

type FinishedGameReviewScreenProps = {
  game: FinishedGameRecord | null
  isLoading: boolean
  errorMessage: string | null
  showTilePieceMarkers: boolean
  onRetry: () => void
}

function FinishedGameReviewScreen({
  game,
  isLoading,
  errorMessage,
  showTilePieceMarkers,
  onRetry
}: Readonly<FinishedGameReviewScreenProps>) {
  if (isLoading) {
    return <FinishedGameReviewLoading onRetry={onRetry} />
  }

  if (errorMessage) {
    return <FinishedGameReviewError errorMessage={errorMessage} onRetry={onRetry} />
  }

  if (!game) {
    return <FinishedGameReviewNotFound onRetry={onRetry} />
  }

  return <FinishedGameReplayView game={game} onRetry={onRetry} showTilePieceMarkers={showTilePieceMarkers} />
}

export default FinishedGameReviewScreen
