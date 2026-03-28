import {
    AccountBot,
    cloneGameState,
    createEmptyGameState,
    EventLobbyRemoved,
    EventLobbyUpdated,
    GameCellPlaceEvent,
    type GameState,
    GameStateEvent,
    type LobbyOptions,
    type ParticipantConnection,
    PlayerRating,
    SessionChatEvent,
    type SessionChatMessage,
    SessionChatSenderId,
    type SessionFinishReason,
    type SessionInfo,
    type SessionParticipant,
    type SessionParticipantRole,
    SessionUpdatedEvent,
} from '@ih3t/shared';
import { Mutex } from 'async-mutex';

import type { AccountUserProfile } from '../auth/authRepository';
import type { RequestClientInfo } from '../network/clientInfo';

export type ServerParticipantConnection = ParticipantConnection & ({
    status: `connected`;
    socketId: string;
} | {
    status: `orphaned`;
    timeout: ReturnType<typeof setTimeout>;
} | {
    status: `disconnected`;
    timestamp: number;
});

export type ServerSessionParticipant = {
    deviceId: string

    ratingAdjusted: PlayerRating | null,

    connection: ServerParticipantConnection
} & SessionParticipant;

export type ServerSessionParticipation = {
    participant: ServerSessionParticipant,
    role: SessionParticipantRole,
};

export type ServerGameSession = {
    id: string;
    lock: Mutex,
    state: `lobby` | `in-game` | `finished`;

    hadPlayers: boolean,
    players: ServerSessionParticipant[];
    spectators: ServerSessionParticipant[];

    gameOptions: LobbyOptions;
    createdAt: number;
    startedAt: number | null;
    gameId: string;
    gameState: GameState;
    finishReason: SessionFinishReason | null;
    winningPlayerId: string | null;
    rematchAcceptedPlayerIds: string[];
    isRatedGame: boolean;

    chatNames: Record<SessionChatSenderId, string>;
    chatMessages: SessionChatMessage[];
};

export type PlayerLeaveSource = `leave-session` | `disconnect`;

export type JoinSessionParams = {
    deviceId: string;

    profile: AccountUserProfile | null;
    displayName: string;
    allowSelfJoinCasualGames: boolean;
};

export type CreateSessionParams = {
    client: RequestClientInfo;
    lobbyOptions: LobbyOptions;
    bots?: AccountBot[];
};

export type ParticipantLeftEvent = {
    sessionId: string;
    participantId: string;
    participantRole: SessionParticipantRole;
    session: SessionInfo;
};

export type ParticipantJoinedEvent = {
    sessionId: string;
    participantId: string;
    participantRole: SessionParticipantRole;
    session: SessionInfo;
};

export type SessionManagerEventHandlers = {
    lobbyUpdated?: (lobby: EventLobbyUpdated) => void,
    lobbyRemoved?: (event: EventLobbyRemoved) => void;

    sessionUpdated?: (event: SessionUpdatedEvent) => void;
    sessionChat?: (event: SessionChatEvent) => void;
    gameStateUpdated?: (payload: GameStateEvent) => void;
    gameCellPlacement?: (payload: GameCellPlaceEvent) => void,
};

export type RematchRequestResult = {
    status: `pending` | `ready`;
    players: string[];
    spectators: string[];
};

export type ClientGameParticipation = {
    session: SessionInfo
    gameState: GameState

    participantId: string
    participantRole: SessionParticipantRole
};

export function cloneGameOptions(gameOptions: LobbyOptions): LobbyOptions {
    return {
        ...gameOptions,
        timeControl: { ...gameOptions.timeControl },
    };
}

export function toPublicParticipantConnection(connection: ServerParticipantConnection): ParticipantConnection {
    return {
        status: connection.status,
    };
}

export function cloneChatMessage(message: SessionChatMessage): SessionChatMessage {
    return {
        id: message.id,

        senderId: message.senderId,
        sentAt: message.sentAt,

        message: message.message,
    };
}

export function cloneSessionParticipant(participant: ServerSessionParticipant): SessionParticipant {
    return {
        id: participant.id,

        displayName: participant.displayName,
        profileId: participant.profileId,
        isBot: participant.isBot,
        botId: participant.botId,
        botOwnerProfileId: participant.botOwnerProfileId,

        rating: participant.rating,
        ratingAdjustment: participant.ratingAdjustment,

        connection: toPublicParticipantConnection(participant.connection),
    };
}

export function cloneParticipants(participants: ServerSessionParticipant[]): SessionParticipant[] {
    return participants.map((participant) => cloneSessionParticipant(participant));
}

export function cloneStoredSessionParticipant(participant: ServerSessionParticipant): ServerSessionParticipant {
    return {
        ...participant,
        connection: { ...participant.connection },
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
        lock: new Mutex(),

        state: `lobby`,

        createdAt: Date.now(),
        startedAt: null,

        hadPlayers: false,
        players: [],
        spectators: [],

        gameOptions: cloneGameOptions(gameOptions),

        finishReason: null,
        winningPlayerId: null,
        rematchAcceptedPlayerIds: [],
        isRatedGame: false,

        gameId: ``,
        gameState: createEmptyGameState(),

        chatNames: {},
        chatMessages: [],
    };
}
