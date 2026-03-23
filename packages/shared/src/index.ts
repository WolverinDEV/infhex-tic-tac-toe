import { z } from 'zod';

export const DUMMY = 'Hello?';
export const PLACE_CELL_HEX_RADIUS = 8;
export type { ChangelogDay, ChangelogEntry, ChangelogEntryKind } from './changelogTypes';
export { CHANGELOG_COMMIT_COUNT, CHANGELOG_DAYS, CHANGELOG_GENERATED_AT } from './generatedChangelog';

export interface HexCoordinate {
    x: number;
    y: number;
}

const zTimestamp = z.number().int();
const zCoordinate = z.number().int();
const zIdentifier = z.string();
export const zHexCoordinate = z.object({
    x: zCoordinate,
    y: zCoordinate
});

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
    }),
    z.object({
        status: z.literal('disconnected')
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

export const PLAYER_TILE_COLORS = ['#fbbf24', '#38bdf8', '#f472b6', '#34d399', '#c084fc', '#fb7185'] as const;

export const zPlayerTileConfig = z.object({
    color: z.string()
});
export type PlayerTileConfig = z.infer<typeof zPlayerTileConfig>;

export function getDefaultPlayerTileColor(playerIndex: number): string {
    return PLAYER_TILE_COLORS[Math.min(playerIndex, PLAYER_TILE_COLORS.length - 1)] ?? PLAYER_TILE_COLORS[0];
}

export function buildPlayerTileConfigMap(playerIds: readonly string[]): Record<string, PlayerTileConfig> {
    return Object.fromEntries(
        playerIds.map((playerId, playerIndex) => [
            playerId,
            {
                color: getDefaultPlayerTileColor(playerIndex)
            }
        ])
    );
}

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
    timeControl: zGameTimeControl,
    rated: z.boolean().default(false)
});
export type LobbyOptions = z.infer<typeof zLobbyOptions>;

export const DEFAULT_LOBBY_OPTIONS: LobbyOptions = zLobbyOptions.parse({
    visibility: 'public',
    timeControl: {
        mode: 'turn',
        turnTimeMs: 45_000
    },
    rated: false
});

export const zShutdownState = z.object({
    scheduledAt: zTimestamp,
    gracefulTimeout: zTimestamp
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

export const zServerSettings = z.object({
    maxConcurrentGames: z.number().int().min(0).max(10_000).nullable().default(null)
});
export type ServerSettings = z.infer<typeof zServerSettings>;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = zServerSettings.parse({});

export const zAdminUpdateServerSettingsRequest = z.object({
    settings: zServerSettings
});
export type AdminUpdateServerSettingsRequest = z.infer<typeof zAdminUpdateServerSettingsRequest>;

export const zAdminServerSettingsResponse = z.object({
    settings: zServerSettings,
    currentConcurrentGames: z.number().int().nonnegative()
});
export type AdminServerSettingsResponse = z.infer<typeof zAdminServerSettingsResponse>;

export const zBoardCell = z.object({
    x: zCoordinate,
    y: zCoordinate,
    occupiedBy: zCellOccupant
});
export type BoardCell = z.infer<typeof zBoardCell>;

export class GameRuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GameRuleError';
    }
}

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

export const GameState = z.object({
    cells: z.array(zBoardCell),
    highlightedCells: z.array(zHexCoordinate),
    playerTiles: z.record(z.string(), zPlayerTileConfig),
    currentTurnPlayerId: zIdentifier.nullable(),
    placementsRemaining: z.number().int().nonnegative(),
    currentTurnExpiresAt: zTimestamp.nullable(),
    playerTimeRemainingMs: z.record(z.string(), z.number().int().nonnegative())
});
export type GameState = z.infer<typeof GameState>;

export const zBoardState = GameState;
export type BoardState = GameState;

export const zSandboxPositionId = z.string().trim().regex(/^[a-z0-9]{7}$/i);
export type SandboxPositionId = z.infer<typeof zSandboxPositionId>;

export const zSandboxPositionName = z.string().trim().min(1).max(80);
export type SandboxPositionName = z.infer<typeof zSandboxPositionName>;

export const zSandboxPlayerSlot = z.enum(['player-1', 'player-2']);
export type SandboxPlayerSlot = z.infer<typeof zSandboxPlayerSlot>;

export const zSandboxPositionCell = z.object({
    x: zCoordinate,
    y: zCoordinate,
    player: zSandboxPlayerSlot,
    moveId: z.number().int().positive()
});
export type SandboxPositionCell = z.infer<typeof zSandboxPositionCell>;

