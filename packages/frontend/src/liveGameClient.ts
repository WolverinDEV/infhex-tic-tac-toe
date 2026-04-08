import type {
    ClientToServerEvents,
    LobbyInfo,
    ServerToClientEvents,
    SessionId,
    SessionInfo,
} from '@ih3t/shared';
import { toast } from 'react-toastify';
import { io, type Socket } from 'socket.io-client';

import { APP_VERSION_HASH } from './appVersion';
import { useLiveGameStore } from './liveGameStore';
import { getDeviceId, getSocketUrl } from './query/apiClient';
import { queryClient } from './query/queryClient';
import { queryKeys } from './query/queryDefinitions';
import { buildSessionPath } from './routes/archiveRouteState';
import { playMatchStartSound } from './soundEffects';
import { useTournamentMultiviewStore } from './tournamentMultiviewStore';
import { sortLobbySessions } from './utils/lobby';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

let shouldHandleDisconnect = true;
let suppressDisconnectToast = false;

let heartbeatMonitor: number | null = null;
let heartbeatLastPingAt: number | null = null;
let heartbeatLastPongAt: number | null = null;

const HEARTBEAT_INTERVAL_MS = 250;
const HEARTBEAT_PING_INTERVAL_MS = 1_000;
const HEARTBEAT_UNSTABLE_AFTER_MS = 2_000;
const HEARTBEAT_RECONNECT_AFTER_MS = 10_000;

function showErrorToast(message: string) {
    toast.error(message, {
        toastId: `error:${message}`,
    });
}

function showAdminMessageToast(message: string, sentAt: number) {
    toast.info(message, {
        toastId: `admin-message:${sentAt}`,
        autoClose: 10_000,
    });
}

function showTournamentMessageToast(message: string, tournamentId: string, kind: string) {
    toast.info(message, {
        toastId: `tournament:${tournamentId}:${kind}:${message}`,
        autoClose: 6000,
    });
}

function navigateToSession(sessionId: string) {
    const sessionPath = buildSessionPath(sessionId);
    if (window.location.pathname === sessionPath) {
        return;
    }

    window.history.pushState(null, ``, sessionPath);
    window.dispatchEvent(new PopStateEvent(`popstate`));
}

function isVersionMismatchMessage(message: string) {
    return message.includes(`version hash`);
}

function clearHeartbeatState() {
    heartbeatLastPingAt = null;
    heartbeatLastPongAt = null;
    useLiveGameStore.getState().setConnectionUnstable(false);
}

function isHeartbeatActive() {
    if (!socket?.connected || typeof document === `undefined`) {
        return false;
    }

    const activeSession = useLiveGameStore.getState().session;
    return activeSession?.state.status === `in-game` && document.visibilityState === `visible`;
}

function reconnectAfterHeartbeatTimeout() {
    if (!socket) {
        return;
    }

    clearHeartbeatState();
    suppressDisconnectToast = true;
    socket.disconnect();
    socket.connect();
}

/**
 * Force-reconnect the socket so it picks up new auth cookies.
 * Call this after login/logout to ensure the socket identity matches the HTTP session.
 */
export function reconnectSocket() {
    if (!socket) {
        return;
    }

    suppressDisconnectToast = true;
    socket.disconnect();
    socket.connect();
}

function executeHeartbeat() {
    if (!isHeartbeatActive()) {
        clearHeartbeatState();
        return;
    }

    const now = Date.now();

    /* 50ms grace due to setInterval inaccuracy */
    if (now - (heartbeatLastPingAt ?? 0) >= HEARTBEAT_PING_INTERVAL_MS - 50) {
        socket?.emit(`client-ping`, {});
        heartbeatLastPingAt = now;
    }

    /*
     * If we just started pinging and never received any pong
     * assume a virtual "pong" right now.
     */
    heartbeatLastPongAt ??= now;

    const lastPongMs = now - heartbeatLastPongAt;

    useLiveGameStore.getState().setConnectionUnstable(lastPongMs >= HEARTBEAT_UNSTABLE_AFTER_MS);
    if (lastPongMs >= HEARTBEAT_RECONNECT_AFTER_MS) {
        reconnectAfterHeartbeatTimeout();
    }
}

function startHeartbeatMonitor() {
    if (heartbeatMonitor || typeof window === `undefined`) {
        return;
    }

    heartbeatMonitor = window.setInterval(executeHeartbeat, HEARTBEAT_INTERVAL_MS);
    window.addEventListener(`focus`, executeHeartbeat);
    window.addEventListener(`blur`, executeHeartbeat);
    document.addEventListener(`visibilitychange`, executeHeartbeat);
}

