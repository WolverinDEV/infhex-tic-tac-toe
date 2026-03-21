import { z } from 'zod';

export const DUMMY = 'Hello?';
export const PLACE_CELL_HEX_RADIUS = 8;

export interface HexCoordinate {
    x: number;
    y: number;
}

const zTimestamp = z.number().int();
const zCoordinate = z.number().int();
const zIdentifier = z.string();

export const zUserRole = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof zUserRole>;

export const zSessionState = z.enum(['lobby', 'in-game', 'finished']);
export type SessionState = z.infer<typeof zSessionState>;

export const zSessionParticipantRole = z.enum(['player', 'spectator']);
export type SessionParticipantRole = z.infer<typeof zSessionParticipantRole>;

export const zParticipantConnection = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('connected')
    }),
    z.object({
        status: z.literal('orphaned')
    })
]);
export type ParticipantConnection = z.infer<typeof zParticipantConnection>;

export const zCellOccupant = z.string().brand<'CellOccupant'>();
export type CellOccupant = z.infer<typeof zCellOccupant>;

export const zSessionFinishReason = z.enum(['disconnect', 'surrender', 'timeout', 'terminated', 'six-in-a-row']);
export type SessionFinishReason = z.infer<typeof zSessionFinishReason>;

export const zLobbyVisibility = z.enum(['public', 'private']);
export type LobbyVisibility = z.infer<typeof zLobbyVisibility>;

export const zPlayerNames = z.record(z.string(), z.string());
export type PlayerNames = z.infer<typeof zPlayerNames>;

export const zPlayerProfileIds = z.record(z.string(), z.string().nullable());
export type PlayerProfileIds = z.infer<typeof zPlayerProfileIds>;

export const zGameTimeControl = z.union([
    z.object({
        mode: z.literal('unlimited')
    }),
    z.object({
        mode: z.literal('turn'),
        turnTimeMs: z.number().int().nonnegative()
    }),
    z.object({
        mode: z.literal('match'),
        mainTimeMs: z.number().int().nonnegative(),
        incrementMs: z.number().int().nonnegative()
    })
]);
export type GameTimeControl = z.infer<typeof zGameTimeControl>;

export const zLobbyOptions = z.object({
    visibility: zLobbyVisibility,
    timeControl: zGameTimeControl
});
export type LobbyOptions = z.infer<typeof zLobbyOptions>;

export const DEFAULT_LOBBY_OPTIONS: LobbyOptions = zLobbyOptions.parse({
    visibility: 'public',
    timeControl: {
        mode: 'turn',
        turnTimeMs: 45_000
    }
});

export const zShutdownState = z.object({
    scheduledAt: zTimestamp,
    shutdownAt: zTimestamp
});
export type ShutdownState = z.infer<typeof zShutdownState>;

export const zAdminScheduleShutdownRequest = z.object({
    delayMinutes: z.number().int().min(1).max(24 * 60)
});
export type AdminScheduleShutdownRequest = z.infer<typeof zAdminScheduleShutdownRequest>;

export const zAdminShutdownControlResponse = z.object({
    shutdown: zShutdownState.nullable()
});
export type AdminShutdownControlResponse = z.infer<typeof zAdminShutdownControlResponse>;

export const zAdminBroadcastMessage = z.object({
    message: z.string().trim().min(1).max(280),
    sentAt: zTimestamp
});
export type AdminBroadcastMessage = z.infer<typeof zAdminBroadcastMessage>;

export const zAdminBroadcastMessageRequest = z.object({
    message: z.string().trim().min(1).max(280)
});
export type AdminBroadcastMessageRequest = z.infer<typeof zAdminBroadcastMessageRequest>;

export const zAdminBroadcastMessageResponse = z.object({
    broadcast: zAdminBroadcastMessage
});
export type AdminBroadcastMessageResponse = z.infer<typeof zAdminBroadcastMessageResponse>;

export const zBoardCell = z.object({
    x: zCoordinate,
    y: zCoordinate,
    occupiedBy: zCellOccupant
});
export type BoardCell = z.infer<typeof zBoardCell>;

