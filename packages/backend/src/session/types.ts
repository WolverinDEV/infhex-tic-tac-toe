import {
    cloneGameState,
    createEmptyGameState,
    PlayerRating,
    type GameState,
    type LobbyInfo,
    type LobbyOptions,
    type ParticipantConnection,
    type SessionChatMessage,
    type SessionFinishReason,
    type SessionInfo,
    type SessionParticipant,
    type SessionParticipantRole,
} from '@ih3t/shared';
import type { RequestClientInfo } from '../network/clientInfo';
import type { AccountUserProfile } from '../auth/authRepository';

export type ServerParticipantConnection = ParticipantConnection & ({
    status: 'connected';
    socketId: string;
} | {
    status: 'orphaned';
    timeout: ReturnType<typeof setTimeout>;
} | {
    status: 'disconnected';
    timestamp: number;
});

export interface ServerSessionParticipant extends SessionParticipant {
    deviceId: string

    ratingAdjusted: PlayerRating | null,

    connection: ServerParticipantConnection
}

export type ServerSessionParticipation = {
    participant: ServerSessionParticipant,
    role: SessionParticipantRole,
}

export interface ServerGameSession {
    id: string;
    players: ServerSessionParticipant[];
    spectators: ServerSessionParticipant[];
    gameOptions: LobbyOptions;
    state: 'lobby' | 'in-game' | 'finished';
    createdAt: number;
    startedAt: number | null;
    gameId: string;
    gameState: GameState;
    finishReason: SessionFinishReason | null;
    winningPlayerId: string | null;
    rematchAcceptedPlayerIds: string[];
    chatMessages: SessionChatMessage[];
    isRatedGame: boolean;
}

export type PlayerLeaveSource = 'leave-session' | 'disconnect';

export interface PublicGameStatePayload {
    sessionId: string;
    gameId: string;
    gameState: GameState;
}

export interface JoinSessionParams {
    deviceId: string;

    profile: AccountUserProfile | null;
    displayName: string;
    allowSelfJoinCasualGames: boolean;
}

export interface CreateSessionParams {
    client: RequestClientInfo;
    lobbyOptions: LobbyOptions;
}

export interface ParticipantLeftEvent {
    sessionId: string;
    participantId: string;
    participantRole: SessionParticipantRole;
    session: SessionInfo;
}

export interface ParticipantJoinedEvent {
    sessionId: string;
    participantId: string;
    participantRole: SessionParticipantRole;
    session: SessionInfo;
}

export interface SessionUpdatedEvent {
    sessionId: string;
    session: SessionInfo;
}

export interface SessionManagerEventHandlers {
    lobbyListUpdated?: (lobbies: LobbyInfo[]) => void;
    sessionUpdated?: (event: SessionUpdatedEvent) => void;
    gameStateUpdated?: (payload: PublicGameStatePayload) => void;
    participantJoined?: (event: ParticipantJoinedEvent) => void;
    participantLeft?: (event: ParticipantLeftEvent) => void;
}

export interface RematchRequestResult {
    status: 'pending' | 'ready';
    players: string[];
    spectators: string[];
}

export type ClientGameParticipation = {
    session: SessionInfo
    gameState?: PublicGameStatePayload

    participantId: string
    participantRole: SessionParticipantRole
};

export function cloneGameOptions(gameOptions: LobbyOptions): LobbyOptions {
    return {
        ...gameOptions,
        timeControl: { ...gameOptions.timeControl }
    };
}

export function toPublicParticipantConnection(connection: ServerParticipantConnection): ParticipantConnection {
    return {
        status: connection.status
    };
}

export function cloneSessionParticipant(participant: ServerSessionParticipant): SessionParticipant {
    return {
        id: participant.id,

        displayName: participant.displayName,
        profileId: participant.profileId,

        rating: participant.rating,
        ratingAdjustment: participant.ratingAdjustment,

        connection: toPublicParticipantConnection(participant.connection)
    };
}

export function cloneParticipants(participants: ServerSessionParticipant[]): SessionParticipant[] {
    return participants.map((participant) => cloneSessionParticipant(participant));
}

export function cloneStoredSessionParticipant(participant: ServerSessionParticipant): ServerSessionParticipant {
    return {
        ...participant,
        connection: { ...participant.connection }
    };
}

export function cloneStoredParticipants(participants: ServerSessionParticipant[]): ServerSessionParticipant[] {
    return participants.map((participant) => cloneStoredSessionParticipant(participant));
}

export function cloneGameBoard(boardState: GameState): GameState {
    return cloneGameState(boardState);
}

export function createGameSession(
    sessionId: string,
    gameOptions: LobbyOptions,
): ServerGameSession {
    return {
        id: sessionId,
        state: 'lobby',

        createdAt: Date.now(),
        startedAt: null,

        players: [],
        spectators: [],

        gameOptions: cloneGameOptions(gameOptions),

        finishReason: null,
        winningPlayerId: null,
        rematchAcceptedPlayerIds: [],
        chatMessages: [],
        isRatedGame: false,

        gameId: '',
        gameState: createEmptyGameState(),
    };
}
