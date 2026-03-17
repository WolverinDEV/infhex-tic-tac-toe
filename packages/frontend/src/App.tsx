import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { BoardState, ServerToClientEvents, ClientToServerEvents, SessionFinishReason, SessionInfo, SessionState } from '@ih3t/shared'
import GameScreen from './components/GameScreen'
import LobbyScreen from './components/LobbyScreen'
import WaitingScreen from './components/WaitingScreen'
import LoserScreen from './components/LoserScreen'
import WinnerScreen from './components/WinnerScreen'

type ScreenState = 'lobby' | 'waiting' | 'playing' | 'winner' | 'loser'

function App() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const sessionIdRef = useRef<string>('')
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
    const socket = io('http://localhost:3001')
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Connected to server')
      setIsConnected(true)
      setCurrentPlayerId(socket.id ?? '')
      fetchAvailableSessions()
    })

    socket.on('sessions-updated', (sessions: SessionInfo[]) => {
      syncAvailableSessions(sessions)
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from server')
      setIsConnected(false)
      setCurrentPlayerId('')
      resetToLobby()
      setAvailableSessions([])
    })

    socket.on('player-joined', (data: { players: string[]; state: SessionState }) => {
      console.log('Player joined:', data)
      setPlayers(data.players)
      updateScreenForSessionState(data.state)
    })

    socket.on('player-left', (data: { players: string[]; state: SessionState }) => {
      console.log('Player left:', data)
      setPlayers(data.players)
      updateScreenForSessionState(data.state)
    })

    socket.on('session-finished', (data: { sessionId: string; winnerId: string; loserId: string; reason: SessionFinishReason }) => {
      console.log('Session finished:', data)

      if (data.sessionId !== sessionIdRef.current) {
        return
      }

      setFinishReason(data.reason)

      if (data.winnerId === socket.id) {
        setScreenState('winner')
        return
      }

      if (data.loserId === socket.id) {
        setScreenState('loser')
        return
      }

      resetToLobby()
    })

    socket.on('game-state', (data: { sessionId: string; gameState: BoardState }) => {
      if (data.sessionId !== sessionIdRef.current) {
        return
      }

      setBoardState(data.gameState)
    })

    socket.on('game-action', (data: { playerId: string; action: any }) => {
      console.log('Game action received:', data)
      // Handle game actions here
    })

    socket.on('error', (error: string) => {
      console.error('Socket error:', error)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const fetchAvailableSessions = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions')
      const sessions: SessionInfo[] = await response.json()
      syncAvailableSessions(sessions)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    }
  }

  const hostGame = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      setSessionId(data.sessionId)
      setIsHost(true)
      setBoardState({
        cells: [],
        currentTurnPlayerId: null,
        placementsRemaining: 0,
        currentTurnExpiresAt: null
      })
      setScreenState('waiting')
      socketRef.current?.emit('join-session', data.sessionId)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const joinGame = (sessionIdToJoin: string) => {
    setSessionId(sessionIdToJoin)
    setIsHost(false)
    setBoardState({
      cells: [],
      currentTurnPlayerId: null,
      placementsRemaining: 0,
      currentTurnExpiresAt: null
    })
    setScreenState('waiting')
    socketRef.current?.emit('join-session', sessionIdToJoin)
  }

  const leaveGame = () => {
    if (sessionId && socketRef.current) {
      socketRef.current.emit('leave-session', sessionId)
      resetToLobby()
    }
  }

  if (screenState === 'playing') {
    return (
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
    return <WinnerScreen reason={finishReason} onReturnToLobby={resetToLobby} />
  }

  if (screenState === 'loser') {
    return <LoserScreen reason={finishReason} onReturnToLobby={resetToLobby} />
  }

  if (screenState === 'waiting') {
    return (
      <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(160deg,_#0f172a,_#111827_45%,_#1e293b)] px-6 py-10 text-white">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
          <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
            <section className="relative flex min-h-[34rem] overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur md:p-10">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl" />
              <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-sky-400/20 blur-3xl" />

              <div className="relative flex flex-1 flex-col justify-center">
                <div className="self-start inline-flex rounded-full border border-amber-300/35 bg-amber-300/10 px-4 py-1 text-xs uppercase tracking-[0.35em] text-amber-100">
                  Matchmaking
                </div>
                <h1 className="mt-6 text-5xl font-black uppercase tracking-[0.08em] text-white sm:text-6xl">
                  Infinity
                  <br />
                  Hexagonial
                  <br />
                  Tik-Tak-Toe
                </h1>
                <p className="mt-6 max-w-lg text-base leading-7 text-slate-200 sm:text-lg">
                  Your session is live and visible in the lobby list. Share the code with a second player and stay ready for the board to open.
                </p>
              </div>
            </section>

            <WaitingScreen
              sessionId={sessionId}
              playerCount={players.length}
              onCancel={leaveGame}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <LobbyScreen
      isConnected={isConnected}
      availableSessions={availableSessions}
      onHostGame={hostGame}
      onJoinGame={joinGame}
    />
  )
}

export default App
