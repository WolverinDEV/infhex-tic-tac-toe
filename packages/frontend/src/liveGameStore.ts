import type {
  BoardState,
  RematchUpdatedEvent,
  ServerToClientEvents,
  SessionFinishReason,
  SessionInfo,
  SessionParticipantRole,
  SessionState
} from '@ih3t/shared'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

type SessionJoinedPayload = Parameters<ServerToClientEvents['session-joined']>[0]
type PlayerPresencePayload = Parameters<ServerToClientEvents['player-joined']>[0]
type GameStatePayload = Parameters<ServerToClientEvents['game-state']>[0]
type SessionFinishedPayload = Parameters<ServerToClientEvents['session-finished']>[0]

type LiveGameScreenState =
  | { kind: 'lobby' }
  | {
    kind: 'waiting'
    sessionId: string
    players: string[]
    participantRole: SessionParticipantRole
    boardState: BoardState
  }
  | {
    kind: 'playing'
    sessionId: string
    players: string[]
    participantRole: SessionParticipantRole
    boardState: BoardState
  }
  | {
    kind: 'finished-player'
    sessionId: string
    players: string[]
    participantRole: 'player'
    boardState: BoardState
    result: 'winner' | 'loser'
    finishReason: SessionFinishReason
    finishedGameId: string | null
    rematch: {
      showAction: boolean
      canRematch: boolean
      requestedPlayerIds: string[]
    }
  }
  | {
    kind: 'finished-spectator'
    sessionId: string
    players: string[]
    participantRole: 'spectator'
    boardState: BoardState
    finishReason: SessionFinishReason
    finishedGameId: string | null
  }

interface LiveGameStoreState {
  connection: {
    isConnected: boolean
    currentPlayerId: string
  }
  availableSessions: SessionInfo[]
  screen: LiveGameScreenState
  setConnected: (currentPlayerId: string) => void
  setDisconnected: () => void
  syncAvailableSessions: (sessions: SessionInfo[]) => void
  joinSession: (payload: SessionJoinedPayload) => void
  updatePlayers: (payload: PlayerPresencePayload) => void
  updateBoard: (payload: GameStatePayload) => void
  finishSession: (payload: SessionFinishedPayload) => void
  updateRematch: (payload: RematchUpdatedEvent) => void
  resetToLobby: () => void
}

type ActiveLiveGameScreenState = Exclude<LiveGameScreenState, { kind: 'lobby' }>

function createEmptyBoardState(): BoardState {
  return {
    cells: [],
    currentTurnPlayerId: null,
    placementsRemaining: 0,
    currentTurnExpiresAt: null
  }
}

function cloneBoardState(boardState: BoardState): BoardState {
  return {
    ...boardState,
    cells: boardState.cells.map(cell => ({ ...cell }))
  }
}

function isActiveLiveGameScreenState(screen: LiveGameScreenState): screen is ActiveLiveGameScreenState {
  return screen.kind !== 'lobby'
}

function isFinishedScreenState(
  screen: ActiveLiveGameScreenState
): screen is Extract<LiveGameScreenState, { kind: 'finished-player' | 'finished-spectator' }> {
  return screen.kind === 'finished-player' || screen.kind === 'finished-spectator'
}

function toPlayableSessionState(state: SessionState): 'lobby' | 'ingame' {
  return state === 'ingame' ? 'ingame' : 'lobby'
}

function createLiveSessionScreenState(params: {
  sessionId: string
  sessionState: SessionState
  participantRole: SessionParticipantRole
  players: string[]
  boardState: BoardState
}): Extract<LiveGameScreenState, { kind: 'waiting' | 'playing' }> {
  return {
    kind: toPlayableSessionState(params.sessionState) === 'ingame' ? 'playing' : 'waiting',
    sessionId: params.sessionId,
    participantRole: params.participantRole,
    players: [...params.players],
    boardState: cloneBoardState(params.boardState)
  }
}

