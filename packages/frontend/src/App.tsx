import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import {
  BoardState,
  ClientToServerEvents,
  FinishedGameRecord,
  FinishedGameSummary,
  ServerToClientEvents,
  SessionFinishReason,
  SessionInfo,
  SessionParticipantRole,
  SessionState
} from '@ih3t/shared'
import FinishedGameReviewScreen from './components/FinishedGameReviewScreen'
import FinishedGamesScreen from './components/FinishedGamesScreen'
import GameScreen from './components/GameScreen'
import LobbyScreen from './components/LobbyScreen'
import WaitingScreen from './components/WaitingScreen'
import LoserScreen from './components/LoserScreen'
import SpectatorFinishedScreen from './components/SpectatorFinishedScreen'
import WinnerScreen from './components/WinnerScreen'
import { getOrCreateDeviceId } from './deviceId'

type ScreenState = 'lobby' | 'waiting' | 'playing' | 'winner' | 'loser' | 'spectator-finished'
type AppRoute =
  | { page: 'live' }
  | { page: 'finished-games' }
  | { page: 'finished-game'; gameId: string }

function getApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  return import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
}

function getSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL ?? getApiBaseUrl()
}

function parseRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'

  if (normalizedPath === '/games') {
    return { page: 'finished-games' }
  }

  const gameMatch = normalizedPath.match(/^\/games\/([^/]+)$/)
  if (gameMatch) {
    return {
      page: 'finished-game',
      gameId: decodeURIComponent(gameMatch[1])
    }
  }

  return { page: 'live' }
}

function buildRoutePath(route: AppRoute) {
  if (route.page === 'finished-games') {
    return '/games'
  }

  if (route.page === 'finished-game') {
    return `/games/${encodeURIComponent(route.gameId)}`
  }

  return '/'
}

function createEmptyBoardState(): BoardState {
  return {
    cells: [],
    currentTurnPlayerId: null,
    placementsRemaining: 0,
    currentTurnExpiresAt: null
  }
}

