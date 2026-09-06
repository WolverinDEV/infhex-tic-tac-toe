import { z } from "zod";

import {
    zFinishedGameTournamentInfo,
    zSessionTournamentInfo,
} from "./tournaments";

export const PLACE_CELL_HEX_RADIUS = 8;
const WINNING_LINE_LENGTH = 6;
export const DRAW_REQUEST_MIN_TURNS = 50;
export const DRAW_REQUEST_RETRY_TURNS = 15;

export const zTimestamp = z.number().int();
export const zCoordinate = z.number().int();
export const zIdentifier = z.string();
export const zHexCoordinate = z.object({
    x: zCoordinate,
    y: zCoordinate,
});
export type HexCoordinate = z.infer<typeof zHexCoordinate>;

export const zUserRole = z.enum([`user`, `admin`]);
export type UserRole = z.infer<typeof zUserRole>;

export const zAccountPermission = z.enum([`official-tournament-organizer`]);
export type AccountPermission = z.infer<typeof zAccountPermission>;

export const zSessionParticipantRole = z.enum([`player`, `spectator`]);
export type SessionParticipantRole = z.infer<typeof zSessionParticipantRole>;

export const zPlayerConnection = z.discriminatedUnion(`status`, [
    z.object({
        status: z.literal(`connected`),
    }),
    z.object({
        status: z.literal(`orphaned`),
    }),
    z.object({
        status: z.literal(`disconnected`),
    }),
]);
export type PlayerConnection = z.infer<typeof zPlayerConnection>;

export const zCellOccupant = z.string().brand<`CellOccupant`>();
export type CellOccupant = z.infer<typeof zCellOccupant>;

export const zSessionFinishReason = z.enum([
    `disconnect`,
    `surrender`,
    `timeout`,
    `terminated`,
    `six-in-a-row`,
    `draw-agreement`,
]);
export type SessionFinishReason = z.infer<typeof zSessionFinishReason>;

export const zLobbyVisibility = z.enum([`public`, `private`]);
export type LobbyVisibility = z.infer<typeof zLobbyVisibility>;

export const zLobbyFirstPlayer = z.enum([`host`, `guest`, `random`]);
export type LobbyFirstPlayer = z.infer<typeof zLobbyFirstPlayer>;

export const zPlayerNames = z.record(z.string(), z.string());
export type PlayerNames = z.infer<typeof zPlayerNames>;

export const zPlayerProfileIds = z.record(z.string(), z.string().nullable());
export type PlayerProfileIds = z.infer<typeof zPlayerProfileIds>;

export const zPlayerColorIndex = z.union([z.literal(0), z.literal(1)]);
export type PlayerColorIndex = z.infer<typeof zPlayerColorIndex>;

export const zPlayerTileConfig = z.object({
    colorIndex: zPlayerColorIndex,
});
export type PlayerTileConfig = z.infer<typeof zPlayerTileConfig>;

export function buildPlayerTileConfigMap(
    playerIds: readonly string[],
): Record<string, PlayerTileConfig> {
    return Object.fromEntries(
        playerIds.map((playerId, playerIndex) => [
            playerId,
            {
                colorIndex: zPlayerColorIndex.parse(playerIndex),
            },
        ]),
    );
}

export const zGameTimeControl = z.union([
    z.object({
        mode: z.literal(`unlimited`),
    }),
    z.object({
        mode: z.literal(`turn`),
        turnTimeMs: z.number().int().nonnegative(),
    }),
    z.object({
        mode: z.literal(`match`),
        mainTimeMs: z.number().int().nonnegative(),
        incrementMs: z.number().int().nonnegative(),
    }),
]);
export type GameTimeControl = z.infer<typeof zGameTimeControl>;

export const zLobbyOptions = z.object({
    visibility: zLobbyVisibility,
    timeControl: zGameTimeControl,
    rated: z.boolean().default(false),
    firstPlayer: zLobbyFirstPlayer.default(`random`),
});
export type LobbyOptions = z.infer<typeof zLobbyOptions>;