export function getActiveSessionId(screen: LiveGameScreenState): string | null {
  return isActiveLiveGameScreenState(screen) ? screen.sessionId : null
}

export const useLiveGameStore = create<LiveGameStoreState>()(
  immer((set) => ({
    connection: {
      isConnected: false,
      currentPlayerId: ''
    },
    availableSessions: [],
    screen: { kind: 'lobby' },
    setConnected: (currentPlayerId) =>
      set((state) => {
        state.connection.isConnected = true
        state.connection.currentPlayerId = currentPlayerId
      }),
    setDisconnected: () =>
      set((state) => {
        state.connection.isConnected = false
        state.connection.currentPlayerId = ''
        state.availableSessions = []
        state.screen = { kind: 'lobby' }
      }),
    syncAvailableSessions: (sessions) =>
      set((state) => {
        state.availableSessions = sessions.filter(session => session.canJoin)
      }),
    joinSession: (payload) =>
      set((state) => {
        state.screen = createLiveSessionScreenState({
          sessionId: payload.sessionId,
          sessionState: payload.state,
          participantRole: payload.role,
          players: payload.players,
          boardState: createEmptyBoardState()
        })
      }),
    updatePlayers: (payload) =>
      set((state) => {
        const currentScreen = state.screen
        if (!isActiveLiveGameScreenState(currentScreen) || isFinishedScreenState(currentScreen)) {
          return
        }

        state.screen = createLiveSessionScreenState({
          sessionId: currentScreen.sessionId,
          sessionState: payload.state,
          participantRole: currentScreen.participantRole,
          players: payload.players,
          boardState: currentScreen.boardState
        })
      }),
    updateBoard: (payload) =>
      set((state) => {
        const currentScreen = state.screen
        if (
          !isActiveLiveGameScreenState(currentScreen) ||
          isFinishedScreenState(currentScreen) ||
          currentScreen.sessionId !== payload.sessionId
        ) {
          return
        }

        state.screen = createLiveSessionScreenState({
          sessionId: currentScreen.sessionId,
          sessionState: payload.sessionState,
          participantRole: currentScreen.participantRole,
          players: currentScreen.players,
          boardState: payload.gameState
        })
      }),
    finishSession: (payload) =>
      set((state) => {
        const currentScreen = state.screen
        if (!isActiveLiveGameScreenState(currentScreen) || currentScreen.sessionId !== payload.sessionId) {
          return
        }

        if (currentScreen.participantRole === 'spectator') {
          state.screen = {
            kind: 'finished-spectator',
            sessionId: currentScreen.sessionId,
            players: [...currentScreen.players],
            participantRole: 'spectator',
            boardState: cloneBoardState(currentScreen.boardState),
            finishReason: payload.reason,
            finishedGameId: payload.finishedGameId
          }
          return
        }

        state.screen = {
          kind: 'finished-player',
          sessionId: currentScreen.sessionId,
          players: [...currentScreen.players],
          participantRole: 'player',
          boardState: cloneBoardState(currentScreen.boardState),
          result: payload.winningPlayerId === state.connection.currentPlayerId ? 'winner' : 'loser',
          finishReason: payload.reason,
          finishedGameId: payload.finishedGameId,
          rematch: {
            showAction: payload.canRematch,
            canRematch: payload.canRematch,
            requestedPlayerIds: []
          }
        }
      }),
    updateRematch: (payload) =>
      set((state) => {
        if (state.screen.kind !== 'finished-player' || state.screen.sessionId !== payload.sessionId) {
          return
        }

        state.screen.rematch.showAction = true
        state.screen.rematch.canRematch = payload.canRematch
        state.screen.rematch.requestedPlayerIds = [...payload.requestedPlayerIds]
      }),
    resetToLobby: () =>
      set((state) => {
        state.screen = { kind: 'lobby' }
      })
  }))
)
