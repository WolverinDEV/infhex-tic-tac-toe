import {
    cloneGameState,
    createEmptyGameState,
    EventLobbyRemoved,
    EventLobbyUpdated,
    GameCellPlaceEvent,
    type GameState,
    GameStateEvent,
    type LobbyOptions,
    type PlayerConnection,
    PlayerRating,
    SessionChatEvent,
    type SessionChatMessage,
    SessionChatSenderId,
    type SessionFinishReason,
    type SessionInfo,
    type SessionPlayer,
    type SessionParticipantRole,
    type SessionTournamentInfo,
    SessionUpdatedEvent,
    SessionSpectator,
    SessionId,
    DRAW_REQUEST_MIN_TURNS,
} from '@ih3t/shared';
import { Mutex } from 'async-mutex';

import type { AccountUserProfile } from '../auth/authRepository';
import type { RequestClientInfo } from '../network/clientInfo';

export type ServerPlayerConnection = PlayerConnection & ({
    status: `connected`;
    socketId: string;
} | {
    status: `orphaned`;
    timeout: ReturnType<typeof setTimeout>;
} | {
    status: `disconnected`;
    timestamp: number;
});

export type ServerSessionPlayer = SessionPlayer & {
    deviceId: string

    // New players rating
    ratingAdjusted: PlayerRating | null,

    connection: ServerPlayerConnection
};

export type ServerSessionSpectator = SessionSpectator & {
    socketId: string | null,
};

export type ServerSessionParticipation =
    | {
        session: ServerGameSession,
        participant: ServerSessionPlayer,
        role: `player`,
    }
    | {
        session: ServerGameSession,
        participant: ServerSessionSpectator,
        role: `spectator`
    }

export type ServerGameSession = {
    id: SessionId;
    lock: Mutex,
    state: `lobby` | `in-game` | `finished`;

    hadPlayers: boolean,
    players: ServerSessionPlayer[];
    spectators: ServerSessionSpectator[];

    gameOptions: LobbyOptions;
    createdAt: number;
    startedAt: number | null;
    gameId: string;
    gameState: GameState;
    finishedAt: number | null;
    finishReason: SessionFinishReason | null;
    winningPlayerId: string | null;
    rematchAcceptedPlayerIds: string[];
    isRatedGame: boolean;
    reservedPlayerProfileIds: string[];
    tournament: SessionTournamentInfo | null;

    chatNames: Record<SessionChatSenderId, string>;
    chatMessages: SessionChatMessage[];

    drawRequest: string | null,
    drawRequestAvailableAfterTurn: number,
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
    reservedPlayerProfileIds?: string[];
    tournament?: SessionTournamentInfo | null;
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

export type SessionWatchSnapshot = {
    session: SessionInfo
    gameState: GameState
};

export function cloneGameOptions(gameOptions: LobbyOptions): LobbyOptions {
    return {
        ...gameOptions,
        timeControl: { ...gameOptions.timeControl },
    };
}

export function toPlayerConnection(connection: ServerPlayerConnection): PlayerConnection {
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

export function toSessionPlayer(player: ServerSessionPlayer): SessionPlayer {
    return {
        id: player.id,

        displayName: player.displayName,
        profileId: player.profileId,

        rating: player.rating,
        ratingAdjustment: player.ratingAdjustment,

        connection: toPlayerConnection(player.connection),
    };
}

export function toSessionSpectator(spectator: ServerSessionSpectator): SessionSpectator {
    return {
        id: spectator.id,
        displayName: spectator.displayName,
        profileId: spectator.profileId
    }
}

export function cloneStoredSessionParticipant(participant: ServerSessionPlayer): ServerSessionPlayer {
    return {
        ...participant,
        connection: { ...participant.connection },
    };
}

export function cloneStoredParticipants(participants: ServerSessionPlayer[]): ServerSessionPlayer[] {
    return participants.map((participant) => cloneStoredSessionParticipant(participant));
}

export function cloneGameBoard(boardState: GameState): GameState {
    return cloneGameState(boardState);
}

export function createGameSession(
    sessionId: SessionId,
    gameOptions: LobbyOptions,
    options: {
        reservedPlayerProfileIds?: string[];
        tournament?: SessionTournamentInfo | null;
    } = {},
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

        finishedAt: null,
        finishReason: null,
        winningPlayerId: null,
        rematchAcceptedPlayerIds: [],
        isRatedGame: false,
        reservedPlayerProfileIds: [
            ...(options.reservedPlayerProfileIds ?? []),
        ],
        tournament: options.tournament ? { ...options.tournament } : null,
        gameId: ``,
        gameState: createEmptyGameState(),

        chatNames: {},
        chatMessages: [],

        drawRequest: null,
        drawRequestAvailableAfterTurn: DRAW_REQUEST_MIN_TURNS,
    };
}