export const DEFAULT_LOBBY_OPTIONS: LobbyOptions = zLobbyOptions.parse({
    visibility: `public`,
    timeControl: {
        mode: `turn`,
        turnTimeMs: 45_000,
    },
    rated: false,
    firstPlayer: `random`,
});

export const zShutdownState = z.object({
    scheduledAt: zTimestamp,
    gracefulTimeout: zTimestamp,
});
export type ShutdownState = z.infer<typeof zShutdownState>;

export const zAdminBroadcastMessage = z.object({
    message: z.string().trim().min(1).max(280),
    sentAt: zTimestamp,
});
export type AdminBroadcastMessage = z.infer<typeof zAdminBroadcastMessage>;

export const zSessionChatMessageText = z.string().trim().min(1).max(280);
export type SessionChatMessageText = z.infer<typeof zSessionChatMessageText>;

export const zSessionChatMessageId = z.string().brand(`ChatMessageId`);
export type SessionChatMessageId = z.infer<typeof zSessionChatMessageId>;

export const zSessionChatSenderId = z.string().brand(`ChatSender`);
export type SessionChatSenderId = z.infer<typeof zSessionChatSenderId>;

export const zSessionChatMessage = z.object({
    id: zSessionChatMessageId,
    sentAt: zTimestamp,
    senderId: zSessionChatSenderId,
    message: zSessionChatMessageText,
});
export type SessionChatMessage = z.infer<typeof zSessionChatMessage>;

export const zServerSettings = z.object({
    maxConcurrentGames: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .nullable()
        .default(null),
});
export type ServerSettings = z.infer<typeof zServerSettings>;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = zServerSettings.parse(
    {},
);

export const zBoardCell = z.object({
    x: zCoordinate,
    y: zCoordinate,
    occupiedBy: zCellOccupant,
});
export type BoardCell = z.infer<typeof zBoardCell>;

export const zGameWinner = z.object({
    cells: z.array(zHexCoordinate),
    playerId: zIdentifier,
});
export type GameWinner = z.infer<typeof zGameWinner>;

export class GameRuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = `GameRuleError`;
    }
}

export type CellKey = `${number},${number}`;
export function getCellKey(x: number, y: number): CellKey {
    return `${x},${y}`;
}

export function getHexDistance(a: HexCoordinate, b: HexCoordinate): number {
    return (
        (Math.abs(a.x - b.x) +
            Math.abs(a.y - b.y) +
            Math.abs(a.x + a.y - (b.x + b.y))) /
        2
    );
}

export function isCellWithinPlacementRadius(
    placedCells: readonly HexCoordinate[],
    candidate: HexCoordinate,
    radius = PLACE_CELL_HEX_RADIUS,
): boolean {
    if (placedCells.length === 0) {
        return true;
    }

    return placedCells.some(
        (cell) => getHexDistance(cell, candidate) <= radius,
    );
}

export const zGameState = z.object({
    cells: z.array(zBoardCell),
    winner: zGameWinner.nullable(),
    playerTiles: z.record(z.string(), zPlayerTileConfig),
    currentTurnPlayerId: zIdentifier.nullable(),
    placementsRemaining: z.number().int().nonnegative(),
    turnCount: z.number().int().nonnegative(),
    currentTurnExpiresInMs: z.number().int().nonnegative().nullable(),
    playerTimeRemainingMs: z.record(z.string(), z.number().int().nonnegative()),
});
export type GameState = z.infer<typeof zGameState>;
export type Game = {
    history: GameState[];
    currentStateIndex: number;
};

export const zBoardState = zGameState;
export type BoardState = GameState;

export const zSandboxPositionId = z
    .string()
    .trim()
    .regex(/^[a-z0-9]{7}$/i);
export type SandboxPositionId = z.infer<typeof zSandboxPositionId>;

export const zSandboxPositionName = z.string().trim().min(1).max(80);
export type SandboxPositionName = z.infer<typeof zSandboxPositionName>;

export const zSandboxPlayerSlot = z.enum([`player-1`, `player-2`]);
export type SandboxPlayerSlot = z.infer<typeof zSandboxPlayerSlot>;