export function getCellKey(x: number, y: number): string {
    return `${x},${y}`;
}

export function getHexDistance(a: HexCoordinate, b: HexCoordinate): number {
    return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs((a.x + a.y) - (b.x + b.y))) / 2;
}

export function isCellWithinPlacementRadius(
    placedCells: readonly HexCoordinate[],
    candidate: HexCoordinate,
    radius = PLACE_CELL_HEX_RADIUS
): boolean {
    if (placedCells.length === 0) {
        return true;
    }

    return placedCells.some((cell) => getHexDistance(cell, candidate) <= radius);
}

export const zGameBoard = z.object({
    cells: z.array(zBoardCell),
    currentTurnPlayerId: zIdentifier.nullable(),
    placementsRemaining: z.number().int().nonnegative(),
    currentTurnExpiresAt: zTimestamp.nullable(),
    playerTimeRemainingMs: z.record(z.string(), z.number().int().nonnegative())
});
export type GameBoard = z.infer<typeof zGameBoard>;

export const zBoardState = zGameBoard;
export type BoardState = GameBoard;

export const zSessionParticipant = z.object({
    id: zIdentifier,
    displayName: z.string(),
    profileId: zIdentifier.nullable(),
    connection: zParticipantConnection
});
export type SessionParticipant = z.infer<typeof zSessionParticipant>;

export const zLobbyInfo = z.object({
    id: zIdentifier,
    playerNames: z.array(z.string()),
    timeControl: zGameTimeControl,
    startedAt: zTimestamp.nullable()
});
export type LobbyInfo = z.infer<typeof zLobbyInfo>;

export const zCreateSessionRequest = z.object({
    lobbyOptions: zLobbyOptions.optional()
});
export type CreateSessionRequest = z.infer<typeof zCreateSessionRequest>;

export const zCreateSessionResponse = z.object({
    sessionId: zIdentifier
});
export type CreateSessionResponse = z.infer<typeof zCreateSessionResponse>;

export const zJoinSessionRequest = z.object({
    sessionId: z.string().trim().min(1),
    username: z.string().optional()
});
export type JoinSessionRequest = z.infer<typeof zJoinSessionRequest>;

const zSessionInfoBase = z.object({
    id: zIdentifier,
    players: z.array(zSessionParticipant),
    spectators: z.array(zSessionParticipant),
    gameOptions: zLobbyOptions
});

export const zSessionInfo = z.discriminatedUnion('state', [
    zSessionInfoBase.extend({
        state: z.literal('lobby')
    }),
    zSessionInfoBase.extend({
        state: z.literal('in-game'),
        startedAt: zTimestamp,
        gameId: zIdentifier
    }),
    zSessionInfoBase.extend({
        state: z.literal('finished'),
        gameId: zIdentifier,
        finishReason: zSessionFinishReason,
        winningPlayerId: zIdentifier.nullable(),
        rematchAcceptedPlayerIds: z.array(zIdentifier)
    })
]);
export type SessionInfo = z.infer<typeof zSessionInfo>;

export const zGameMove = z.object({
    moveNumber: z.number().int().nonnegative(),
    playerId: zIdentifier,
    x: zCoordinate,
    y: zCoordinate,
    timestamp: zTimestamp
});
export type GameMove = z.infer<typeof zGameMove>;

export const zDatabaseGamePlayer = z.object({
    playerId: zIdentifier,
    displayName: z.string(),
    profileId: zIdentifier
});
export type DatabaseGamePlayer = z.infer<typeof zDatabaseGamePlayer>;

export const zDatabaseGameResult = z.object({
    winningPlayerId: zIdentifier.nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    reason: zSessionFinishReason,
});
export type DatabaseGameResult = z.infer<typeof zDatabaseGameResult>;