function App() {
  const deviceIdRef = useRef<string>(getOrCreateDeviceId())
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const sessionIdRef = useRef<string>('')
  const participantRoleRef = useRef<SessionParticipantRole>('player')
  const inviteSessionIdRef = useRef<string | null>(new URLSearchParams(window.location.search).get('join'))
  const inviteHandledRef = useRef(false)
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname))
  const [screenState, setScreenState] = useState<ScreenState>('lobby')
  const [sessionId, setSessionId] = useState<string>('')
  const [players, setPlayers] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('')
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([])
  const [participantRole, setParticipantRole] = useState<SessionParticipantRole>('player')
  const [finishReason, setFinishReason] = useState<SessionFinishReason | null>(null)
  const [showRematchAction, setShowRematchAction] = useState(false)
  const [canRematch, setCanRematch] = useState(false)
  const [requestedRematchPlayerIds, setRequestedRematchPlayerIds] = useState<string[]>([])
  const [boardState, setBoardState] = useState<BoardState>(createEmptyBoardState)
  const [finishedGames, setFinishedGames] = useState<FinishedGameSummary[]>([])
  const [isFinishedGamesLoading, setIsFinishedGamesLoading] = useState(false)
  const [finishedGamesError, setFinishedGamesError] = useState<string | null>(null)
  const [selectedFinishedGame, setSelectedFinishedGame] = useState<FinishedGameRecord | null>(null)
  const [isSelectedFinishedGameLoading, setIsSelectedFinishedGameLoading] = useState(false)
  const [selectedFinishedGameError, setSelectedFinishedGameError] = useState<string | null>(null)
  const apiBaseUrlRef = useRef<string>(getApiBaseUrl())
  const socketUrlRef = useRef<string>(getSocketUrl())

  const isLiveRoute = route.page === 'live'

  const navigateTo = (nextRoute: AppRoute) => {
    const nextPath = buildRoutePath(nextRoute)
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }

    setRoute(nextRoute)
  }

  const syncAvailableSessions = (sessions: SessionInfo[]) => {
    setAvailableSessions(sessions.filter((session) => session.canJoin))
  }

  const showErrorToast = (message: string) => {
    toast.error(message, {
      toastId: `error:${message}`
    })
  }

  const showSuccessToast = (message: string) => {
    toast.success(message, {
      toastId: `success:${message}`
    })
  }

  const fetchAvailableSessions = async () => {
    try {
      const response = await fetch(`${apiBaseUrlRef.current}/api/sessions`, {
        credentials: 'include',
        headers: {
          'X-Device-Id': deviceIdRef.current
        }
      })
      const sessions: SessionInfo[] = await response.json()
      syncAvailableSessions(sessions)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
      showErrorToast('Failed to fetch available sessions.')
    }
  }

  const fetchFinishedGames = async () => {
    setIsFinishedGamesLoading(true)
    setFinishedGamesError(null)

    try {
      const response = await fetch(`${apiBaseUrlRef.current}/api/finished-games`, {
        credentials: 'include',
        headers: {
          'X-Device-Id': deviceIdRef.current
        }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to load finished games.')
      }

      const data = await response.json() as { games: FinishedGameSummary[] }
      setFinishedGames(data.games)
    } catch (error) {
      console.error('Failed to fetch finished games:', error)
      setFinishedGamesError(error instanceof Error ? error.message : 'Failed to load finished games.')
    } finally {
      setIsFinishedGamesLoading(false)
    }
  }

  const fetchFinishedGame = async (gameId: string) => {
    setIsSelectedFinishedGameLoading(true)
    setSelectedFinishedGameError(null)
    setSelectedFinishedGame(null)

    try {
      const response = await fetch(`${apiBaseUrlRef.current}/api/finished-games/${encodeURIComponent(gameId)}`, {
        credentials: 'include',
        headers: {
          'X-Device-Id': deviceIdRef.current
        }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to load finished game replay.')
      }

      const data = await response.json() as FinishedGameRecord
      setSelectedFinishedGame(data)
    } catch (error) {
      console.error('Failed to fetch finished game:', error)
      setSelectedFinishedGame(null)
      setSelectedFinishedGameError(error instanceof Error ? error.message : 'Failed to load finished game replay.')
    } finally {
      setIsSelectedFinishedGameLoading(false)
    }
  }

  const resetToLobby = () => {
    const activeSessionId = sessionIdRef.current
    if (activeSessionId) {
      socketRef.current?.emit('cancel-rematch', activeSessionId)
    }

    sessionIdRef.current = ''
    setSessionId('')
    setPlayers([])
    participantRoleRef.current = 'player'
    setParticipantRole('player')
    setFinishReason(null)
    setShowRematchAction(false)
    setCanRematch(false)
    setRequestedRematchPlayerIds([])
    setBoardState(createEmptyBoardState())
    setScreenState('lobby')
    navigateTo({ page: 'live' })
    fetchAvailableSessions()
  }

  const updateScreenForSessionState = (state: SessionState) => {
    if (state === 'ingame') {
      setScreenState('playing')
      return
    }

    if (state === 'lobby') {
      setScreenState('waiting')
    }
  }

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    participantRoleRef.current = participantRole
  }, [participantRole])

  useEffect(() => {
    if (route.page === 'finished-games') {
      void fetchFinishedGames()
      return
    }

    if (route.page === 'finished-game') {
      void fetchFinishedGame(route.gameId)
    }
  }, [route])

  useEffect(() => {
    if (!isLiveRoute) {
      return
    }

    let shouldHandleDisconnect = true

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrlRef.current, {
      auth: {
        deviceId: deviceIdRef.current
      },
      withCredentials: true
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Connected to server')
      setIsConnected(true)
      setCurrentPlayerId(socket.id ?? '')
      fetchAvailableSessions()

      if (inviteSessionIdRef.current && !inviteHandledRef.current) {
        inviteHandledRef.current = true
        joinGame(inviteSessionIdRef.current)
        window.history.replaceState({}, '', window.location.pathname)
      }
    })

    socket.on('sessions-updated', (sessions: SessionInfo[]) => {
      syncAvailableSessions(sessions)
    })

    socket.on('disconnect', () => {
      if (!shouldHandleDisconnect) {
        return
      }

      console.log('Disconnected from server')
      setIsConnected(false)
      setCurrentPlayerId('')
      showErrorToast('Disconnected from the server.')
      resetToLobby()
      setAvailableSessions([])
    })

    socket.on('player-joined', data => {
      console.log('Player joined:', data)
      setPlayers(data.players)
      updateScreenForSessionState(data.state)
    })

    socket.on('session-joined', data => {
      console.log('Session joined:', data)
      sessionIdRef.current = data.sessionId
      setSessionId(data.sessionId)
      participantRoleRef.current = data.role
      setParticipantRole(data.role)
      setPlayers(data.players)
      setFinishReason(null)
      setShowRematchAction(false)
      setCanRematch(false)
      setRequestedRematchPlayerIds([])
      setBoardState(createEmptyBoardState())
      updateScreenForSessionState(data.state)
    })

    socket.on('player-left', data => {
      console.log('Player left:', data)
      setPlayers(data.players)
      updateScreenForSessionState(data.state)
    })

    socket.on('session-finished', data => {
      console.log('Session finished:', data)

      if (data.sessionId !== sessionIdRef.current) {
        return
      }

      setFinishReason(data.reason)
      setShowRematchAction(data.canRematch)
      setCanRematch(data.canRematch)
      setRequestedRematchPlayerIds([])

      if (participantRoleRef.current === 'spectator') {
        setScreenState('spectator-finished')
      } else if (data.winningPlayerId === socket.id) {
        setScreenState('winner')
      } else {
        setScreenState('loser')
      }
    })

    socket.on('game-state', data => {
      if (data.sessionId !== sessionIdRef.current) {
        return
      }

      updateScreenForSessionState(data.sessionState)
      setBoardState(data.gameState)
    })

    socket.on('rematch-updated', data => {
      if (data.sessionId !== sessionIdRef.current) {
        return
      }

      setShowRematchAction(true)
      setCanRematch(data.canRematch)
      setRequestedRematchPlayerIds(data.requestedPlayerIds)
    })

    socket.on('error', (error: string) => {
      console.error('Socket error:', error)
      showErrorToast(error)
    })

    return () => {
      shouldHandleDisconnect = false
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      setIsConnected(false)
      setCurrentPlayerId('')
    }
  }, [isLiveRoute])

  const hostGame = async () => {
    try {
      const response = await fetch(`${apiBaseUrlRef.current}/api/sessions`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceIdRef.current
        }
      })
      const data = await response.json()
      participantRoleRef.current = 'player'
      setParticipantRole('player')
      setFinishReason(null)
      setShowRematchAction(false)
      setCanRematch(false)
      setRequestedRematchPlayerIds([])
      setBoardState(createEmptyBoardState())
      setPlayers([])
      socketRef.current?.emit('join-session', data.sessionId)
    } catch (error) {
      console.error('Failed to create session:', error)
      showErrorToast('Failed to create a session.')
    }
  }

  const joinGame = (sessionIdToJoin: string) => {
    participantRoleRef.current = 'player'
    setParticipantRole('player')
    setFinishReason(null)
    setShowRematchAction(false)
    setCanRematch(false)
    setRequestedRematchPlayerIds([])
    setBoardState(createEmptyBoardState())
    setPlayers([])
    socketRef.current?.emit('join-session', sessionIdToJoin)
  }

  const inviteFriend = async () => {
    const inviteUrl = new URL(window.location.href)
    inviteUrl.search = ''
    inviteUrl.searchParams.set('join', sessionId)

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join my Infinity Hexagonial Tic-Tac-Toe lobby',
          text: 'Join my lobby directly with this link.',
          url: inviteUrl.toString()
        })
        showSuccessToast('Invite link shared.')
        return
      }

      await navigator.clipboard.writeText(inviteUrl.toString())
      showSuccessToast('Invite link copied to clipboard.')
    } catch (error) {
      console.error('Failed to share invite link:', error)
      showErrorToast('Failed to share invite link.')
    }
  }

  const leaveGame = () => {
    if (sessionId && socketRef.current) {
      socketRef.current.emit('leave-session', sessionId)
      resetToLobby()
    }
  }

  const requestRematch = () => {
    if (!sessionIdRef.current) {
      return
    }

    socketRef.current?.emit('request-rematch', sessionIdRef.current)
  }

  const isRematchRequestedByCurrentPlayer = requestedRematchPlayerIds.includes(currentPlayerId)
  const isRematchRequestedByOpponent = requestedRematchPlayerIds.some(playerId => playerId !== currentPlayerId)

  let screen = null

  if (route.page === 'finished-games') {
    screen = (
      <FinishedGamesScreen
        games={finishedGames}
        isLoading={isFinishedGamesLoading}
        errorMessage={finishedGamesError}
        onBack={() => navigateTo({ page: 'live' })}
        onOpenGame={(gameId) => navigateTo({ page: 'finished-game', gameId })}
        onRefresh={fetchFinishedGames}
      />
    )
  } else if (route.page === 'finished-game') {
    screen = (
      <FinishedGameReviewScreen
        game={selectedFinishedGame}
        isLoading={isSelectedFinishedGameLoading}
        errorMessage={selectedFinishedGameError}
        onBack={() => navigateTo({ page: 'finished-games' })}
        onRetry={() => fetchFinishedGame(route.gameId)}
      />
    )
  } else {
    screen = (
      <LobbyScreen
        isConnected={isConnected}
        availableSessions={availableSessions}
        onHostGame={hostGame}
        onJoinGame={joinGame}
        onViewFinishedGames={() => navigateTo({ page: 'finished-games' })}
      />
    )

    if (screenState === 'playing') {
      screen = (
        <GameScreen
          players={players}
          participantRole={participantRole}
          currentPlayerId={currentPlayerId}
          boardState={boardState}
          onPlaceCell={(x, y) => socketRef.current?.emit('place-cell', { sessionId, x, y })}
          onLeave={leaveGame}
        />
      )
    }

    if (screenState === 'winner') {
      screen = (
        <GameScreen
          players={players}
          participantRole={participantRole}
          currentPlayerId={currentPlayerId}
          boardState={boardState}
          onPlaceCell={() => { }}
          onLeave={leaveGame}
          interactionEnabled={false}
          overlay={(
            <WinnerScreen
              reason={finishReason}
              onReturnToLobby={resetToLobby}
              onRequestRematch={showRematchAction ? requestRematch : undefined}
              isRematchAvailable={canRematch}
              isRematchRequestedByCurrentPlayer={isRematchRequestedByCurrentPlayer}
              isRematchRequestedByOpponent={isRematchRequestedByOpponent}
            />
          )}
        />
      )
    }

    if (screenState === 'loser') {
      screen = (
        <GameScreen
          players={players}
          participantRole={participantRole}
          currentPlayerId={currentPlayerId}
          boardState={boardState}
          onPlaceCell={() => { }}
          onLeave={leaveGame}
          interactionEnabled={false}
          overlay={(
            <LoserScreen
              reason={finishReason}
              onReturnToLobby={resetToLobby}
              onRequestRematch={showRematchAction ? requestRematch : undefined}
              isRematchAvailable={canRematch}
              isRematchRequestedByCurrentPlayer={isRematchRequestedByCurrentPlayer}
              isRematchRequestedByOpponent={isRematchRequestedByOpponent}
            />
          )}
        />
      )
    }

    if (screenState === 'spectator-finished') {
      screen = (
        <GameScreen
          players={players}
          participantRole={participantRole}
          currentPlayerId={currentPlayerId}
          boardState={boardState}
          onPlaceCell={() => { }}
          onLeave={leaveGame}
          interactionEnabled={false}
          overlay={<SpectatorFinishedScreen reason={finishReason} onReturnToLobby={resetToLobby} />}
        />
      )
    }

    if (screenState === 'waiting') {
      screen = (
        <WaitingScreen
          sessionId={sessionId}
          playerCount={players.length}
          onInviteFriend={inviteFriend}
          onCancel={leaveGame}
        />
      )
    }
  }

  return (
    <>
      {screen}
      <ToastContainer
        position="top-right"
        autoClose={4000}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme="dark"
      />
    </>
  )
}

export default App