export const zSandboxPositionCell = z.object({
    x: zCoordinate,
    y: zCoordinate,
    player: zSandboxPlayerSlot,
    moveId: z.number().int().positive(),
});
export type SandboxPositionCell = z.infer<typeof zSandboxPositionCell>;

export const zSandboxGamePosition = z.object({
    cells: z.array(zSandboxPositionCell),
    currentTurnPlayer: zSandboxPlayerSlot,
    placementsRemaining: z.number().int().min(1).max(2),
});
export type SandboxGamePosition = z.infer<typeof zSandboxGamePosition>;

export type ApplyGameMoveParams = {
    playerId: string;
    x: number;
    y: number;
};

export type ApplyGameMoveResult = {
    turnCompleted: boolean;
};

export function createEmptyGameState(): GameState {
    return {
        cells: [],
        winner: null,
        playerTiles: {},
        currentTurnPlayerId: null,
        placementsRemaining: 0,
        turnCount: 0,
        currentTurnExpiresInMs: null,
        playerTimeRemainingMs: {},
    };
}

export function cloneGameState(gameState: GameState): GameState {
    return {
        ...gameState,
        cells: gameState.cells.map((cell) => ({ ...cell })),
        winner: gameState.winner
            ? {
                  ...gameState.winner,
                  cells: gameState.winner.cells.map((cell) => ({ ...cell })),
              }
            : null,
        playerTiles: Object.fromEntries(
            Object.entries(gameState.playerTiles).map(
                ([playerId, playerTileConfig]) => [
                    playerId,
                    { ...playerTileConfig },
                ],
            ),
        ),
        playerTimeRemainingMs: { ...gameState.playerTimeRemainingMs },
    };
}

export function createStartedGameState(
    playerIds: readonly string[],
    startingPlayerId: string | null,
): GameState {
    const gameState = createEmptyGameState();
    initializeGameState(gameState, playerIds, startingPlayerId);
    return gameState;
}

export function initializeGameState(
    gameState: GameState,
    playerIds: readonly string[],
    startingPlayerId: string | null,
): void {
    gameState.cells = [];
    gameState.winner = null;
    gameState.playerTiles = buildPlayerTileConfigMap(playerIds);
    gameState.turnCount = 0;
    gameState.currentTurnExpiresInMs = null;
    gameState.playerTimeRemainingMs = {};

    const resolvedStartingPlayerId =
        startingPlayerId && playerIds.includes(startingPlayerId)
            ? startingPlayerId
            : (playerIds[0] ?? null);
    setCurrentTurn(gameState, resolvedStartingPlayerId, 1);
}

export function getPublicGameState(gameState: GameState): GameState {
    return {
        ...cloneGameState(gameState),
        cells: [...gameState.cells],
    };
}

export function applyGameMove(
    gameState: GameState,
    params: ApplyGameMoveParams,
): ApplyGameMoveResult {
    const { playerId, x, y } = params;

    if (gameState.currentTurnPlayerId !== playerId) {
        throw new GameRuleError(`It is not your turn`);
    }

    if (gameState.placementsRemaining <= 0) {
        throw new GameRuleError(`No placements remaining this turn`);
    }

    if (gameState.winner) {
        throw new GameRuleError(`Encountered moves after a winning game state`);
    }

    const cellKey = getCellKey(x, y);
    const isOccupied = gameState.cells.some(
        (cell) => getCellKey(cell.x, cell.y) === cellKey,
    );
    if (isOccupied) {
        throw new GameRuleError(`Cell is already occupied`);
    }

    if (gameState.cells.length === 0 && (x !== 0 || y !== 0)) {
        throw new GameRuleError(`First placement must be at the origin`);
    }

    if (!isCellWithinPlacementRadius(gameState.cells, { x, y })) {
        throw new GameRuleError(
            `Cell must be within ${PLACE_CELL_HEX_RADIUS} hexes of an existing placed cell`,
        );
    }

    const turnCompleted = gameState.placementsRemaining === 1;
    const playerIds = Object.keys(gameState.playerTiles);

    gameState.cells.push({
        x,
        y,
        occupiedBy: zCellOccupant.parse(playerId),
    });
    gameState.placementsRemaining -= 1;
    gameState.turnCount = getCompletedTurnCount(gameState.cells.length);

    const winningLine = findWinningLine(gameState, playerId, x, y);
    if (winningLine) {
        gameState.winner = {
            cells: winningLine,
            playerId,
        };
    }

    if (turnCompleted) {
        const currentPlayerIndex = playerIds.findIndex(
            (existingPlayerId) => existingPlayerId === playerId,
        );
        const nextPlayerIndex = currentPlayerIndex === 0 ? 1 : 0;
        setCurrentTurn(gameState, playerIds[nextPlayerIndex] ?? playerId, 2);
    }

    return {
        turnCompleted,
    };
}

