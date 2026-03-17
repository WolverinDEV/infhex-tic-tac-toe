import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { BoardState, ServerToClientEvents, ClientToServerEvents, SessionFinishReason, SessionInfo, SessionState } from '@ih3t/shared'
import GameScreen from './components/GameScreen'
import LobbyScreen from './components/LobbyScreen'
import WaitingScreen from './components/WaitingScreen'
import LoserScreen from './components/LoserScreen'
import WinnerScreen from './components/WinnerScreen'
import { getOrCreateDeviceId } from './deviceId'

type ScreenState = 'lobby' | 'waiting' | 'playing' | 'winner' | 'loser'

function App() {
  const deviceIdRef = useRef<string>(getOrCreateDeviceId())
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const sessionIdRef = useRef<string>('')
  const inviteSessionIdRef = useRef<string | null>(new URLSearchParams(window.location.search).get('join'))
  const inviteHandledRef = useRef(false)
  const [screenState, setScreenState] = useState<ScreenState>('lobby')
  const [sessionId, setSessionId] = useState<string>('')
  const [players, setPlayers] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('')
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([])
  const [isHost, setIsHost] = useState(false)
  const [finishReason, setFinishReason] = useState<SessionFinishReason | null>(null)
  const [boardState, setBoardState] = useState<BoardState>({
    cells: [],
    currentTurnPlayerId: null,
    placementsRemaining: 0,
    currentTurnExpiresAt: null
  })

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

  const resetToLobby = () => {
    setSessionId('')
    setPlayers([])
    setIsHost(false)
    setFinishReason(null)
    setBoardState({
      cells: [],
      currentTurnPlayerId: null,
      placementsRemaining: 0,
      currentTurnExpiresAt: null
    })
    setScreenState('lobby')
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
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    // Connect to the server
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io('http://localhost:3001', {
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
      sessionIdRef.current = data.sessionId;
      setSessionId(data.sessionId)
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

      if (data.winningPlayerId === socket.id) {
        setScreenState('winner')
      } else {
        setScreenState('loser')
      }
    })

    socket.on('game-state', data => {
      if (data.sessionId !== sessionIdRef.current) {
        return
      }

      updateScreenForSessionState(data.sessionState);
      setBoardState(data.gameState)
    })

    socket.on('error', (error: string) => {
      console.error('Socket error:', error)
      showErrorToast(error)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const fetchAvailableSessions = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions', {
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

  const hostGame = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceIdRef.current
        }
      })
      const data = await response.json()
      setIsHost(true)
      setBoardState({
        cells: [],
        currentTurnPlayerId: null,
        placementsRemaining: 0,
        currentTurnExpiresAt: null
      })
      setPlayers([])
      socketRef.current?.emit('join-session', data.sessionId)
    } catch (error) {
      console.error('Failed to create session:', error)
      showErrorToast('Failed to create a session.')
    }
  }

  const joinGame = (sessionIdToJoin: string) => {
    setIsHost(false)
    setBoardState({
      cells: [],
      currentTurnPlayerId: null,
      placementsRemaining: 0,
      currentTurnExpiresAt: null
    })
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
          title: 'Join my Infinity Hexagonial Tik-Tak-Toe lobby',
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

  let screen = (
    <LobbyScreen
      isConnected={isConnected}
      availableSessions={availableSessions}
      onHostGame={hostGame}
      onJoinGame={joinGame}
    />
  )

  if (screenState === 'playing') {
    screen = (
      <GameScreen
        sessionId={sessionId}
        players={players}
        isHost={isHost}
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
        sessionId={sessionId}
        players={players}
        isHost={isHost}
        currentPlayerId={currentPlayerId}
        boardState={boardState}
        onPlaceCell={() => { }}
        onLeave={leaveGame}
        interactionEnabled={false}
        overlay={<WinnerScreen reason={finishReason} onReturnToLobby={resetToLobby} />}
      />
    )
  }

  if (screenState === 'loser') {
    screen = (
      <GameScreen
        sessionId={sessionId}
        players={players}
        isHost={isHost}
        currentPlayerId={currentPlayerId}
        boardState={boardState}
        onPlaceCell={() => { }}
        onLeave={leaveGame}
        interactionEnabled={false}
        overlay={<LoserScreen reason={finishReason} onReturnToLobby={resetToLobby} />}
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
