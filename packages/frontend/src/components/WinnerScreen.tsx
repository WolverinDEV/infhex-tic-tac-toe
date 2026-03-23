import type { MouseEvent } from 'react'
import type { SessionInfo } from '@ih3t/shared'
import { getWinnerResultMessage } from '../utils/sessionResult'
import FinishedPlayerScreen from './FinishedPlayerScreen'

type FinishedSessionInfo = Extract<SessionInfo, { state: 'finished' }>

interface WinnerScreenProps {
  session: FinishedSessionInfo
  currentPlayerId: string
  onReturnToLobby: () => void
  reviewGameHref?: string
  onReviewGame?: (event: MouseEvent<HTMLAnchorElement>) => void
  onRequestRematch?: () => void
}

function WinnerScreen({
  session,
  currentPlayerId,
  onReturnToLobby,
  reviewGameHref,
  onReviewGame,
  onRequestRematch
}: Readonly<WinnerScreenProps>) {
  return (
    <FinishedPlayerScreen
      session={session}
      currentPlayerId={currentPlayerId}
      variant="win"
      title="You've Won"
      message={getWinnerResultMessage(session.finishReason)}
      onReturnToLobby={onReturnToLobby}
      reviewGameHref={reviewGameHref}
      onReviewGame={onReviewGame}
      onRequestRematch={onRequestRematch}
    />
  )
}

export default WinnerScreen
