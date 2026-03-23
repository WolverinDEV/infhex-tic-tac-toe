import type { MouseEvent } from 'react'
import type { SessionInfo } from '@ih3t/shared'
import { getLoserResultMessage } from '../utils/sessionResult'
import FinishedPlayerScreen from './FinishedPlayerScreen'

type FinishedSessionInfo = Extract<SessionInfo, { state: 'finished' }>

interface LoserScreenProps {
  session: FinishedSessionInfo
  currentPlayerId: string
  onReturnToLobby: () => void
  reviewGameHref?: string
  onReviewGame?: (event: MouseEvent<HTMLAnchorElement>) => void
  onRequestRematch?: () => void
}

function LoserScreen({
  session,
  currentPlayerId,
  onReturnToLobby,
  reviewGameHref,
  onReviewGame,
  onRequestRematch
}: Readonly<LoserScreenProps>) {
  return (
    <FinishedPlayerScreen
      session={session}
      currentPlayerId={currentPlayerId}
      variant="lose"
      title="You Lost"
      message={getLoserResultMessage(session.finishReason)}
      onReturnToLobby={onReturnToLobby}
      reviewGameHref={reviewGameHref}
      onReviewGame={onReviewGame}
      onRequestRematch={onRequestRematch}
    />
  )
}

export default LoserScreen
