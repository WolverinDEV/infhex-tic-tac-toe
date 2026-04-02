import { z } from 'zod';

import {
    zAdminBroadcastMessage,
    zBoardCell,
    zCoordinate,
    zGameState,
    zIdentifier,
    zLobbyInfo,
    zSessionChatMessage,
    zSessionChatMessageText,
    zSessionInfo,
    zSessionParticipantRole,
    zShutdownState,
    type AdminBroadcastMessage,
    type LobbyInfo,
    type ShutdownState,
} from './sharedTypes';

export const zSessionChatMessageRequest = z.object({
    message: zSessionChatMessageText,
});
export type SessionChatMessageRequest = z.infer<typeof zSessionChatMessageRequest>;

export const zJoinSessionRequest = z.object({
    sessionId: z.string().trim()
        .min(1),
    username: z.string().optional(),
});
export type JoinSessionRequest = z.infer<typeof zJoinSessionRequest>;

export const zSessionJoinedEvent = z.object({
    session: zSessionInfo,
    gameState: zGameState,

    participantId: zIdentifier,
    participantRole: zSessionParticipantRole,
});
export type SessionJoinedEvent = z.infer<typeof zSessionJoinedEvent>;

export const zSessionUpdatedEvent = z.object({
    sessionId: zIdentifier,
    session: zSessionInfo.partial(),
});
export type SessionUpdatedEvent = z.infer<typeof zSessionUpdatedEvent>;

export const zSessionChatEvent = z.object({
    sessionId: z.string(),
    message: zSessionChatMessage,
    senderDisplayName: z.string(),
});
export type SessionChatEvent = z.infer<typeof zSessionChatEvent>;

export const zGameStateEvent = z.object({
    sessionId: zIdentifier,
    gameState: zGameState.partial(),
});
export type GameStateEvent = z.infer<typeof zGameStateEvent>;

export const zGameCellPlaceEvent = z.object({
    sessionId: zIdentifier,
    state: zGameState.partial(),
    cell: zBoardCell,
});
export type GameCellPlaceEvent = z.infer<typeof zGameCellPlaceEvent>;

export const zPlaceCellRequest = z.object({
    x: zCoordinate,
    y: zCoordinate,
});
export type PlaceCellRequest = z.infer<typeof zPlaceCellRequest>;

export const zEventLobbyUpdated = zLobbyInfo;
export type EventLobbyUpdated = z.infer<typeof zEventLobbyUpdated>;

export const zEventLobbyRemoved = z.object({ id: z.string() });
export type EventLobbyRemoved = z.infer<typeof zEventLobbyRemoved>;

export const zServerToClientEvents = z.custom<{
    initialized: () => void;

    'lobby-list': (lobbies: LobbyInfo[]) => void;
    'lobby-updated': (event: EventLobbyUpdated) => void;
    'lobby-removed': (event: EventLobbyRemoved) => void;

    'shutdown-updated': (shutdown: ShutdownState | null) => void;
    'admin-message': (broadcast: AdminBroadcastMessage) => void;
    'server-pong': () => void;

    'session-joined': (data: SessionJoinedEvent) => void;
    'session-updated': (data: SessionUpdatedEvent) => void;
    'session-chat': (data: SessionChatEvent) => void;

    'game-state': (data: GameStateEvent) => void;
    'game-cell-place': (data: GameCellPlaceEvent) => void;

    error: (error: string) => void;
}>();
export type ServerToClientEvents = z.infer<typeof zServerToClientEvents>;

export const zClientToServerEvents = z.custom<{
    'client-ping': () => void;
    'join-session': (request: JoinSessionRequest) => void;
    'leave-session': (sessionId: string) => void;
    'surrender-session': (sessionId: string) => void;
    'request-session-draw': (sessionId: string) => void;
    'accept-session-draw': (sessionId: string) => void;
    'decline-session-draw': (sessionId: string) => void;
    'place-cell': (data: PlaceCellRequest) => void;
    'send-session-chat-message': (data: SessionChatMessageRequest) => void;
    'request-rematch': (sessionId: string) => void;
    'cancel-rematch': (sessionId: string) => void;
}>();
export type ClientToServerEvents = z.infer<typeof zClientToServerEvents>;

export const zSocketIOClientAuthPayload = z.object({
    deviceId: z.uuidv4(),
    ephemeralClientId: z.uuidv4(),
    versionHash: z.string().trim()
        .min(1),
});
export type SocketIOClientAuthPayload = z.infer<typeof zSocketIOClientAuthPayload>;
