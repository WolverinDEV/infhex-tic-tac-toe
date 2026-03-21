import type {
  GameBoard,
  ServerToClientEvents,
  SessionInfo,
  ShutdownState
} from '@ih3t/shared'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

type SessionJoinedPayload = Parameters<ServerToClientEvents['session-joined']>[0]
type SessionUpdatedPayload = Parameters<ServerToClientEvents['session-updated']>[0]
type GameStatePayload = Parameters<ServerToClientEvents['game-state']>[0]

type ActiveGameState = {
  gameId: string
  gameState: GameBoard
}

type SessionScreen =
  | { kind: 'none' }
  | {
    kind: 'session'
    sessionId: string
    session: SessionInfo
    game: ActiveGameState | null
  }

type PendingSessionJoinState =
  | { status: 'idle'; sessionId: null; errorMessage: null }
  | { status: 'pending'; sessionId: string; errorMessage: null }
  | { status: 'not-found'; sessionId: string; errorMessage: string }
  | { status: 'failed'; sessionId: string; errorMessage: string }

interface LiveGameStoreState {
  connection: {
    isConnected: boolean
    isInitialized: boolean
    currentPlayerId: string
  }
  shutdown: ShutdownState | null
  screen: SessionScreen
  pendingSessionJoin: PendingSessionJoinState
  setConnected: () => void
  setInitialized: () => void
  setDisconnected: () => void
  setShutdownState: (shutdown: ShutdownState | null) => void
  startJoiningSession: (sessionId: string) => void
  failJoiningSession: (sessionId: string, errorMessage: string) => void
  setupSession: (payload: SessionJoinedPayload) => void
  updateSession: (payload: SessionUpdatedPayload) => void
  updateBoard: (payload: GameStatePayload) => void
  resetToLobby: () => void
}

function createEmptyGameBoard(): GameBoard {
  return {
    cells: [],
    currentTurnPlayerId: null,
    placementsRemaining: 0,
    currentTurnExpiresAt: null,
    playerTimeRemainingMs: {}
  }
}

function cloneGameBoard(gameState: GameBoard): GameBoard {
  return {
    ...gameState,
    cells: gameState.cells.map(cell => ({ ...cell })),
    playerTimeRemainingMs: { ...gameState.playerTimeRemainingMs }
  }
}

function cloneSessionInfo(session: SessionInfo): SessionInfo {
  const base = {
    ...session,
    players: session.players.map(player => ({ ...player })),
    spectators: session.spectators.map(spectator => ({ ...spectator })),
    gameOptions: {
      ...session.gameOptions,
      timeControl: { ...session.gameOptions.timeControl }
    }
  }

  if (session.state === 'finished') {
    return {
      ...base,
      state: 'finished',
      gameId: session.gameId,
      finishReason: session.finishReason,
      winningPlayerId: session.winningPlayerId,
      rematchAcceptedPlayerIds: [...session.rematchAcceptedPlayerIds]
    }
  }

  if (session.state === 'in-game') {
    return {
      ...base,
      state: 'in-game',
      startedAt: session.startedAt,
      gameId: session.gameId
    }
  }

  return {
    ...base,
    state: 'lobby'
  }
}

function deriveGameState(session: SessionInfo): ActiveGameState | null {
  if (session.state === 'lobby') {
    return null
  }

  return {
    gameId: session.gameId,
    gameState: createEmptyGameBoard()
  }
}

export function getActiveSessionId(screen: SessionScreen): string | null {
  return screen.kind === 'session' ? screen.sessionId : null
}

export const useLiveGameStore = create<LiveGameStoreState>()(
  immer((set) => ({
    connection: {
      isConnected: false,
      isInitialized: false,
      currentPlayerId: ''
    },
    shutdown: null,
    screen: { kind: 'none' },
    pendingSessionJoin: { status: 'idle', sessionId: null, errorMessage: null },
    setConnected: () =>
      set((state) => {
        state.connection.isConnected = true
        state.connection.isInitialized = false
      }),
    setInitialized: () => set(state => { state.connection.isInitialized = true }),
    setDisconnected: () =>
      set((state) => {
        state.connection.isConnected = false
        state.connection.isInitialized = false
        state.connection.currentPlayerId = ''
        state.shutdown = null
        state.screen = { kind: 'none' }
        state.pendingSessionJoin = { status: 'idle', sessionId: null, errorMessage: null }
      }),
    setShutdownState: (shutdown) =>
      set((state) => {
        state.shutdown = shutdown ? { ...shutdown } : null
      }),
    startJoiningSession: (sessionId) =>
      set((state) => {
        state.pendingSessionJoin = {
          status: 'pending',
          sessionId,
          errorMessage: null
        }
      }),
    failJoiningSession: (sessionId, errorMessage) =>
      set((state) => {
        if (state.pendingSessionJoin.sessionId !== sessionId) {
          return
        }

        state.pendingSessionJoin = {
          status: errorMessage === 'Session not found' ? 'not-found' : 'failed',
          sessionId,
          errorMessage
        }
      }),
    setupSession: (payload) =>
      set((state) => {
        const session = cloneSessionInfo(payload.session)
        state.pendingSessionJoin = { status: 'idle', sessionId: null, errorMessage: null }
        state.connection.currentPlayerId = payload.participantId
        state.screen = {
          kind: 'session',
          sessionId: payload.sessionId,
          session,
          game: deriveGameState(session)
        }
      }),
    updateSession: (payload) =>
      set((state) => {
        if (state.screen.kind !== 'session' || state.screen.sessionId !== payload.sessionId) {
          return
        }

        const nextSession = cloneSessionInfo(payload.session)
        state.screen.session = nextSession

        if (nextSession.state === 'lobby') {
          state.screen.game = null
          return
        }

        if (!state.screen.game || state.screen.game.gameId !== nextSession.gameId) {
          state.screen.game = {
            gameId: nextSession.gameId,
            gameState: createEmptyGameBoard()
          }
        }
      }),
    updateBoard: (payload) =>
      set((state) => {
        if (state.screen.kind !== 'session' || state.screen.sessionId !== payload.sessionId) {
          return
        }

        state.screen.game = {
          gameId: payload.gameId,
          gameState: cloneGameBoard(payload.gameState)
        }
      }),
    resetToLobby: () =>
      set((state) => {
        state.pendingSessionJoin = { status: 'idle', sessionId: null, errorMessage: null }
        state.screen = { kind: 'none' }
      })
  }))
)
