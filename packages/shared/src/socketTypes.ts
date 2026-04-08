import { z } from 'zod';

import {
    zAdminBroadcastMessage,
    zBoardCell,
    zGameState,
    zHexCoordinate,
    zIdentifier,
    zLobbyInfo,
    zSessionChatMessage,
    zSessionChatMessageText,
    zSessionId,
    zSessionInfo,
    zSessionParticipantRole,
    type AdminBroadcastMessage,
    type LobbyInfo,
    type ShutdownState,
} from './sharedTypes';
import {
    zSessionClaimWinEvent,
    zTournamentNotificationEvent,
    zTournamentUpdatedEvent,
} from './tournaments';

export const zSessionChatMessageRequest = z.object({
    sessionId: zSessionId,
    message: zSessionChatMessageText,
});
export type SessionChatMessageRequest = z.infer<typeof zSessionChatMessageRequest>;

export const zJoinSessionRequest = z.object({
    sessionId: zSessionId,
    username: z.string().optional(),
});
export type JoinSessionRequest = z.infer<typeof zJoinSessionRequest>;

export const zWatchSessionRequest = z.object({
    sessionId: zSessionId,
});
export type WatchSessionRequest = z.infer<typeof zWatchSessionRequest>;

export const zClientPingRequest = z.object({});
export type ClientPingRequest = z.infer<typeof zClientPingRequest>;

export const zLeaveSessionRequest = z.object({
    sessionId: zSessionId,
});
export type LeaveSessionRequest = z.infer<typeof zLeaveSessionRequest>;

export const zSurrenderSessionRequest = z.object({
    sessionId: zSessionId,
});
export type SurrenderSessionRequest = z.infer<typeof zSurrenderSessionRequest>;

export const zRequestSessionDrawRequest = z.object({
    sessionId: zSessionId,
});
export type RequestSessionDrawRequest = z.infer<typeof zRequestSessionDrawRequest>;

export const zAcceptSessionDrawRequest = z.object({
    sessionId: zSessionId,
});
export type AcceptSessionDrawRequest = z.infer<typeof zAcceptSessionDrawRequest>;

export const zDeclineSessionDrawRequest = z.object({
    sessionId: zSessionId,
});
export type DeclineSessionDrawRequest = z.infer<typeof zDeclineSessionDrawRequest>;

export const zSessionJoinedEvent = z.object({
    session: zSessionInfo,
    gameState: zGameState,

    participantId: zIdentifier,
    participantRole: zSessionParticipantRole,
});
export type SessionJoinedEvent = z.infer<typeof zSessionJoinedEvent>;

export const zSessionUpdatedEvent = z.object({
    sessionId: zSessionId,
    session: zSessionInfo.partial(),
});
export type SessionUpdatedEvent = z.infer<typeof zSessionUpdatedEvent>;

export const zSessionWatchStartedEvent = z.object({
    session: zSessionInfo,
    gameState: zGameState,
});
export type SessionWatchStartedEvent = z.infer<typeof zSessionWatchStartedEvent>;

export const zSessionWatchErrorEvent = z.object({
    sessionId: zSessionId,
    message: z.string(),
});
export type SessionWatchErrorEvent = z.infer<typeof zSessionWatchErrorEvent>;

export const zSessionChatEvent = z.object({
    sessionId: zSessionId,
    message: zSessionChatMessage,
    senderDisplayName: z.string(),
});
export type SessionChatEvent = z.infer<typeof zSessionChatEvent>;

export const zGameStateEvent = z.object({
    sessionId: zSessionId,
    gameState: zGameState.partial(),
});
export type GameStateEvent = z.infer<typeof zGameStateEvent>;

export const zGameCellPlaceEvent = z.object({
    sessionId: zSessionId,
    state: zGameState.partial(),
    cell: zBoardCell,
});
export type GameCellPlaceEvent = z.infer<typeof zGameCellPlaceEvent>;

export const zPlaceCellRequest = z.object({
    sessionId: zSessionId,
    cell: zHexCoordinate,
});
export type PlaceCellRequest = z.infer<typeof zPlaceCellRequest>;

export const zRequestRematchRequest = z.object({
    sessionId: zSessionId,
});
export type RequestRematchRequest = z.infer<typeof zRequestRematchRequest>;

export const zCancelRematchRequest = z.object({
    sessionId: zSessionId,
});
export type CancelRematchRequest = z.infer<typeof zCancelRematchRequest>;

export const zEventLobbyUpdated = zLobbyInfo;
export type EventLobbyUpdated = z.infer<typeof zEventLobbyUpdated>;

export const zEventLobbyRemoved = z.object({ id: z.string() });
export type EventLobbyRemoved = z.infer<typeof zEventLobbyRemoved>;

export type ServerToClientEvents = {
    initialized: () => void;

    'lobby-list': (lobbies: LobbyInfo[]) => void;
    'lobby-updated': (event: EventLobbyUpdated) => void;
    'lobby-removed': (event: EventLobbyRemoved) => void;

    'shutdown-updated': (shutdown: ShutdownState | null) => void;
    'admin-message': (broadcast: AdminBroadcastMessage) => void;
    'server-pong': () => void;

    'session-joined': (data: SessionJoinedEvent) => void;
    'session-updated': (data: SessionUpdatedEvent) => void;
    'session-watch-started': (data: SessionWatchStartedEvent) => void;
    'session-watch-error': (data: SessionWatchErrorEvent) => void;
    'session-chat': (data: SessionChatEvent) => void;

    'game-state': (data: GameStateEvent) => void;
    'game-cell-place': (data: GameCellPlaceEvent) => void;
    'tournament-updated': (data: z.infer<typeof zTournamentUpdatedEvent>) => void;
    'tournament-notification': (data: z.infer<typeof zTournamentNotificationEvent>) => void;
    'session-claim-win': (data: z.infer<typeof zSessionClaimWinEvent>) => void;

    error: (error: string) => void;
};

export type ClientToServerEvents = {
    'client-ping': (request: ClientPingRequest) => void;
    'join-session': (request: JoinSessionRequest) => void;
    'watch-session': (request: WatchSessionRequest) => void;
    'unwatch-session': (request: WatchSessionRequest) => void;
    'leave-session': (request: LeaveSessionRequest) => void;
    'surrender-session': (request: SurrenderSessionRequest) => void;
    'request-session-draw': (request: RequestSessionDrawRequest) => void;
    'accept-session-draw': (request: AcceptSessionDrawRequest) => void;
    'decline-session-draw': (request: DeclineSessionDrawRequest) => void;
    'place-cell': (data: PlaceCellRequest) => void;
    'send-session-chat-message': (data: SessionChatMessageRequest) => void;
    'request-rematch': (request: RequestRematchRequest) => void;
    'cancel-rematch': (request: CancelRematchRequest) => void;
};

export const zSocketIOClientAuthPayload = z.object({
    deviceId: z.uuidv4(),
    ephemeralClientId: z.uuidv4(),
    versionHash: z.string().trim()
        .min(1),
});
export type SocketIOClientAuthPayload = z.infer<typeof zSocketIOClientAuthPayload>;