export function getCompletedTurnCount(moveCount: number): number {
    if (moveCount <= 0) {
        return 0;
    }

    return 1 + Math.floor((moveCount - 1) / 2);
}

function setCurrentTurn(
    gameState: GameState,
    playerId: string | null,
    placementsRemaining: number,
): void {
    gameState.currentTurnPlayerId = playerId;
    gameState.placementsRemaining = playerId ? placementsRemaining : 0;
    if (!playerId) {
        gameState.currentTurnExpiresInMs = null;
    }
}

function findWinningLine(
    gameState: GameState,
    playerId: string,
    x: number,
    y: number,
): HexCoordinate[] | null {
    const occupiedCells = new Set(
        gameState.cells
            .filter((cell) => cell.occupiedBy === playerId)
            .map((cell) => getCellKey(cell.x, cell.y)),
    );
    const directions: [number, number][] = [
        [1, 0],
        [0, 1],
        [1, -1],
    ];

    for (const [directionX, directionY] of directions) {
        const backwardCells = collectConnectedTiles(
            occupiedCells,
            x,
            y,
            -directionX,
            -directionY,
        ).reverse();
        const forwardCells = collectConnectedTiles(
            occupiedCells,
            x,
            y,
            directionX,
            directionY,
        );
        const line = [...backwardCells, { x, y }, ...forwardCells];

        if (line.length >= WINNING_LINE_LENGTH) {
            return selectWinningLineSegment(line, backwardCells.length);
        }
    }

    return null;
}

function collectConnectedTiles(
    occupiedCells: Set<string>,
    startX: number,
    startY: number,
    directionX: number,
    directionY: number,
): HexCoordinate[] {
    const connectedTiles: HexCoordinate[] = [];
    let currentX = startX + directionX;
    let currentY = startY + directionY;

    while (occupiedCells.has(getCellKey(currentX, currentY))) {
        connectedTiles.push({ x: currentX, y: currentY });
        currentX += directionX;
        currentY += directionY;
    }

    return connectedTiles;
}

function selectWinningLineSegment(
    line: readonly HexCoordinate[],
    pivotIndex: number,
): HexCoordinate[] {
    const minStartIndex = Math.max(0, pivotIndex - (WINNING_LINE_LENGTH - 1));
    const maxStartIndex = Math.min(
        pivotIndex,
        line.length - WINNING_LINE_LENGTH,
    );
    const preferredStartIndex =
        pivotIndex - Math.floor((WINNING_LINE_LENGTH - 1) / 2);
    const startIndex = Math.min(
        maxStartIndex,
        Math.max(minStartIndex, preferredStartIndex),
    );

    return line.slice(startIndex, startIndex + WINNING_LINE_LENGTH);
}

export const zLobbyListParticipant = z.object({
    displayName: z.string(),
    profileId: zIdentifier.nullable(),
    elo: z.number().int(),
});
export type LobbyListParticipant = z.infer<typeof zLobbyListParticipant>;

export const zLobbyInfo = z.object({
    id: zIdentifier,
    players: z.array(zLobbyListParticipant).default([]),

    timeControl: zGameTimeControl,
    rated: z.boolean().default(false),

    createdAt: zTimestamp,
    startedAt: zTimestamp.nullable(),
});
export type LobbyInfo = z.infer<typeof zLobbyInfo>;