export const zSandboxGamePosition = z.object({
    cells: z.array(zSandboxPositionCell),
    currentTurnPlayer: zSandboxPlayerSlot,
    placementsRemaining: z.number().int().min(1).max(2)
});
export type SandboxGamePosition = z.infer<typeof zSandboxGamePosition>;

export const zCreateSandboxPositionRequest = z.object({
    name: zSandboxPositionName,
    gamePosition: zSandboxGamePosition
});
export type CreateSandboxPositionRequest = z.infer<typeof zCreateSandboxPositionRequest>;

export const zCreateSandboxPositionResponse = z.object({
    id: zSandboxPositionId,
    name: zSandboxPositionName
});
export type CreateSandboxPositionResponse = z.infer<typeof zCreateSandboxPositionResponse>;

export const zSandboxPositionResponse = z.object({
    id: zSandboxPositionId,
    name: zSandboxPositionName,
    gamePosition: zSandboxGamePosition
});
export type SandboxPositionResponse = z.infer<typeof zSandboxPositionResponse>;

export interface ApplyGameMoveParams {
    playerId: string;
    x: number;
    y: number;
}

export interface ApplyGameMoveResult {
    turnCompleted: boolean;
    winningPlayerId: string | null;
}

export function createEmptyGameState(): GameState {
    return {
        cells: [],
        highlightedCells: [],
        playerTiles: {},
        currentTurnPlayerId: null,
        placementsRemaining: 0,
        currentTurnExpiresAt: null,
        playerTimeRemainingMs: {}
    };
}

export function cloneGameState(gameState: GameState): GameState {
    return {
        ...gameState,
        cells: gameState.cells.map((cell) => ({ ...cell })),
        highlightedCells: gameState.highlightedCells.map((cell) => ({ ...cell })),
        playerTiles: Object.fromEntries(
            Object.entries(gameState.playerTiles).map(([playerId, playerTileConfig]) => [playerId, { ...playerTileConfig }])
        ),
        playerTimeRemainingMs: { ...gameState.playerTimeRemainingMs }
    };
}

export function createStartedGameState(playerIds: readonly string[]): GameState {
    const gameState = createEmptyGameState();
    initializeGameState(gameState, playerIds);
    return gameState;
}

export function initializeGameState(gameState: GameState, playerIds: readonly string[]): void {
    gameState.cells = [];
    gameState.highlightedCells = [];
    gameState.playerTiles = buildPlayerTileConfigMap(playerIds);
    gameState.currentTurnExpiresAt = null;
    gameState.playerTimeRemainingMs = {};
    setCurrentTurn(gameState, playerIds[0] ?? null, 1);
}

export function getPublicGameState(gameState: GameState): GameState {
    return {
        ...cloneGameState(gameState),
        cells: [...gameState.cells].sort((a, b) => {
            if (a.y === b.y) {
                return a.x - b.x;
            }

            return a.y - b.y;
        })
    };
}

export function applyGameMove(gameState: GameState, params: ApplyGameMoveParams): ApplyGameMoveResult {
    const { playerId, x, y } = params;

    if (gameState.currentTurnPlayerId !== playerId) {
        throw new GameRuleError('It is not your turn');
    }

    if (gameState.placementsRemaining <= 0) {
        throw new GameRuleError('No placements remaining this turn');
    }

    const cellKey = getCellKey(x, y);
    const isOccupied = gameState.cells.some((cell) => getCellKey(cell.x, cell.y) === cellKey);
    if (isOccupied) {
        throw new GameRuleError('Cell is already occupied');
    }

    if (gameState.cells.length === 0 && (x !== 0 || y !== 0)) {
        throw new GameRuleError('First placement must be at the origin');
    }

    if (!isCellWithinPlacementRadius(gameState.cells, { x, y })) {
        throw new GameRuleError(`Cell must be within ${PLACE_CELL_HEX_RADIUS} hexes of an existing placed cell`);
    }

    const isFirstPlacementOfTurn = gameState.cells.length === 0 || gameState.placementsRemaining === 2;
    const turnCompleted = gameState.placementsRemaining === 1;
    const playerIds = Object.keys(gameState.playerTiles);

    gameState.cells.push({
        x,
        y,
        occupiedBy: zCellOccupant.parse(playerId)
    });
    gameState.highlightedCells = isFirstPlacementOfTurn
        ? [{ x, y }]
        : [...gameState.highlightedCells, { x, y }].slice(-2);
    gameState.placementsRemaining -= 1;

    if (hasSixInARow(gameState, playerId, x, y)) {
        return {
            turnCompleted,
            winningPlayerId: playerId
        };
    }

    if (turnCompleted) {
        const currentPlayerIndex = playerIds.findIndex((existingPlayerId) => existingPlayerId === playerId);
        const nextPlayerIndex = currentPlayerIndex === 0 ? 1 : 0;
        setCurrentTurn(gameState, playerIds[nextPlayerIndex] ?? playerId, 2);
    }

    return {
        turnCompleted,
        winningPlayerId: null
    };
}

