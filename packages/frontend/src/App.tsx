import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { ServerToClientEvents, ClientToServerEvents, SessionInfo } from '@ih3t/shared'

type GameState = 'lobby' | 'waiting' | 'playing'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const [gameState, setGameState] = useState<GameState>('lobby')
  const [sessionId, setSessionId] = useState<string>('')
  const [players, setPlayers] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([])
  const [isHost, setIsHost] = useState(false)

  useEffect(() => {
    // Connect to the server
    const socket = io('http://localhost:3001')
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Connected to server')
      setIsConnected(true)
      fetchAvailableSessions()
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from server')
      setIsConnected(false)
      setGameState('lobby')
    })

    socket.on('player-joined', (data: { players: string[] }) => {
      console.log('Player joined:', data)
      setPlayers(data.players)
      if (data.players.length === 2) {
        setGameState('playing')
      }
    })

    socket.on('player-left', (data: { players: string[] }) => {
      console.log('Player left:', data)
      setPlayers(data.players)
      if (data.players.length < 2) {
        setGameState('waiting')
      }
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
      setAvailableSessions(sessions.filter(session => session.canJoin))
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    }
  }

  useEffect(() => {
    if (gameState !== 'playing') return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Draw game background
    ctx.fillStyle = '#2c3e50'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw game info
    ctx.fillStyle = 'white'
    ctx.font = '24px Arial'
    ctx.fillText(`Game Session: ${sessionId}`, 20, 40)
    ctx.fillText(`Players: ${players.length}/2`, 20, 70)
    ctx.fillText(`You are: ${isHost ? 'Host' : 'Guest'}`, 20, 100)

    // Handle resize
    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      ctx.fillStyle = '#2c3e50'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = 'white'
      ctx.font = '24px Arial'
      ctx.fillText(`Game Session: ${sessionId}`, 20, 40)
      ctx.fillText(`Players: ${players.length}/2`, 20, 70)
      ctx.fillText(`You are: ${isHost ? 'Host' : 'Guest'}`, 20, 100)
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [gameState, sessionId, players, isHost])

  const hostGame = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      setSessionId(data.sessionId)
      setIsHost(true)
      setGameState('waiting')
      socketRef.current?.emit('join-session', data.sessionId)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const joinGame = (sessionIdToJoin: string) => {
    setSessionId(sessionIdToJoin)
    setIsHost(false)
    setGameState('waiting')
    socketRef.current?.emit('join-session', sessionIdToJoin)
  }

  const leaveGame = () => {
    if (sessionId && socketRef.current) {
      socketRef.current.emit('leave-session', sessionId)
      setSessionId('')
      setPlayers([])
      setGameState('lobby')
      setIsHost(false)
      fetchAvailableSessions()
    }
  }

  if (gameState === 'playing') {
    return (
      <div className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          className="block w-full h-full"
        />
        <button
          onClick={leaveGame}
          className="absolute top-2 right-2 px-5 py-2 bg-red-500 text-white border-none rounded cursor-pointer hover:bg-red-600"
        >
          Leave Game
        </button>
      </div>
    )
  }

  return (
    <div className="w-screen h-screen bg-slate-600 flex flex-col items-center justify-center text-white font-sans">
      <h1 className="mb-10 text-5xl text-center">Infinity Hexagonial<br />Tik-Tak-Toe</h1>

      {gameState === 'waiting' && (
        <div className="text-center">
          <h2>Waiting for another player...</h2>
          <p>Session ID: <strong>{sessionId}</strong></p>
          <p>Players: {players.length}/2</p>
          <button
            onClick={leaveGame}
            className="mt-5 px-5 py-2 bg-red-500 text-white border-none rounded cursor-pointer hover:bg-red-600"
          >
            Cancel
          </button>
        </div>
      )}

      {gameState === 'lobby' && (
        <div className="text-center">
          <div className="mb-7">
            <button
              onClick={hostGame}
              disabled={!isConnected}
              className={`px-7 py-3.75 text-lg mr-5 border-none rounded cursor-pointer text-white ${isConnected
                ? 'bg-green-500 hover:bg-green-600 cursor-pointer'
                : 'bg-gray-500 cursor-not-allowed'
                }`}
            >
              Host Game
            </button>
          </div>

          <div>
            <h3 className="mb-5">Available Games</h3>
            {availableSessions.length === 0 ? (
              <p>No games available. Host one above!</p>
            ) : (
              <div className="flex flex-col gap-2">
                {availableSessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-slate-700 p-3 rounded flex justify-between items-center min-w-75"
                  >
                    <div>
                      <div>Game: <strong>{session.id}</strong></div>
                      <div>Players: {session.playerCount}/2</div>
                    </div>
                    <button
                      onClick={() => joinGame(session.id)}
                      disabled={!isConnected}
                      className={`px-4 py-2 border-none rounded text-white ${isConnected
                        ? 'bg-blue-500 hover:bg-blue-600 cursor-pointer'
                        : 'bg-gray-500 cursor-not-allowed'
                        }`}
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`mt-10 p-5 rounded ${isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}>
            Connection Status: {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