export function startLiveGameClient() {
    if (socket) {
        return;
    }

    const deviceId = getDeviceId();
    const socketUrl = getSocketUrl();
    shouldHandleDisconnect = true;
    socket = io(socketUrl, {
        auth: {
            deviceId,
            ephemeralClientId: crypto.randomUUID(),
            versionHash: APP_VERSION_HASH,
        },
        withCredentials: true,
        transports: [`websocket`],
    });

    socket.on(`connect_error`, (error) => {
        const message = error.message || `Failed to connect to the server.`;
        useLiveGameStore.getState().onSocketDisconnected();

        if (isVersionMismatchMessage(message)) {
            const activeSocket = socket;
            if (activeSocket) {
                activeSocket.io.opts.reconnection = false;
                activeSocket.disconnect();
            }
        }

        showErrorToast(message);
    });

    socket.on(`connect`, () => {
        clearHeartbeatState();
        useLiveGameStore.getState().onSocketConnected();
    });
    socket.on(`initialized`, () => useLiveGameStore.getState().onSocketInitialized());
    socket.on(`server-pong`, () => {
        heartbeatLastPongAt = Date.now();
    });

    socket.on(`lobby-list`, (lobbies) => {
        queryClient.setQueryData(
            queryKeys.availableSessions,
            sortLobbySessions(lobbies),
        );
    });

    socket.on(`lobby-updated`, (lobby) => {
        const lobbies: LobbyInfo[] | undefined = queryClient.getQueryData(queryKeys.availableSessions);
        if (!lobbies) {
            /* The lobbies query does not exist. No need to update the (non existing) data. */
            return;
        }

        const newLobbies = lobbies.filter(entry => entry.id !== lobby.id);
        newLobbies.push(lobby);

        queryClient.setQueryData(
            queryKeys.availableSessions,
            sortLobbySessions(newLobbies),
        );
    });

    socket.on(`lobby-removed`, ({ id }) => {
        const lobbies: LobbyInfo[] | undefined = queryClient.getQueryData(queryKeys.availableSessions);
        if (!lobbies) {
            /* The lobbies query does not exist. No need to update the (non existing) data. */
            return;
        }

        queryClient.setQueryData(
            queryKeys.availableSessions,
            sortLobbySessions(lobbies.filter(lobby => lobby.id !== id)),
        );
    });

    socket.on(`shutdown-updated`, (shutdown) => {
        queryClient.setQueryData(
            queryKeys.serverShutdown,
            shutdown,
        );
    });

    socket.on(`admin-message`, (broadcast) => {
        showAdminMessageToast(broadcast.message, broadcast.sentAt);
    });

    socket.on(`tournament-updated`, (event) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tournament(event.tournamentId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });

        // Nudge user to refresh if they're viewing this tournament
        if (window.location.pathname.includes(`/tournaments/${event.tournamentId}`)) {
            toast.info(`Tournament updated. Refreshing...`, { toastId: `tournament-refresh:${event.tournamentId}`, autoClose: 2000 });
        }
    });

    socket.on(`session-claim-win`, (event) => {
        useLiveGameStore.getState().handleClaimWinEvent(event);
    });

    socket.on(`tournament-notification`, (event) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tournament(event.tournamentId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
        showTournamentMessageToast(event.message, event.tournamentId, event.kind);
        if (event.kind === `match-ready` || event.kind === `tournament-started`) {
            playMatchStartSound();
        }
    });

    socket.on(`disconnect`, () => {
        clearHeartbeatState();
        if (!shouldHandleDisconnect) {
            return;
        }

        useLiveGameStore.getState().onSocketDisconnected();
        if (suppressDisconnectToast) {
            suppressDisconnectToast = false;
            return;
        }

        showErrorToast(`Disconnected from the server.`);
    });

    socket.on(`session-joined`, data => {
        queryClient.setQueryData(
            queryKeys.session(data.session.id),
            data.session,
        );
        useLiveGameStore.getState().setupSession(data);
        navigateToSession(data.session.id);
        executeHeartbeat();
    });

    socket.on(`session-updated`, data => {
        const multiviewStore = useTournamentMultiviewStore.getState();
        const watchedTile = multiviewStore.tilesBySessionId[data.sessionId] ?? null;

        queryClient.setQueryData(
            queryKeys.session(data.sessionId),
            (currentSession: SessionInfo | null | undefined) => currentSession
                ? {
                    ...currentSession,
                    ...data.session,
                    id: data.sessionId,
                }
                : currentSession ?? null,
        );
        useLiveGameStore.getState().handleSessionUpdate({ ...data.session, id: data.sessionId });
        multiviewStore.handleSessionUpdate(data);

        /* When a tournament session finishes, eagerly invalidate tournament queries
         * so the match card updates immediately instead of waiting for reconciliation. */
        if (data.session.state?.status === `finished`) {
            const store = useLiveGameStore.getState();
            if (store.session?.tournament || data.session.tournament || watchedTile?.session?.tournament) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
            }
        }
    });

    socket.on(`session-watch-started`, data => {
        queryClient.setQueryData(
            queryKeys.session(data.session.id),
            data.session,
        );
        useTournamentMultiviewStore.getState().handleWatchStarted(data);
    });

    socket.on(`session-watch-error`, data => {
        useTournamentMultiviewStore.getState().handleWatchError(data);
    });

    socket.on(`game-state`, data => {
        useLiveGameStore.getState().handleGameState(data);
        useTournamentMultiviewStore.getState().handleGameState(data);
    });
    socket.on(`game-cell-place`, data => {
        useLiveGameStore.getState().handleGameCellPlace(data);
        useTournamentMultiviewStore.getState().handleGameCellPlace(data);
    });

    socket.on(`session-chat`, data => useLiveGameStore.getState().handleSessionChatEvent(data));

    socket.on(`error`, (error: string) => {
        console.error(`Socket error:`, error);
        const currentState = useLiveGameStore.getState();
        const pendingJoin = currentState.pendingSessionJoin;

        if (pendingJoin.status === `pending` && pendingJoin.sessionId) {
            currentState.failJoiningSession(pendingJoin.sessionId, error);
            const isSessionRoute = window.location.pathname === `/session/${encodeURIComponent(pendingJoin.sessionId)}`;
            if (error === `Session not found` && isSessionRoute) {
                return;
            }
        }

        showErrorToast(error);
    });
}

