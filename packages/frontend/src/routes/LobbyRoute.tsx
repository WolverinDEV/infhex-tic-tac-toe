import { useEffect } from 'react'
import { CHANGELOG_DAYS, type CreateSessionRequest } from '@ih3t/shared'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'react-toastify'
import LobbyScreen from '../components/LobbyScreen'
import { joinGame } from '../liveGameClient'
import { useLiveGameStore } from '../liveGameStore'
import { useQueryAccount, useQueryAccountPreferences } from '../query/accountClient'
import { countUnreadChangelogEntries } from '../utils/changelog'
import { hostGame } from '../query/sessionClient'
import { useQueryAvailableSessions } from '../query/sessionClient'
import { buildFinishedGamesPath, buildSessionPath } from './archiveRouteState'

function LobbyRoute() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteSessionId = searchParams.get('join')
  const connection = useLiveGameStore(state => state.connection)
  const shutdown = useLiveGameStore(state => state.shutdown)
  const accountQuery = useQueryAccount({ enabled: true })
  const accountPreferencesQuery = useQueryAccountPreferences({
    enabled: !accountQuery.isLoading && Boolean(accountQuery.data?.user)
  })
  const availableSessionsQuery = useQueryAvailableSessions({ enabled: true })
  const unreadChangelogEntries = accountQuery.data?.user && accountPreferencesQuery.data?.preferences
    ? countUnreadChangelogEntries(CHANGELOG_DAYS, accountPreferencesQuery.data.preferences.changelogReadAt)
    : 0

  useEffect(() => {
    if (!inviteSessionId) {
      return
    }

    void navigate(buildSessionPath(inviteSessionId), { replace: true })
  }, [inviteSessionId, navigate])

  const createLobby = (request: CreateSessionRequest) => {
    void (async () => {
      try {
        const sessionId = await hostGame(request)
        if (!sessionId) {
          return
        }

        /* join the game and the join method will update the screen to the lobby screen */
        joinGame(sessionId)
      } catch (error) {
        console.error('Failed to create session:', error)
        const message = error instanceof Error ? error.message : 'Failed to create a session.'
        toast.error(message, {
          toastId: `error:${message}`
        })
      }
    })()
  }

  const joinLiveGame = (sessionId: string) => {
    void navigate(buildSessionPath(sessionId))
  }

  return (
    <LobbyScreen
      isConnected={connection.isConnected}
      shutdown={shutdown}
      account={accountQuery.data?.user ?? null}
      isAccountLoading={accountQuery.isLoading}
      liveSessions={availableSessionsQuery.data ?? []}
      onHostGame={createLobby}
      onJoinGame={joinLiveGame}
      onOpenSandbox={() => void navigate('/sandbox')}
      onViewFinishedGames={() => void navigate(buildFinishedGamesPath(1, Date.now()))}
      onViewLeaderboard={() => void navigate('/leaderboard')}
      onViewChangelog={() => void navigate('/changelog')}
      onViewOwnFinishedGames={() => void navigate(buildFinishedGamesPath(1, Date.now(), 'mine'))}
      onViewAdmin={() => void navigate('/admin')}
      unreadChangelogEntries={unreadChangelogEntries}
    />
  )
}

export default LobbyRoute
