import type {
  ClientToServerEvents,
  CreateSessionResponse,
  ServerToClientEvents
} from '@ih3t/shared'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'react-toastify'
import { fetchJson, getDeviceId, getSocketUrl } from './apiClient'
import { getActiveSessionId, useLiveGameStore } from './liveGameStore'
import { queryClient } from './queryClient'
import { queryKeys, sortLobbySessions } from './queryHooks'

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
let shouldHandleDisconnect = true
const deviceId = getDeviceId()
const socketUrl = getSocketUrl()
const inviteSessionId = new URLSearchParams(window.location.search).get('join')
let inviteHandled = false

function showErrorToast(message: string) {
  toast.error(message, {
    toastId: `error:${message}`
  })
}

export function startLiveGameClient() {
  if (socket) {
    return
  }

  shouldHandleDisconnect = true
  socket = io(socketUrl, {
    auth: {
      deviceId
    },
    withCredentials: true
  })

  socket.on('connect', () => {
    useLiveGameStore.getState().setConnected()
    void fetchAvailableSessions()

    if (inviteSessionId && !inviteHandled) {
      inviteHandled = true
      joinGame(inviteSessionId)
      window.history.replaceState({}, '', window.location.pathname)
    }
  })

  socket.on('sessions-updated', (sessions) => {
    queryClient.setQueryData(
      queryKeys.availableSessions,
      sortLobbySessions(sessions.filter(session => session.state !== 'finished'))
    )
  })

  socket.on('shutdown-updated', (shutdown) => {
    useLiveGameStore.getState().setShutdownState(shutdown)
  })

  socket.on('disconnect', () => {
    if (!shouldHandleDisconnect) {
      return
    }

    useLiveGameStore.getState().setDisconnected()
    queryClient.setQueryData(queryKeys.availableSessions, [])
    showErrorToast('Disconnected from the server.')
  })

  socket.on('player-joined', data => {
    useLiveGameStore.getState().updatePlayers(data)
  })

  socket.on('session-joined', data => {
    useLiveGameStore.getState().joinSession(data)
  })

  socket.on('player-left', data => {
    useLiveGameStore.getState().updatePlayers(data)
  })

  socket.on('session-finished', data => {
    const currentState = useLiveGameStore.getState()
    if (getActiveSessionId(currentState.screen) !== data.sessionId) {
      return
    }

    currentState.finishSession(data)
    void queryClient.invalidateQueries({ queryKey: queryKeys.finishedGames })
  })

  socket.on('game-state', data => {
    const currentState = useLiveGameStore.getState()
    if (getActiveSessionId(currentState.screen) !== data.sessionId) {
      return
    }

    currentState.updateBoard(data)
  })

  socket.on('rematch-updated', data => {
    const currentState = useLiveGameStore.getState()
    if (getActiveSessionId(currentState.screen) !== data.sessionId) {
      return
    }

    currentState.updateRematch(data)
  })

  socket.on('error', (error: string) => {
    console.error('Socket error:', error)
    showErrorToast(error)
  })
}

export function stopLiveGameClient() {
  if (!socket) {
    return
  }

  shouldHandleDisconnect = false
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  useLiveGameStore.getState().setDisconnected()
}

export async function fetchAvailableSessions() {
  try {
    await queryClient.invalidateQueries({ queryKey: queryKeys.availableSessions })
  } catch (error) {
    console.error('Failed to fetch sessions:', error)
    showErrorToast('Failed to fetch available sessions.')
  }
}

export async function hostGame() {
  try {
    const data = await fetchJson<CreateSessionResponse>('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    socket?.emit('join-session', data.sessionId)
  } catch (error) {
    console.error('Failed to create session:', error)
    showErrorToast(error instanceof Error ? error.message : 'Failed to create a session.')
  }
}

export function joinGame(sessionId: string) {
  socket?.emit('join-session', sessionId)
}

export function leaveGame() {
  const state = useLiveGameStore.getState()
  const activeSessionId = getActiveSessionId(state.screen)
  if (!activeSessionId || !socket) {
    state.resetToLobby()
    return
  }

  socket.emit('leave-session', activeSessionId)
  state.resetToLobby()
  void fetchAvailableSessions()
}

export function returnToLobby() {
  cancelRematch()
  useLiveGameStore.getState().resetToLobby()
  void fetchAvailableSessions()
}

export function placeCell(x: number, y: number) {
  const activeSessionId = getActiveSessionId(useLiveGameStore.getState().screen)
  if (!activeSessionId) {
    return
  }

  socket?.emit('place-cell', { sessionId: activeSessionId, x, y })
}

export function requestRematch() {
  const activeSessionId = getActiveSessionId(useLiveGameStore.getState().screen)
  if (!activeSessionId) {
    return
  }

  socket?.emit('request-rematch', activeSessionId)
}

export function cancelRematch() {
  const activeSessionId = getActiveSessionId(useLiveGameStore.getState().screen)
  if (!activeSessionId) {
    return
  }

  socket?.emit('cancel-rematch', activeSessionId)
}
