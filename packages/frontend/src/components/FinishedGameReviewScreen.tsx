import type { FinishedGameRecord } from '@ih3t/shared'
import FinishedGameReviewError from './finished-game-review/FinishedGameReviewError'
import FinishedGameReviewLoading from './finished-game-review/FinishedGameReviewLoading'
import FinishedGameReviewNotFound from './finished-game-review/FinishedGameReviewNotFound'
import FinishedGameReplayView from './finished-game-review/FinishedGameReplayView'

interface FinishedGameReviewScreenProps {
  game: FinishedGameRecord | null
  isLoading: boolean
  errorMessage: string | null
  onBack: () => void
  onRetry: () => void
}

function FinishedGameReviewScreen({
  game,
  isLoading,
  errorMessage,
  onBack,
  onRetry
}: Readonly<FinishedGameReviewScreenProps>) {
  if (isLoading) {
    return <FinishedGameReviewLoading onBack={onBack} onRetry={onRetry} />
  }

  if (errorMessage) {
    return <FinishedGameReviewError errorMessage={errorMessage} onBack={onBack} onRetry={onRetry} />
  }

  if (!game) {
    return <FinishedGameReviewNotFound onBack={onBack} onRetry={onRetry} />
  }

  return <FinishedGameReplayView game={game} onBack={onBack} onRetry={onRetry} />
}

export default FinishedGameReviewScreen