export const zDatabaseGame = z.object({
    id: zIdentifier,
    version: z.literal(2),

    sessionId: zIdentifier,
    startedAt: zTimestamp,
    finishedAt: zTimestamp.nullable(),
    players: z.array(zDatabaseGamePlayer),
    gameOptions: zLobbyOptions,
    moves: z.array(zGameMove),
    moveCount: z.number().int().nonnegative(),
    gameResult: zDatabaseGameResult.nullable()
});
export type DatabaseGame = z.infer<typeof zDatabaseGame>;

export const zFinishedGameSummary = z.object({
    id: zIdentifier,
    sessionId: zIdentifier,
    startedAt: zTimestamp,
    finishedAt: zTimestamp.nullable(),
    players: z.array(zDatabaseGamePlayer),
    gameOptions: zLobbyOptions,
    moveCount: z.number().int().nonnegative(),
    gameResult: zDatabaseGameResult.nullable()
});
export type FinishedGameSummary = z.infer<typeof zFinishedGameSummary>;

export const zFinishedGameRecord = zFinishedGameSummary.extend({
    moves: z.array(zGameMove)
});
export type FinishedGameRecord = z.infer<typeof zFinishedGameRecord>;

export const zFinishedGamesPagination = z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalGames: z.number().int().nonnegative(),
    totalMoves: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
    baseTimestamp: zTimestamp
});
export type FinishedGamesPagination = z.infer<typeof zFinishedGamesPagination>;

export const zFinishedGamesPage = z.object({
    games: z.array(zFinishedGameSummary),
    pagination: zFinishedGamesPagination
});
export type FinishedGamesPage = z.infer<typeof zFinishedGamesPage>;

export const zSessionJoinedEvent = z.object({
    sessionId: zIdentifier,
    session: zSessionInfo,
    participantId: zIdentifier
});
export type SessionJoinedEvent = z.infer<typeof zSessionJoinedEvent>;

export const zSessionUpdatedEvent = z.object({
    sessionId: zIdentifier,
    session: zSessionInfo
});
export type SessionUpdatedEvent = z.infer<typeof zSessionUpdatedEvent>;

export const zParticipantUpdatedEvent = z.object({
    sessionId: zIdentifier,
    participantId: zIdentifier,
    participantRole: zSessionParticipantRole,
    session: zSessionInfo
});
export type ParticipantUpdatedEvent = z.infer<typeof zParticipantUpdatedEvent>;

export const zGameStateEvent = z.object({
    sessionId: zIdentifier,
    gameId: zIdentifier,
    gameState: zGameBoard
});
export type GameStateEvent = z.infer<typeof zGameStateEvent>;

export const zPlaceCellRequest = z.object({
    x: zCoordinate,
    y: zCoordinate
});
export type PlaceCellRequest = z.infer<typeof zPlaceCellRequest>;

export const zServerToClientEvents = z.custom<{
    'initialized': () => void;
    'lobby-list': (lobbies: LobbyInfo[]) => void;
    'shutdown-updated': (shutdown: ShutdownState | null) => void;
    'admin-message': (broadcast: AdminBroadcastMessage) => void;
    'session-joined': (data: SessionJoinedEvent) => void;
    'session-updated': (data: SessionUpdatedEvent) => void;
    'participant-joined': (data: ParticipantUpdatedEvent) => void;
    'participant-left': (data: ParticipantUpdatedEvent) => void;
    'game-state': (data: GameStateEvent) => void;
    error: (error: string) => void;
}>();
export type ServerToClientEvents = z.infer<typeof zServerToClientEvents>;

export const zClientToServerEvents = z.custom<{
    'join-session': (request: JoinSessionRequest) => void;
    'leave-session': (sessionId: string) => void;
    'surrender-session': (sessionId: string) => void;
    'place-cell': (data: PlaceCellRequest) => void;
    'request-rematch': (sessionId: string) => void;
    'cancel-rematch': (sessionId: string) => void;
}>();
export type ClientToServerEvents = z.infer<typeof zClientToServerEvents>;

export const zPosition = z.object({
    x: zCoordinate,
    y: zCoordinate
});
export type Position = z.infer<typeof zPosition>;

