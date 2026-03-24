import type {
  ClientToServerEvents,
  ServerToClientEvents
} from '@ih3t/shared'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'react-toastify'
import { APP_VERSION_HASH } from './appVersion'
import { getActiveSessionId, useLiveGameStore } from './liveGameStore'
import { invalidateFinishedGames } from './query/finishedGamesClient'
import { getDeviceId, getSocketUrl } from './query/apiClient'
import { queryClient } from './query/queryClient'
import { buildSessionPath } from './routes/archiveRouteState'
import { sortLobbySessions } from './utils/lobby'
import { queryKeys } from './query/queryDefinitions'
import { EarlyWebSocket } from './earlySocketTransport'

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null
let shouldHandleDisconnect = true

function showErrorToast(message: string) {
  toast.error(message, {
    toastId: `error:${message}`
  })
}

function showAdminMessageToast(message: string, sentAt: number) {
  toast.info(message, {
    toastId: `admin-message:${sentAt}`,
    autoClose: 10_000
  })
}

function navigateToSession(sessionId: string) {
  const sessionPath = buildSessionPath(sessionId)
  if (window.location.pathname === sessionPath) {
    return
  }

  window.history.pushState(null, '', sessionPath)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function isVersionMismatchMessage(message: string) {
  return message.includes('version hash')
}

export function startLiveGameClient() {
  if (socket) {
    return
  }

  const deviceId = getDeviceId()
  const socketUrl = getSocketUrl()
  shouldHandleDisconnect = true
  socket = io(socketUrl, {
    auth: {
      deviceId,
      ephemeralClientId: crypto.randomUUID(),
      versionHash: APP_VERSION_HASH
    },
    withCredentials: true,
    transports: [EarlyWebSocket],
  })

  socket.on('connect_error', (error) => {
    const message = error.message || 'Failed to connect to the server.'
    useLiveGameStore.getState().setDisconnected()

    if (isVersionMismatchMessage(message)) {
      const activeSocket = socket
      if (activeSocket) {
        activeSocket.io.opts.reconnection = false
        activeSocket.disconnect()
      }
    }

    showErrorToast(message)
  })

  socket.on('connect', () => {
    useLiveGameStore.getState().setConnected()
  })

  socket.on('initialized', () => {
    useLiveGameStore.getState().setInitialized()
  });

  socket.on('lobby-list', (lobbies) => {
    queryClient.setQueryData(
      queryKeys.availableSessions,
      sortLobbySessions(lobbies)
    )
  })

  socket.on('shutdown-updated', (shutdown) => {
    useLiveGameStore.getState().setShutdownState(shutdown)
  })

  socket.on('admin-message', (broadcast) => {
    showAdminMessageToast(broadcast.message, broadcast.sentAt)
  })

  socket.on('disconnect', () => {
    if (!shouldHandleDisconnect) {
      return
    }

    useLiveGameStore.getState().setDisconnected()
    showErrorToast('Disconnected from the server.')
  })

  socket.on('session-joined', data => {
    useLiveGameStore.getState().setupSession(data)
    navigateToSession(data.sessionId)
  })

  socket.on('session-updated', data => {
    const currentState = useLiveGameStore.getState()
    if (getActiveSessionId(currentState.screen) !== data.sessionId) {
      return
    }

    currentState.updateSession(data)
    if (data.session.state === 'finished') {
      void invalidateFinishedGames()
    }
  })

  socket.on('game-state', data => {
    const currentState = useLiveGameStore.getState()
    if (getActiveSessionId(currentState.screen) !== data.sessionId) {
      return
    }

    currentState.updateBoard(data)
  })

  socket.on('participant-joined', data => {
    useLiveGameStore.getState().updateSession({
      sessionId: data.sessionId,
      session: data.session
    })
  })

  socket.on('participant-left', data => {
    useLiveGameStore.getState().updateSession({
      sessionId: data.sessionId,
      session: data.session
    })
  })

  socket.on('error', (error: string) => {
    console.error('Socket error:', error)
    const currentState = useLiveGameStore.getState()
    const pendingJoin = currentState.pendingSessionJoin

    if (pendingJoin.status === 'pending' && pendingJoin.sessionId) {
      currentState.failJoiningSession(pendingJoin.sessionId, error)
      const isSessionRoute = window.location.pathname === `/session/${encodeURIComponent(pendingJoin.sessionId)}`
      if (error === 'Session not found' && isSessionRoute) {
        return
      }
    }

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

export function joinGame(sessionId: string) {
  const state = useLiveGameStore.getState()
  const activeSessionId = getActiveSessionId(state.screen)
  if (activeSessionId === sessionId) {
    return
  }

  if (state.pendingSessionJoin.status === 'pending' && state.pendingSessionJoin.sessionId === sessionId) {
    return
  }

  state.startJoiningSession(sessionId)
  socket?.emit('join-session', {
    sessionId
  })
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
}

export function surrenderGame() {
  const state = useLiveGameStore.getState()
  const activeSessionId = getActiveSessionId(state.screen)
  if (!activeSessionId || !socket) {
    state.resetToLobby()
    return
  }

  socket.emit('surrender-session', activeSessionId)
}

export function returnToLobby() {
  const state = useLiveGameStore.getState()
  const activeSessionId = getActiveSessionId(state.screen)
  if (activeSessionId) {
    socket?.emit('leave-session', activeSessionId)
  }

  state.resetToLobby()
}

export function placeCell(x: number, y: number) {
  const activeSessionId = getActiveSessionId(useLiveGameStore.getState().screen)
  if (!activeSessionId) {
    return
  }

  socket?.emit('place-cell', { x, y })
}

export function sendSessionChatMessage(message: string) {
  const activeSessionId = getActiveSessionId(useLiveGameStore.getState().screen)
  if (!activeSessionId) {
    return
  }

  socket?.emit('send-session-chat-message', { message })
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