export const zSessionChat = z.object({
    messages: z.array(zSessionChatMessage).default([]),
    displayNames: z.record(z.string(), z.string()),
});
export type SessionChat = z.infer<typeof zSessionChat>;

export const zPlayerRating = z.object({
    eloScore: z.number(),
    gameCount: z.number().nonnegative(),
});
export type PlayerRating = z.infer<typeof zPlayerRating>;

export const zPlayerRatingAdjustment = z.object({
    eloGain: z.number(),
    eloLoss: z.number(),
});
export type PlayerRatingAdjustment = z.infer<typeof zPlayerRatingAdjustment>;

export const zSessionPlayer = z.object({
    id: zIdentifier,
    connection: zPlayerConnection,

    displayName: z.string(),
    profileId: zIdentifier.nullable(),

    rating: zPlayerRating,
    ratingAdjustment: zPlayerRatingAdjustment.nullable().default(null),
});
export type SessionPlayer = z.infer<typeof zSessionPlayer>;

export const zSessionSpectator = z.object({
    id: zIdentifier,
    displayName: z.string(),
    profileId: zIdentifier.nullable(),
});
export type SessionSpectator = z.infer<typeof zSessionSpectator>;

export const zSessionState = z.discriminatedUnion(`status`, [
    z.object({
        status: z.literal(`lobby`),

        createdAt: zTimestamp,
    }),
    z.object({
        status: z.literal(`in-game`),

        drawRequest: zIdentifier.nullable(),
        drawRequestAvailableAfterTurn: z.number().int().nonnegative(),

        createdAt: zTimestamp,
        startedAt: zTimestamp,
        gameId: zIdentifier,
    }),
    z.object({
        status: z.literal(`finished`),

        createdAt: zTimestamp,
        startedAt: zTimestamp,
        finishedAt: zTimestamp,
        gameId: zIdentifier,
        finishReason: zSessionFinishReason,
        winningPlayerId: zIdentifier.nullable(),
        rematchAcceptedPlayerIds: z.array(zIdentifier),
    }),
]);
export type SessionState = z.infer<typeof zSessionState>;
export type SessionStateFinished = Extract<
    SessionState,
    { status: `finished` }
>;

export const zSessionId = zIdentifier.min(1).brand(`SessionId`);
export type SessionId = z.infer<typeof zSessionId>;

export const zSessionInfo = z.object({
    id: zSessionId,
    gameOptions: zLobbyOptions,

    players: z.array(zSessionPlayer),
    spectators: z.array(zSessionSpectator),

    chat: zSessionChat,
    state: zSessionState,
    tournament: zSessionTournamentInfo.nullable().default(null),
});
export type SessionInfo = z.infer<typeof zSessionInfo>;

export const zGameMove = z.object({
    moveNumber: z.number().int().nonnegative(),
    playerId: zIdentifier,
    x: zCoordinate,
    y: zCoordinate,
    timestamp: zTimestamp,
});
export type GameMove = z.infer<typeof zGameMove>;

export const zDatabaseGamePlayer = z.object({
    playerId: zIdentifier,
    displayName: z.string(),
    profileId: zIdentifier,
    elo: z.number().int().nullable().default(null),
    eloChange: z.number().int().nullable().default(null),
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
    gameResult: zDatabaseGameResult.nullable(),
    tournament: zFinishedGameTournamentInfo.nullable().default(null),
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
    gameResult: zDatabaseGameResult.nullable(),
    tournament: zFinishedGameTournamentInfo.nullable().default(null),
});
export type FinishedGameSummary = z.infer<typeof zFinishedGameSummary>;

export const zFinishedGameRecord = zFinishedGameSummary.extend({
    moves: z.array(zGameMove),
});
export type FinishedGameRecord = z.infer<typeof zFinishedGameRecord>;

export const zFinishedGamesPagination = z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalGames: z.number().int().nonnegative(),
    totalMoves: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
    baseTimestamp: zTimestamp,
});
export type FinishedGamesPagination = z.infer<typeof zFinishedGamesPagination>;