export function stopLiveGameClient() {
    if (!socket) {
        return;
    }

    shouldHandleDisconnect = false;
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    suppressDisconnectToast = false;
    useLiveGameStore.getState().onSocketDisconnected();
}

export function joinSession(sessionId: SessionId) {
    const state = useLiveGameStore.getState();
    if (state.session?.id === sessionId) {
        return;
    }

    if (state.pendingSessionJoin.status === `pending` && state.pendingSessionJoin.sessionId === sessionId) {
        return;
    }

    state.startJoiningSession(sessionId);
    socket?.emit(`join-session`, {
        sessionId,
    });
}

export function watchSession(sessionId: SessionId) {
    socket?.emit(`watch-session`, {
        sessionId,
    });
}

export function unwatchSession(sessionId: SessionId) {
    socket?.emit(`unwatch-session`, {
        sessionId,
    });
}

export function leaveSession() {
    const state = useLiveGameStore.getState();
    if (state.session) {
        socket?.emit(`leave-session`, { sessionId: state.session.id });
    } else if (state.pendingSessionJoin.sessionId) {
        socket?.emit(`leave-session`, { sessionId: state.pendingSessionJoin.sessionId });
    }

    state.clearSession();
}

export function surrenderGame() {
    const state = useLiveGameStore.getState();
    if (!state.session || !socket) {
        return;
    }

    socket.emit(`surrender-session`, { sessionId: state.session.id });
}

export function requestSessionDraw() {
    const { session } = useLiveGameStore.getState();
    if (!session) {
        return;
    }

    socket?.emit(`request-session-draw`, { sessionId: session.id });
}

export function acceptSessionDraw() {
    const { session } = useLiveGameStore.getState();
    if (!session) {
        return;
    }

    socket?.emit(`accept-session-draw`, { sessionId: session.id });
}

export function declineSessionDraw() {
    const { session } = useLiveGameStore.getState();
    if (!session) {
        return;
    }

    socket?.emit(`decline-session-draw`, { sessionId: session.id });
}

export function returnToLobby() {
    const state = useLiveGameStore.getState();
    if (state.session) {
        socket?.emit(`leave-session`, { sessionId: state.session.id });
    }

    state.clearSession();
}

export function placeCell(x: number, y: number) {
    const { session } = useLiveGameStore.getState();
    if (!session) {
        return;
    }

    socket?.emit(`place-cell`, {
        sessionId: session.id,
        cell: { x, y }
    });
}

export function sendSessionChatMessage(message: string) {
    const { session } = useLiveGameStore.getState();
    if (!session) {
        return;
    }

    socket?.emit(`send-session-chat-message`, { sessionId: session.id, message });
}

export function requestRematch() {
    const { session } = useLiveGameStore.getState();
    if (!session) {
        return;
    }

    socket?.emit(`request-rematch`, { sessionId: session.id });
}

export function cancelRematch() {
    const { session } = useLiveGameStore.getState();
    if (!session) {
        return;
    }

    socket?.emit(`cancel-rematch`, { sessionId: session.id });
}

if (typeof window !== `undefined`) {
    /* 
     * Instantly connect to the server and do not wait until the first render.
     * This should speed up the initial connect process.
     */
    startLiveGameClient();

    /*
     * Start the heartbeat monitor regardless of if we're connected.
     * While disconnected, it will do nothing.
     */
    startHeartbeatMonitor();
}
