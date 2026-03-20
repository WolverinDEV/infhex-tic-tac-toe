import { z } from 'zod';

export const DUMMY = 'Hello?';

const zTimestamp = z.number().int();
const zCoordinate = z.number().int();
const zIdentifier = z.string();

export const zSessionState = z.enum(['lobby', 'ingame', 'finished']);
export type SessionState = z.infer<typeof zSessionState>;

export const zSessionParticipantRole = z.enum(['player', 'spectator']);
export type SessionParticipantRole = z.infer<typeof zSessionParticipantRole>;

export const zCellOccupant = z.string().brand<'CellOccupant'>();
export type CellOccupant = z.infer<typeof zCellOccupant>;

export const zSessionFinishReason = z.enum(['disconnect', 'timeout', 'terminated', 'six-in-a-row']);
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

export const zBoardCell = z.object({
    x: zCoordinate,
    y: zCoordinate,
    occupiedBy: zCellOccupant
});
export type BoardCell = z.infer<typeof zBoardCell>;

export const zBoardState = z.object({
    cells: z.array(zBoardCell),
    currentTurnPlayerId: zIdentifier.nullable(),
    placementsRemaining: z.number().int().nonnegative(),
    currentTurnExpiresAt: zTimestamp.nullable(),
    playerTimeRemainingMs: z.record(z.string(), z.number().int().nonnegative())
});
export type BoardState = z.infer<typeof zBoardState>;

export const zGameSession = z.object({
    id: zIdentifier,
    players: z.array(zIdentifier),
    playerNames: zPlayerNames,
    spectators: z.array(zIdentifier),
    maxPlayers: z.literal(2),
    state: zSessionState,
    lobbyOptions: zLobbyOptions,
    gameState: zBoardState
});
export type GameSession = z.infer<typeof zGameSession>;

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

export const zSessionInfo = z.object({
    id: zIdentifier,
    playerCount: z.number().int().nonnegative(),
    playerNames: z.array(z.string()),
    maxPlayers: z.literal(2),
    state: zSessionState,
    lobbyOptions: zLobbyOptions,
    canJoin: z.boolean(),
    createdAt: zTimestamp,
    startedAt: zTimestamp.nullable()
});
export type SessionInfo = z.infer<typeof zSessionInfo>;

export const zGameMove = z.object({
    moveNumber: z.number().int().nonnegative(),
    playerId: zIdentifier,
    x: zCoordinate,
    y: zCoordinate,
    timestamp: zTimestamp
});
export type GameMove = z.infer<typeof zGameMove>;

export const zFinishedGameSummary = z.object({
    id: zIdentifier,
    sessionId: zIdentifier,
    players: z.array(zIdentifier),
    playerNames: zPlayerNames,
    playerProfileIds: zPlayerProfileIds,
    winningPlayerId: zIdentifier.nullable(),
    reason: zSessionFinishReason,
    moveCount: z.number().int().nonnegative(),
    createdAt: zTimestamp,
    startedAt: zTimestamp,
    finishedAt: zTimestamp,
    gameDurationMs: z.number().int().nonnegative()
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

export const zSessionFinishedEvent = z.object({
    sessionId: zIdentifier,
    finishedGameId: zIdentifier,
    winningPlayerId: zIdentifier.nullable(),
    reason: zSessionFinishReason,
    canRematch: z.boolean()
});
export type SessionFinishedEvent = z.infer<typeof zSessionFinishedEvent>;

export const zRematchUpdatedEvent = z.object({
    sessionId: zIdentifier,
    canRematch: z.boolean(),
    requestedPlayerIds: z.array(zIdentifier)
});
export type RematchUpdatedEvent = z.infer<typeof zRematchUpdatedEvent>;

export const zSessionJoinedEvent = z.object({
    sessionId: zIdentifier,
    state: zSessionState,
    role: zSessionParticipantRole,
    players: z.array(zIdentifier),
    playerNames: zPlayerNames,
    lobbyOptions: zLobbyOptions,
    participantId: zIdentifier
});
export type SessionJoinedEvent = z.infer<typeof zSessionJoinedEvent>;

export const zSessionPlayersUpdatedEvent = z.object({
    playerId: zIdentifier,
    players: z.array(zIdentifier),
    playerNames: zPlayerNames,
    state: zSessionState
});
export type SessionPlayersUpdatedEvent = z.infer<typeof zSessionPlayersUpdatedEvent>;

export const zGameStateEvent = z.object({
    sessionId: zIdentifier,
    sessionState: zSessionState,
    gameState: zBoardState
});
export type GameStateEvent = z.infer<typeof zGameStateEvent>;

export const zPlaceCellRequest = z.object({
    sessionId: z.string().trim().min(1),
    x: zCoordinate,
    y: zCoordinate
});
export type PlaceCellRequest = z.infer<typeof zPlaceCellRequest>;

export const zServerToClientEvents = z.custom<{
    'sessions-updated': (sessions: SessionInfo[]) => void;
    'shutdown-updated': (shutdown: ShutdownState | null) => void;
    'session-joined': (data: SessionJoinedEvent) => void;
    'session-finished': (data: SessionFinishedEvent) => void;
    'player-joined': (data: SessionPlayersUpdatedEvent) => void;
    'player-left': (data: SessionPlayersUpdatedEvent) => void;
    'game-state': (data: GameStateEvent) => void;
    'rematch-updated': (data: RematchUpdatedEvent) => void;
    error: (error: string) => void;
}>();
export type ServerToClientEvents = z.infer<typeof zServerToClientEvents>;

export const zClientToServerEvents = z.custom<{
    'join-session': (request: JoinSessionRequest) => void;
    'leave-session': (sessionId: string) => void;
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
    image: z.string().nullable()
});
export type AccountProfile = z.infer<typeof zAccountProfile>;

export const zAccountResponse = z.object({
    user: zAccountProfile.nullable()
});
export type AccountResponse = z.infer<typeof zAccountResponse>;

export const zUpdateAccountProfileRequest = z.object({
    username: zNormalizedUsername
});
export type UpdateAccountProfileRequest = z.infer<typeof zUpdateAccountProfileRequest>;
