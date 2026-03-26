import type {
    ClientToServerEvents,
    ServerToClientEvents
} from '@ih3t/shared'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'react-toastify'
import { APP_VERSION_HASH } from './appVersion'
import { useLiveGameStore } from './liveGameStore'
import { getDeviceId, getSocketUrl } from './query/apiClient'
import { queryClient } from './query/queryClient'
import { buildSessionPath } from './routes/archiveRouteState'
import { sortLobbySessions } from './utils/lobby'
import { queryKeys } from './query/queryDefinitions'

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
        transports: ["websocket"]
    })

    socket.on('connect_error', (error) => {
        const message = error.message || 'Failed to connect to the server.'
        useLiveGameStore.getState().onSocketDisconnected()

        if (isVersionMismatchMessage(message)) {
            const activeSocket = socket
            if (activeSocket) {
                activeSocket.io.opts.reconnection = false
                activeSocket.disconnect()
            }
        }

        showErrorToast(message)
    })

    socket.on('connect', () => useLiveGameStore.getState().onSocketConnected());
    socket.on('initialized', () => useLiveGameStore.getState().onSocketInitialized());

    socket.on('lobby-list', (lobbies) => {
        queryClient.setQueryData(
            queryKeys.availableSessions,
            sortLobbySessions(lobbies)
        )
    })

    socket.on('shutdown-updated', (shutdown) => {
        queryClient.setQueryData(
            queryKeys.serverShutdown,
            shutdown
        )
    })

    socket.on('admin-message', (broadcast) => {
        showAdminMessageToast(broadcast.message, broadcast.sentAt)
    })

    socket.on('disconnect', () => {
        if (!shouldHandleDisconnect) {
            return
        }

        useLiveGameStore.getState().onSocketDisconnected()
        showErrorToast('Disconnected from the server.')
    })

    socket.on('session-joined', data => {
        useLiveGameStore.getState().setupSession(data)
        navigateToSession(data.session.id)
    })

    socket.on('session-updated',
        data => useLiveGameStore.getState().handleSessionUpdate({ ...data.session, id: data.sessionId })
    )

    socket.on('game-state', data => useLiveGameStore.getState().handleGameState(data))
    socket.on('game-cell-place', data => useLiveGameStore.getState().handleGameCellPlace(data))

    socket.on('session-chat', data => useLiveGameStore.getState().handleSessionChatEvent(data))

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
    useLiveGameStore.getState().onSocketDisconnected()
}

export function joinSession(sessionId: string) {
    const state = useLiveGameStore.getState()
    if (state.session?.id === sessionId) {
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

export function leaveSession() {
    const state = useLiveGameStore.getState()
    if (state.session) {
        socket?.emit('leave-session', state.session.id)
    } else if (state.pendingSessionJoin.sessionId) {
        socket?.emit('leave-session', state.pendingSessionJoin.sessionId)
    }

    state.clearSession()
}

export function surrenderGame() {
    const state = useLiveGameStore.getState()
    if (!state.session || !socket) {
        return
    }

    socket.emit('surrender-session', state.session.id)
}

export function returnToLobby() {
    const state = useLiveGameStore.getState()
    if (state.session) {
        socket?.emit('leave-session', state.session.id)
    }

    state.clearSession()
}

export function placeCell(x: number, y: number) {
    const { session } = useLiveGameStore.getState()
    if (!session) {
        return
    }

    socket?.emit('place-cell', { x, y })
}

export function sendSessionChatMessage(message: string) {
    const { session } = useLiveGameStore.getState()
    if (!session) {
        return
    }

    socket?.emit('send-session-chat-message', { message })
}

export function requestRematch() {
    const { session } = useLiveGameStore.getState()
    if (!session) {
        return
    }

    socket?.emit('request-rematch', session.id)
}

export function cancelRematch() {
    const { session } = useLiveGameStore.getState()
    if (!session) {
        return
    }

    socket?.emit('cancel-rematch', session.id)
}

if (typeof window !== "undefined") {
    /* 
     * Instantly connect to the server and do not wait until the first render.
     * This should speed up the initial connect process.
     */
    startLiveGameClient();
}