export const zFinishedGamesPage = z.object({
    games: z.array(zFinishedGameSummary),
    pagination: zFinishedGamesPagination,
});
export type FinishedGamesPage = z.infer<typeof zFinishedGamesPage>;

export const zPosition = z.object({
    x: zCoordinate,
    y: zCoordinate,
});
export type Position = z.infer<typeof zPosition>;

export const zSize = z.object({
    width: z.number(),
    height: z.number(),
});
export type Size = z.infer<typeof zSize>;

export const zPlayer = z.object({
    id: zIdentifier,
    name: z.string().optional(),
    position: zPosition.optional(),
    color: z.string().optional(),
});
export type Player = z.infer<typeof zPlayer>;

export const zNormalizedUsername = z
    .string()
    .transform((username) => username.trim().replace(/\s+/g, ` `))
    .refine((username) => username.length >= 2 && username.length <= 32, {
        message: `Your username must be between 2 and 32 characters long.`,
    })
    .refine((username) => !/[\p{C}]/u.test(username), {
        message: `Your username contains unsupported characters.`,
    });

export const zAccountEloHistoryPoint = z.object({
    timestamp: zTimestamp,
    elo: z.number().int().nonnegative(),
});
export type AccountEloHistoryPoint = z.infer<typeof zAccountEloHistoryPoint>;

export const zAccountEloHistory = z.object({
    bucketSizeMs: z.number().int().positive(),
    points: z.array(zAccountEloHistoryPoint),
});
export type AccountEloHistory = z.infer<typeof zAccountEloHistory>;

export const zAccountStatistics = z.object({
    totalGames: z.object({
        played: z.number().int().nonnegative(),
        won: z.number().int().nonnegative(),
    }),
    rankedGames: z.object({
        played: z.number().int().nonnegative(),
        won: z.number().int().nonnegative(),
        currentWinStreak: z.number().int().nonnegative(),
        longestWinStreak: z.number().int().nonnegative(),
    }),
    longestGamePlayedMs: z.number().int().nonnegative(),
    longestGameByMoves: z.number().int().nonnegative(),
    totalMovesMade: z.number().int().nonnegative(),
    eloHistory: zAccountEloHistory,
    elo: z.number().int().nonnegative(),
    worldRank: z.number().int().positive().nullable(),
});
export type AccountStatistics = z.infer<typeof zAccountStatistics>;

export const zBoardThemeId = z.string().brand("theme");
export type BoardThemeId = z.infer<typeof zBoardThemeId>;

export const kBoardThemeNormal = `normal` as BoardThemeId;
export const kBoardThemeMarker = `marker` as BoardThemeId;
export const kBoardThemeBlackAndWhite = `black-and-white` as BoardThemeId;
export const kBoardThemeOmok = `omok` as BoardThemeId;

export const zAccountPreferences = z.object({
    moveConfirmation: z.boolean(),
    autoPlaceOriginTile: z.boolean(),
    boardTheme: zBoardThemeId,
    zenModeInGame: z.boolean(),
    allowSelfJoinCasualGames: z.boolean(),
    changelogReadAt: z.number().int().nonnegative().nullable(),
});
export type AccountPreferences = z.infer<typeof zAccountPreferences>;

export const kDefaultAccountPreferences: AccountPreferences = {
    moveConfirmation: false,
    autoPlaceOriginTile: false,
    boardTheme: `normal` as BoardThemeId,
    zenModeInGame: false,
    allowSelfJoinCasualGames: false,
    changelogReadAt: null,
};

export const zAccountProfile = z.object({
    id: zIdentifier,
    username: z.string(),
    email: z.string().nullable(),
    image: z.string().nullable(),
    role: zUserRole,
    permissions: z.array(zAccountPermission).default([]),
    registeredAt: zTimestamp,
    lastActiveAt: zTimestamp,
});
export type AccountProfile = z.infer<typeof zAccountProfile>;

export const zPublicAccountProfile = zAccountProfile.omit({
    email: true,
});
export type PublicAccountProfile = z.infer<typeof zPublicAccountProfile>;

