import type {
    BoardState,
    GameMove,
    GameSession,
    SessionFinishReason,
    SessionInfo,
    SessionParticipantRole,
    SessionState,
} from '@ih3t/shared';
import type { RequestClientInfo, SocketClientInfo } from '../network/clientInfo';

export interface StoredGameSession extends GameSession {
    historyId: string;
    createdAt: number;
    startedAt: number | null;
    moveHistory: GameMove[];
}

export type PlayerLeaveSource = 'leave-session' | 'disconnect';

export interface PendingRematch {
    finishedSessionId: string;
    players: string[];
    availablePlayerIds: Set<string>;
    requestedPlayerIds: Set<string>;
    createdAt: number;
}

export interface PublicGameStatePayload {
    sessionId: string;
    sessionState: SessionState;
    gameState: BoardState;
}

export interface JoinSessionParams {
    sessionId: string;
    participantId: string;
    client: SocketClientInfo;
}

export interface JoinSessionResult {
    sessionId: string;
    state: SessionState;
    role: SessionParticipantRole;
    players: string[];
    isNewParticipant: boolean;
    gameState?: PublicGameStatePayload;
}

export interface CreateSessionParams {
    client: RequestClientInfo;
}

export interface PlayerLeftEvent {
    sessionId: string;
    playerId: string;
    players: string[];
    state: SessionState;
}

export interface PlayerJoinedEvent {
    sessionId: string;
    playerId: string;
    players: string[];
    state: SessionState;
}

export interface RematchUpdatedEvent {
    sessionId: string;
    playerIds: string[];
    canRematch: boolean;
    requestedPlayerIds: string[];
}

export interface SessionFinishedDomainEvent {
    sessionId: string;
    finishedGameId: string;
    reason: SessionFinishReason;
    winningPlayerId: string | null;
    canRematch: boolean;
}

export interface SessionManagerEventHandlers {
    sessionsUpdated?: (sessions: SessionInfo[]) => void;
    gameStateUpdated?: (payload: PublicGameStatePayload) => void;
    playerJoined?: (event: PlayerJoinedEvent) => void;
    playerLeft?: (event: PlayerLeftEvent) => void;
    rematchUpdated?: (event: RematchUpdatedEvent) => void;
    sessionFinished?: (event: SessionFinishedDomainEvent) => void;
}

export interface RematchRequestResult {
    status: 'pending' | 'ready';
    players: string[];
}

export interface RematchSessionResult {
    sessionId: string;
    state: SessionState;
    players: string[];
}
