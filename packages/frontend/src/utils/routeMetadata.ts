import type {
  FinishedGameRecord,
  FinishedGameSummary,
  GameTimeControl,
  LobbyInfo,
  LobbyListParticipant
} from '@ih3t/shared'
import { DEFAULT_PAGE_TITLE } from '../components/PageMetadata'

function formatPlayerLabel(player: LobbyListParticipant) {
  const normalizedName = player.displayName.trim() || 'A player'
  return player.elo > 0 ? `${normalizedName} (${player.elo} ELO)` : normalizedName
}

export function formatTimeControl(timeControl: GameTimeControl): string {
  if (timeControl.mode === 'unlimited') {
    return 'no'
  }

  const formatSeconds = (totalSeconds: number): string => {
    if (totalSeconds % 60 === 0) {
      return `${totalSeconds / 60}m`
    }

    return `${totalSeconds}s`
  }

  if (timeControl.mode === 'turn') {
    return `${formatSeconds(Math.round(timeControl.turnTimeMs / 1000))} turn based`
  }

  return `${formatSeconds(Math.round(timeControl.mainTimeMs / 1000))} +${formatSeconds(Math.round(timeControl.incrementMs / 1000))} clock based`
}

export function describeLobbyInvite(session: LobbyInfo | null) {
  if (!session) {
    return {
      title: `Invite Expired • ${DEFAULT_PAGE_TITLE}`,
      description: 'This live session is no longer active. Open the lobby to host or join another match.',
      robots: 'noindex, nofollow' as const
    }
  }

  const canJoin = session.startedAt === null && session.players.length < 2
  const inviteModeLabel = session.rated ? 'Rated' : 'Casual'
  const playerLabels = session.players.map(formatPlayerLabel)

  if (canJoin) {
    const waitingLabel = playerLabels[0]
      ? `${playerLabels[0]} is waiting for you`
      : 'A lobby is waiting for you'

    return {
      title: `Join ${inviteModeLabel} Lobby ${session.id} • ${DEFAULT_PAGE_TITLE}`,
      description: `${waitingLabel} with ${formatTimeControl(session.timeControl)} time control. Click to join the match.`,
      robots: 'noindex, nofollow' as const
    }
  }

  const matchLabel = playerLabels.length >= 2
    ? `${playerLabels[0]} and ${playerLabels[1]} are already playing`
    : playerLabels[0]
      ? `${playerLabels[0]} is already playing`
      : 'A match is already underway'

  return {
    title: `Spectate ${inviteModeLabel} Match ${session.id} • ${DEFAULT_PAGE_TITLE}`,
    description: `${matchLabel} with ${formatTimeControl(session.timeControl)} time control. Open to spectate it live.`,
    robots: 'noindex, nofollow' as const
  }
}

export function formatFinishReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'six-in-a-row':
      return 'with a six-in-a-row win'
    case 'disconnect':
      return 'after a disconnect'
    case 'surrender':
      return 'after a surrender'
    case 'timeout':
      return 'after a timeout'
    case 'terminated':
      return 'when the session was terminated'
    default:
      return 'after the match ended'
  }
}

export function describeFinishedGameMetadata(
  game: FinishedGameRecord | FinishedGameSummary,
  isOwnReplay: boolean
) {
  const replayLabel = isOwnReplay ? 'My Replay' : 'Replay'

  return {
    title: `${replayLabel} ${game.sessionId} • ${DEFAULT_PAGE_TITLE}`,
    description: `Review ${isOwnReplay ? 'your' : 'finished'} match ${game.sessionId}: ${game.moveCount} moves, ${game.players.length} players, ended ${formatFinishReason(game.gameResult?.reason)}.`,
    ogType: 'article' as const,
    robots: isOwnReplay ? 'noindex, nofollow' as const : 'index, follow' as const
  }
}

export function formatSandboxPlayerLabel(player: 'player-1' | 'player-2'): string {
  return player === 'player-1' ? 'Player 1' : 'Player 2'
}

export function formatPlacementSummary(placementsRemaining: number): string {
  return placementsRemaining === 1 ? '1 placement remaining' : `${placementsRemaining} placements remaining`
}