function setCurrentTurn(gameState: GameState, playerId: string | null, placementsRemaining: number): void {
    gameState.currentTurnPlayerId = playerId;
    gameState.placementsRemaining = playerId ? placementsRemaining : 0;
    if (!playerId) {
        gameState.currentTurnExpiresAt = null;
    }
}

function hasSixInARow(gameState: GameState, playerId: string, x: number, y: number): boolean {
    const occupiedCells = new Set(
        gameState.cells
            .filter((cell) => cell.occupiedBy === playerId)
            .map((cell) => getCellKey(cell.x, cell.y))
    );
    const directions: Array<[number, number]> = [
        [1, 0],
        [0, 1],
        [1, -1]
    ];

    return directions.some(([directionX, directionY]) => {
        const connectedCount =
            1 +
            countConnectedTiles(occupiedCells, x, y, directionX, directionY) +
            countConnectedTiles(occupiedCells, x, y, -directionX, -directionY);

        return connectedCount >= 6;
    });
}

function countConnectedTiles(
    occupiedCells: Set<string>,
    startX: number,
    startY: number,
    directionX: number,
    directionY: number
): number {
    let count = 0;
    let currentX = startX + directionX;
    let currentY = startY + directionY;

    while (occupiedCells.has(getCellKey(currentX, currentY))) {
        count += 1;
        currentX += directionX;
        currentY += directionY;
    }

    return count;
}

export const zSessionParticipant = z.object({
    id: zIdentifier,
    displayName: z.string(),
    profileId: zIdentifier.nullable(),
    elo: z.number().int().nullable().default(null),
    eloChange: z.number().int().nullable().default(null),
    connection: zParticipantConnection
});
export type SessionParticipant = z.infer<typeof zSessionParticipant>;

export const zLobbyListParticipant = z.object({
    displayName: z.string(),
    profileId: zIdentifier.nullable(),
    elo: z.number().int().nullable().default(null)
});
export type LobbyListParticipant = z.infer<typeof zLobbyListParticipant>;

export const zLobbyInfo = z.object({
    id: zIdentifier,
    playerNames: z.array(z.string()),
    players: z.array(zLobbyListParticipant).default([]),
    timeControl: zGameTimeControl,
    rated: z.boolean().default(false),
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

export const zAdminTerminateSessionResponse = z.object({
    session: zSessionInfo
});
export type AdminTerminateSessionResponse = z.infer<typeof zAdminTerminateSessionResponse>;

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
    profileId: zIdentifier,
    elo: z.number().int().nullable().default(null),
    eloChange: z.number().int().nullable().default(null)
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
    version: z.literal(3),

    sessionId: zIdentifier,
    startedAt: zTimestamp,
    finishedAt: zTimestamp.nullable(),
    players: z.array(zDatabaseGamePlayer),
    playerTiles: z.record(z.string(), zPlayerTileConfig),
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
    playerTiles: z.record(z.string(), zPlayerTileConfig),
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
    gameState: GameState
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

export const zAccountStatistics = z.object({
    totalGames: z.object({
        played: z.number().int().nonnegative(),
        won: z.number().int().nonnegative()
    }),
    rankedGames: z.object({
        played: z.number().int().nonnegative(),
        won: z.number().int().nonnegative(),
        currentWinStreak: z.number().int().nonnegative(),
        longestWinStreak: z.number().int().nonnegative()
    }),
    longestGamePlayedMs: z.number().int().nonnegative(),
    longestGameByMoves: z.number().int().nonnegative(),
    totalMovesMade: z.number().int().nonnegative(),
    elo: z.number().int().nonnegative(),
    worldRank: z.number().int().positive().nullable()
});
export type AccountStatistics = z.infer<typeof zAccountStatistics>;

export const zAccountPreferences = z.object({
    moveConfirmation: z.boolean().default(false),
    autoPlaceOriginTile: z.boolean().default(false),
    tilePieceMarkers: z.boolean().default(false),
    changelogReadAt: z.number().int().nonnegative().nullable().default(null)
});
export type AccountPreferences = z.infer<typeof zAccountPreferences>;

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = zAccountPreferences.parse({});

export const zAccountProfile = z.object({
    id: zIdentifier,
    username: z.string(),
    email: z.string().nullable(),
    image: z.string().nullable(),
    role: zUserRole,
    registeredAt: zTimestamp,
    lastActiveAt: zTimestamp
});
export type AccountProfile = z.infer<typeof zAccountProfile>;

export const zPublicAccountProfile = zAccountProfile.omit({
    email: true
});
export type PublicAccountProfile = z.infer<typeof zPublicAccountProfile>;

export const zAccountResponse = z.object({
    user: zAccountProfile.nullable()
});
export type AccountResponse = z.infer<typeof zAccountResponse>;

export const zPublicAccountResponse = z.object({
    user: zPublicAccountProfile.nullable()
});
export type PublicAccountResponse = z.infer<typeof zPublicAccountResponse>;

export const zAccountStatisticsResponse = z.object({
    statistics: zAccountStatistics
});
export type AccountStatisticsResponse = z.infer<typeof zAccountStatisticsResponse>;

export const zAccountPreferencesResponse = z.object({
    preferences: zAccountPreferences
});
export type AccountPreferencesResponse = z.infer<typeof zAccountPreferencesResponse>;

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
    timePlayedMs: z.number().int().nonnegative(),
    longestGameInMoves: zAdminLongestGameInMoves.nullable(),
    longestGameInDuration: zAdminLongestGameInDuration.nullable()
});
export type AdminStatsWindow = z.infer<typeof zAdminStatsWindow>;