export const zSize = z.object({
    width: z.number(),
    height: z.number()
});
export type Size = z.infer<typeof zSize>;

export const zPlayer = z.object({
    id: zIdentifier,
    name: z.string().optional(),
    position: zPosition.optional(),
    color: z.string().optional()
});
export type Player = z.infer<typeof zPlayer>;

const zNormalizedUsername = z.string()
    .transform((username) => username.trim().replace(/\s+/g, ' '))
    .refine((username) => username.length >= 2 && username.length <= 32, {
        message: 'Your username must be between 2 and 32 characters long.'
    })
    .refine((username) => !/[\p{C}]/u.test(username), {
        message: 'Your username contains unsupported characters.'
    });

export const zAccountProfile = z.object({
    id: zIdentifier,
    username: z.string(),
    email: z.string().nullable(),
    image: z.string().nullable(),
    role: zUserRole
});
export type AccountProfile = z.infer<typeof zAccountProfile>;

export const zAccountResponse = z.object({
    user: zAccountProfile.nullable()
});
export type AccountResponse = z.infer<typeof zAccountResponse>;

export const zAdminStatGameBase = z.object({
    gameId: zIdentifier,
    sessionId: zIdentifier,
    players: z.array(z.string()),
    finishedAt: zTimestamp
});
export type AdminStatGameBase = z.infer<typeof zAdminStatGameBase>;

export const zAdminLongestGameInMoves = zAdminStatGameBase.extend({
    moveCount: z.number().int().nonnegative()
});
export type AdminLongestGameInMoves = z.infer<typeof zAdminLongestGameInMoves>;

export const zAdminLongestGameInDuration = zAdminStatGameBase.extend({
    durationMs: z.number().int().nonnegative()
});
export type AdminLongestGameInDuration = z.infer<typeof zAdminLongestGameInDuration>;

export const zAdminStatsWindow = z.object({
    startAt: zTimestamp,
    endAt: zTimestamp,
    siteVisits: z.number().int().nonnegative(),
    gamesPlayed: z.number().int().nonnegative(),
    longestGameInMoves: zAdminLongestGameInMoves.nullable(),
    longestGameInDuration: zAdminLongestGameInDuration.nullable()
});
export type AdminStatsWindow = z.infer<typeof zAdminStatsWindow>;

export const zAdminLeaderboardPlayer = z.object({
    profileId: zIdentifier,
    displayName: z.string(),
    image: z.string().nullable(),
    gamesPlayed: z.number().int().nonnegative(),
    gamesWon: z.number().int().nonnegative(),
    winRatio: z.number().min(0).max(1)
});
export type AdminLeaderboardPlayer = z.infer<typeof zAdminLeaderboardPlayer>;

export const zAdminLeaderboard = z.object({
    generatedAt: zTimestamp,
    nextRefreshAt: zTimestamp,
    refreshIntervalMs: z.number().int().positive(),
    players: z.array(zAdminLeaderboardPlayer)
});
export type AdminLeaderboard = z.infer<typeof zAdminLeaderboard>;

export const zAdminStatsResponse = z.object({
    generatedAt: zTimestamp,
    activeGames: z.object({
        total: z.number().int().nonnegative(),
        public: z.number().int().nonnegative(),
        private: z.number().int().nonnegative()
    }),
    connectedClients: z.number().int().nonnegative(),
    intervals: z.object({
        sinceMidnight: zAdminStatsWindow,
        last24Hours: zAdminStatsWindow,
        last7Days: zAdminStatsWindow
    })
});
export type AdminStatsResponse = z.infer<typeof zAdminStatsResponse>;

export const zUpdateAccountProfileRequest = z.object({
    username: zNormalizedUsername
});
export type UpdateAccountProfileRequest = z.infer<typeof zUpdateAccountProfileRequest>;

export const zSocketIOClientAuthPayload = z.object({
    deviceId: z.uuidv4(),
    ephemeralClientId: z.uuidv4()
});
export type SocketIOClientAuthPayload = z.infer<typeof zSocketIOClientAuthPayload>;