export const zAdminStatGameBase = z.object({
    gameId: zIdentifier,
    sessionId: zIdentifier,
    players: z.array(z.string()),
    finishedAt: zTimestamp,
});
export type AdminStatGameBase = z.infer<typeof zAdminStatGameBase>;

export const zAdminLongestGameInMoves = zAdminStatGameBase.extend({
    moveCount: z.number().int().nonnegative(),
});
export type AdminLongestGameInMoves = z.infer<typeof zAdminLongestGameInMoves>;

export const zAdminLongestGameInDuration = zAdminStatGameBase.extend({
    durationMs: z.number().int().nonnegative(),
});
export type AdminLongestGameInDuration = z.infer<
    typeof zAdminLongestGameInDuration
>;

export const zAdminStatsWindow = z.object({
    startAt: zTimestamp,
    endAt: zTimestamp,
    siteVisits: z.number().int().nonnegative(),
    gamesPlayed: z.number().int().nonnegative(),
    timePlayedMs: z.number().int().nonnegative(),
    longestGameInMoves: zAdminLongestGameInMoves.nullable(),
    longestGameInDuration: zAdminLongestGameInDuration.nullable(),
});
export type AdminStatsWindow = z.infer<typeof zAdminStatsWindow>;

export const zAdminUserStatsWindow = z.object({
    startAt: zTimestamp,
    endAt: zTimestamp,
    newUsers: z.number().int().nonnegative(),
    activeUsers: z.number().int().nonnegative(),
});
export type AdminUserStatsWindow = z.infer<typeof zAdminUserStatsWindow>;

export const zAdminTimelineRange = z.enum([`24h`, `7d`, `14d`, `30d`]);
export type AdminTimelineRange = z.infer<typeof zAdminTimelineRange>;
export const ADMIN_TIMELINE_WINDOWS = {
    '24h': { durationMs: 24 * 60 * 60 * 1000, bucketSizeMs: 5 * 60 * 1000 },
    '7d': { durationMs: 7 * 24 * 60 * 60 * 1000, bucketSizeMs: 10 * 60 * 1000 },
    '14d': { durationMs: 14 * 24 * 60 * 60 * 1000, bucketSizeMs: 60 * 60 * 1000 },
    '30d': { durationMs: 30 * 24 * 60 * 60 * 1000, bucketSizeMs: 60 * 60 * 1000 },
} satisfies Record<AdminTimelineRange, { durationMs: number; bucketSizeMs: number }>;

export const zAdminActiveGamesTimelinePoint = z.object({
    timestamp: zTimestamp,
    activeGames: z.number().int().nonnegative(),
});
export type AdminActiveGamesTimelinePoint = z.infer<
    typeof zAdminActiveGamesTimelinePoint
>;

export const zAdminActiveGamesTimeline = z.object({
    startAt: zTimestamp,
    endAt: zTimestamp,
    bucketSizeMs: z.number().int().positive(),
    points: z.array(zAdminActiveGamesTimelinePoint),
});
export type AdminActiveGamesTimeline = z.infer<
    typeof zAdminActiveGamesTimeline
>;

export const zLeaderboardPlayer = z.object({
    profileId: zIdentifier,
    displayName: z.string(),
    image: z.string().nullable(),
    elo: z.number().int().nonnegative(),
    gamesPlayed: z.number().int().nonnegative(),
    gamesWon: z.number().int().nonnegative(),
});
export type LeaderboardPlayer = z.infer<typeof zLeaderboardPlayer>;

export const zLeaderboardPlacement = zLeaderboardPlayer.extend({
    rank: z.number().int().positive(),
});
export type LeaderboardPlacement = z.infer<typeof zLeaderboardPlacement>;

export const zLeaderboard = z.object({
    generatedAt: zTimestamp,
    nextRefreshAt: zTimestamp,
    refreshIntervalMs: z.number().int().positive(),

    players: z.array(zLeaderboardPlayer),
    ownPlacement: zLeaderboardPlacement.nullable(),
});
export type Leaderboard = z.infer<typeof zLeaderboard>;