export const zAdminUserStatsWindow = z.object({
    startAt: zTimestamp,
    endAt: zTimestamp,
    newUsers: z.number().int().nonnegative(),
    activeUsers: z.number().int().nonnegative()
});
export type AdminUserStatsWindow = z.infer<typeof zAdminUserStatsWindow>;

export const zAdminActiveGamesTimelinePoint = z.object({
    timestamp: zTimestamp,
    activeGames: z.number().int().nonnegative()
});
export type AdminActiveGamesTimelinePoint = z.infer<typeof zAdminActiveGamesTimelinePoint>;

export const zAdminActiveGamesTimeline = z.object({
    startAt: zTimestamp,
    endAt: zTimestamp,
    bucketSizeMs: z.number().int().positive(),
    points: z.array(zAdminActiveGamesTimelinePoint)
});
export type AdminActiveGamesTimeline = z.infer<typeof zAdminActiveGamesTimeline>;

export const zLeaderboardPlayer = z.object({
    profileId: zIdentifier,
    displayName: z.string(),
    image: z.string().nullable(),
    elo: z.number().int().nonnegative(),
    gamesPlayed: z.number().int().nonnegative(),
    gamesWon: z.number().int().nonnegative()
});
export type LeaderboardPlayer = z.infer<typeof zLeaderboardPlayer>;

export const zLeaderboardPlacement = zLeaderboardPlayer.extend({
    rank: z.number().int().positive()
});
export type LeaderboardPlacement = z.infer<typeof zLeaderboardPlacement>;

export const zLeaderboard = z.object({
    generatedAt: zTimestamp,
    nextRefreshAt: zTimestamp,
    refreshIntervalMs: z.number().int().positive(),

    players: z.array(zLeaderboardPlayer),
    ownPlacement: zLeaderboardPlacement.nullable()
});
export type Leaderboard = z.infer<typeof zLeaderboard>;

export const zAdminStatsResponse = z.object({
    generatedAt: zTimestamp,
    activeGames: z.object({
        total: z.number().int().nonnegative(),
        public: z.number().int().nonnegative(),
        private: z.number().int().nonnegative()
    }),
    connectedClients: z.number().int().nonnegative(),
    users: z.object({
        total: z.number().int().nonnegative(),
        intervals: z.object({
            sinceMidnight: zAdminUserStatsWindow,
            last7Days: zAdminUserStatsWindow,
            lastMonth: zAdminUserStatsWindow
        })
    }),
    intervals: z.object({
        sinceMidnight: zAdminStatsWindow,
        last24Hours: zAdminStatsWindow,
        last7Days: zAdminStatsWindow
    }),
    activeGamesTimeline: zAdminActiveGamesTimeline
});
export type AdminStatsResponse = z.infer<typeof zAdminStatsResponse>;

export const zUpdateAccountProfileRequest = z.object({
    username: zNormalizedUsername
});
export type UpdateAccountProfileRequest = z.infer<typeof zUpdateAccountProfileRequest>;

export const zUpdateAccountPreferencesRequest = z.object({
    preferences: zAccountPreferences
});
export type UpdateAccountPreferencesRequest = z.infer<typeof zUpdateAccountPreferencesRequest>;

export const zSocketIOClientAuthPayload = z.object({
    deviceId: z.uuidv4(),
    ephemeralClientId: z.uuidv4(),
    versionHash: z.string().trim().min(1)
});
export type SocketIOClientAuthPayload = z.infer<typeof zSocketIOClientAuthPayload>;
