import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import type { Collection, Document } from 'mongodb';
import {
    buildPlayerTileConfigMap,
    type AdminLongestGameInDuration,
    type AdminLongestGameInMoves,
    type DatabaseGame,
    type DatabaseGamePlayer,
    type DatabaseGameResult,
    DEFAULT_LOBBY_OPTIONS,
    type FinishedGameRecord,
    type FinishedGameSummary,
    type FinishedGamesPage,
    type GameMove,
    type LobbyOptions,
    type PlayerTileConfig,
    zDatabaseGame,
    zDatabaseGamePlayer,
    zDatabaseGameResult,
    zFinishedGameRecord,
    zFinishedGamesPage,
    zFinishedGameSummary,
    zGameMove,
    zLobbyOptions,
    zSessionFinishReason,
} from '@ih3t/shared';
import { z } from 'zod';
import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';

const zGameHistoryDocument = zDatabaseGame;
type GameHistoryDocument = z.infer<typeof zGameHistoryDocument> & Document;

const zVersion2GameHistoryDocument = z.object({
    _id: z.unknown().optional(),
    id: z.string(),
    version: z.literal(2),
    sessionId: z.string(),
    startedAt: z.number().int(),
    finishedAt: z.number().int().nullable(),
    players: z.array(zDatabaseGamePlayer),
    gameOptions: zLobbyOptions,
    moves: z.array(zGameMove),
    moveCount: z.number().int().nonnegative(),
    gameResult: zDatabaseGameResult.nullable(),
    playerTiles: z.record(z.string(), z.object({
        color: z.string()
    })).optional()
});
type Version2GameHistoryDocument = z.infer<typeof zVersion2GameHistoryDocument> & Document;

const zLegacyGameHistoryDocument = z.object({
    _id: z.unknown().optional(),
    id: z.string(),
    sessionId: z.string(),
    state: z.enum(['lobby', 'in-game', 'finished']).optional(),
    players: z.array(z.string()).optional(),
    playerNames: z.record(z.string(), z.string()).optional(),
    playerProfileIds: z.record(z.string(), z.string().nullable()).optional(),
    winningPlayerId: z.string().nullable().optional(),
    reason: zSessionFinishReason.nullable().optional(),
    moveCount: z.number().int().nonnegative().optional(),
    moves: z.array(zGameMove).optional(),
    createdAt: z.number().int().optional(),
    startedAt: z.number().int().nullable().optional(),
    finishedAt: z.number().int().nullable().optional(),
    gameDurationMs: z.number().int().nonnegative().nullable().optional(),
    updatedAt: z.number().int().optional(),
    gameOptions: zLobbyOptions.optional(),
    playerTiles: z.record(z.string(), z.object({
        color: z.string()
    })).optional(),
});
type LegacyGameHistoryDocument = z.infer<typeof zLegacyGameHistoryDocument> & Document;

interface ListFinishedGamesOptions {
    page?: number;
    pageSize?: number;
    baseTimestamp?: number;
    playerProfileId?: string;
}

export interface GameHistoryAdminWindowStats {
    gamesPlayed: number;
    timePlayedMs: number;
    longestGameInMoves: AdminLongestGameInMoves | null;
    longestGameInDuration: AdminLongestGameInDuration | null;
}

export interface PlayerLeaderboardStats {
    profileId: string;
    displayName: string;
    gamesPlayed: number;
    gamesWon: number;
    winRatio: number;
}

export interface PlayerProfileStatistics {
    profileId: string;
    totalGamesPlayed: number;
    totalGamesWon: number;
    rankedGamesPlayed: number;
    rankedGamesWon: number;
    totalMovesMade: number;
}

const mongoDbName = process.env.MONGODB_DB_NAME ?? 'ih3t';
const mongoCollectionName = process.env.MONGODB_GAME_HISTORY_COLLECTION ?? 'gameHistory';
const maxTrackedGameDurationMs = 8 * 60 * 60 * 1000;

@injectable()
export class GameHistoryRepository {
    private collectionPromise: Promise<Collection<GameHistoryDocument>> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase
    ) {
        this.logger = rootLogger.child({ component: 'game-history-repository' });
    }

    async createGame(
        sessionId: string,
        players: DatabaseGamePlayer[],
        playerTiles: Record<string, PlayerTileConfig>,
        gameOptions: LobbyOptions
    ): Promise<string> {
        const collection = await this.getCollection();
        const gameId = randomUUID();
        const startedAt = Date.now();

        try {
            await collection.insertOne({
                id: gameId,
                version: 3,

                sessionId,
                startedAt,
                finishedAt: null,
                players,
                playerTiles: this.clonePlayerTiles(playerTiles),
                gameOptions,
                moves: [],
                moveCount: 0,
                gameResult: null
            });
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-create-error',
                storage: 'mongodb',
                gameId,
                sessionId
            }, 'Failed to create game history');
        }

        return gameId;
    }

    async appendMove(gameId: string, move: GameMove): Promise<void> {
        const collection = await this.getCollection();

        try {
            const result = await collection.updateOne(
                { id: gameId },
                {
                    $push: {
                        moves: move
                    } as never,
                    $inc: {
                        moveCount: 1
                    }
                }
            );

            if (result.matchedCount === 0) {
                this.logMissingHistory('game-history-move-error', gameId, {
                    moveNumber: move.moveNumber
                });
            }
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-move-error',
                storage: 'mongodb',
                gameId,
                moveNumber: move.moveNumber
            }, 'Failed to append game move');
        }
    }

    async finishGame(gameId: string, result: DatabaseGameResult): Promise<void> {
        const collection = await this.getCollection();
        const finishedAt = Date.now();

        try {
            const updateResult = await collection.updateOne(
                { id: gameId },
                {
                    $set: {
                        finishedAt,
                        gameResult: {
                            winningPlayerId: result.winningPlayerId,
                            durationMs: result.durationMs,
                            reason: result.reason
                        }
                    }
                }
            );

            if (updateResult.matchedCount === 0) {
                this.logMissingHistory('game-history-finalize-error', gameId);
            }
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-finalize-error',
                storage: 'mongodb',
                gameId
            }, 'Failed to finalize game history');
        }
    }

    async updatePlayerEloChanges(gameId: string, playerEloChanges: Map<string, number>): Promise<void> {
        if (playerEloChanges.size === 0) {
            return;
        }

        const collection = await this.getCollection();
        const setEntries = Array.from(playerEloChanges.values()).map((eloChange, index) => [
            `players.$[player${index}].eloChange`,
            eloChange
        ] as const);

        try {
            const updateResult = await collection.updateOne(
                { id: gameId },
                {
                    $set: Object.fromEntries(setEntries)
                },
                {
                    arrayFilters: Array.from(playerEloChanges.keys()).map((playerId, index) => ({
                        [`player${index}.playerId`]: playerId
                    }))
                }
            );

            if (updateResult.matchedCount === 0) {
                this.logMissingHistory('game-history-elo-update-error', gameId);
            }
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-elo-update-error',
                storage: 'mongodb',
                gameId
            }, 'Failed to update stored player elo changes');
        }
    }

    async listFinishedGames(options: ListFinishedGamesOptions = {}): Promise<FinishedGamesPage> {
        const collection = await this.getCollection();
        const pageSize = this.normalizePageSize(options.pageSize);
        const baseTimestamp = this.normalizeBaseTimestamp(options.baseTimestamp);
        const requestedPage = this.normalizePage(options.page);
        const matchStage = this.buildFinishedGamesMatch(baseTimestamp, options.playerProfileId);
        const aggregationResult = await collection.aggregate<{
            games: GameHistoryDocument[];
            totals: Array<{ totalGames: number; totalMoves: number }>;
        }>([
            {
                $match: matchStage
            },
            { $sort: { finishedAt: -1, id: -1 } },
            {
                $facet: {
                    games: [
                        { $skip: (requestedPage - 1) * pageSize },
                        { $limit: pageSize }
                    ],
                    totals: [
                        {
                            $group: {
                                _id: null,
                                totalGames: { $sum: 1 },
                                totalMoves: { $sum: '$moveCount' }
                            }
                        }
                    ]
                }
            }
        ]).toArray();
        const facetResult = aggregationResult[0] ?? { games: [], totals: [] };
        const totalGames = facetResult.totals[0]?.totalGames ?? 0;
        const totalMoves = facetResult.totals[0]?.totalMoves ?? 0;
        const totalPages = Math.max(1, Math.ceil(totalGames / pageSize));
        const page = Math.min(requestedPage, totalPages);
        const games = page === requestedPage
            ? facetResult.games
            : await collection
                .find(matchStage)
                .sort({ finishedAt: -1, id: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .toArray();

        return zFinishedGamesPage.parse({
            games: games.map((document) => this.mapSummary(document)),
            pagination: {
                page,
                pageSize,
                totalGames,
                totalMoves,
                totalPages,
                baseTimestamp
            }
        });
    }

    async getFinishedGame(id: string): Promise<FinishedGameRecord | undefined> {
        const collection = await this.getCollection();
        const document = await collection.findOne({
            id,
            finishedAt: {
                $ne: null
            }
        });

        if (!document) {
            return undefined;
        }

        return this.mapRecord(document);
    }

    async getAdminWindowStats(startAt: number, endAt: number): Promise<GameHistoryAdminWindowStats> {
        const collection = await this.getCollection();
        const finishedGameMatch = {
            finishedAt: {
                $ne: null,
                $gte: startAt,
                $lte: endAt
            }
        };

        const [gamesPlayed, timePlayedResult, longestGameInMovesDocument, longestGameInDurationDocument] = await Promise.all([
            collection.countDocuments(finishedGameMatch),
            collection.aggregate<{ timePlayedMs: number }>([
                {
                    $match: finishedGameMatch
                },
                {
                    $group: {
                        _id: null,
                        timePlayedMs: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ['$gameResult.durationMs', null] },
                                            { $lt: ['$gameResult.durationMs', maxTrackedGameDurationMs] }
                                        ]
                                    },
                                    '$gameResult.durationMs',
                                    0
                                ]
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        timePlayedMs: 1
                    }
                }
            ]).next(),
            collection.find(finishedGameMatch).sort({ moveCount: -1, finishedAt: -1, id: 1 }).limit(1).next(),
            collection.find({
                ...finishedGameMatch,
                'gameResult.durationMs': {
                    $ne: null,
                    $lt: maxTrackedGameDurationMs
                }
            }).sort({ 'gameResult.durationMs': -1, finishedAt: -1, id: 1 }).limit(1).next()
        ]);

        return {
            gamesPlayed,
            timePlayedMs: timePlayedResult?.timePlayedMs ?? 0,
            longestGameInMoves: longestGameInMovesDocument
                ? this.mapAdminLongestGameInMoves(longestGameInMovesDocument)
                : null,
            longestGameInDuration: longestGameInDurationDocument
                ? this.mapAdminLongestGameInDuration(longestGameInDurationDocument)
                : null
        };
    }

    async getLeaderboardProfileIds(): Promise<string[]> {
        const collection = await this.getCollection();
        const players = await collection.aggregate<{ profileId: string }>([
            ...this.createPlayerLeaderboardStatsPipeline(),
            this.createPlayerLeaderboardSortStage(),
            {
                $project: {
                    _id: 0,
                    profileId: 1
                }
            },
        ]).toArray();

        return players.map((player) => player.profileId);
    }

    async getPlayerLeaderboardStatsForPlayers(
        profileIds: string[],
        options: { ratedOnly: boolean }
    ): Promise<Map<string, PlayerLeaderboardStats>> {
        const uniqueProfileIds = Array.from(new Set(profileIds.filter((profileId) => profileId.trim().length > 0)));
        if (uniqueProfileIds.length === 0) {
            return new Map();
        }

        const collection = await this.getCollection();
        const players = await collection.aggregate<PlayerLeaderboardStats>([
            ...this.createPlayerLeaderboardStatsPipeline(options),
            {
                $match: {
                    profileId: {
                        $in: uniqueProfileIds
                    }
                }
            }
        ]).toArray();

        return new Map(
            players.map((player) => [player.profileId, this.normalizePlayerLeaderboardStats(player)] as const)
        );
    }

    async getPlayerProfileStatistics(profileId: string): Promise<PlayerProfileStatistics> {
        const normalizedProfileId = profileId.trim();
        if (normalizedProfileId.length === 0) {
            return this.createEmptyPlayerProfileStatistics(profileId);
        }

        const collection = await this.getCollection();
        const [stats] = await collection.aggregate<Omit<PlayerProfileStatistics, 'profileId'>>([
            {
                $match: {
                    finishedAt: {
                        $ne: null
                    },
                    'players.profileId': normalizedProfileId
                }
            },
            {
                $set: {
                    matchedPlayer: {
                        $first: {
                            $filter: {
                                input: '$players',
                                as: 'player',
                                cond: {
                                    $eq: ['$$player.profileId', normalizedProfileId]
                                }
                            }
                        }
                    }
                }
            },
            {
                $match: {
                    'matchedPlayer.playerId': {
                        $exists: true
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    isRated: {
                        $eq: ['$gameOptions.rated', true]
                    },
                    gameWon: {
                        $cond: [
                            { $eq: ['$gameResult.winningPlayerId', '$matchedPlayer.playerId'] },
                            1,
                            0
                        ]
                    },
                    playerMoveCount: {
                        $size: {
                            $filter: {
                                input: '$moves',
                                as: 'move',
                                cond: {
                                    $eq: ['$$move.playerId', '$matchedPlayer.playerId']
                                }
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalGamesPlayed: { $sum: 1 },
                    totalGamesWon: { $sum: '$gameWon' },
                    rankedGamesPlayed: {
                        $sum: {
                            $cond: ['$isRated', 1, 0]
                        }
                    },
                    rankedGamesWon: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        '$isRated',
                                        { $eq: ['$gameWon', 1] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    totalMovesMade: { $sum: '$playerMoveCount' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalGamesPlayed: 1,
                    totalGamesWon: 1,
                    rankedGamesPlayed: 1,
                    rankedGamesWon: 1,
                    totalMovesMade: 1
                }
            }
        ]).toArray();

        return {
            profileId: normalizedProfileId,
            totalGamesPlayed: stats?.totalGamesPlayed ?? 0,
            totalGamesWon: stats?.totalGamesWon ?? 0,
            rankedGamesPlayed: stats?.rankedGamesPlayed ?? 0,
            rankedGamesWon: stats?.rankedGamesWon ?? 0,
            totalMovesMade: stats?.totalMovesMade ?? 0
        };
    }

    private async getCollection(): Promise<Collection<GameHistoryDocument>> {
        if (this.collectionPromise !== null) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            const collection = database.collection<GameHistoryDocument>(mongoCollectionName);
            await collection.createIndex({ id: 1 }, { unique: true });
            await collection.createIndex({ finishedAt: -1, id: -1 });
            await collection.createIndex({ sessionId: 1, finishedAt: -1 });
            await collection.createIndex({ 'players.profileId': 1, finishedAt: -1, id: -1 });
            await this.migrateExistingGames(collection);

            this.logger.info({
                type: 'game-history',
                event: 'game-history-storage-ready',
                storage: 'mongodb',
                database: mongoDbName,
                collection: mongoCollectionName
            }, 'Game history storage ready');

            return collection;
        })().catch((error: unknown) => {
            this.collectionPromise = null;

            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-storage-error',
                storage: 'mongodb',
            }, 'Failed to initialize game history storage');

            throw error;
        });

        return this.collectionPromise;
    }

    private mapSummary(document: unknown): FinishedGameSummary {
        const parsedDocument = zGameHistoryDocument.parse(document);

        return zFinishedGameSummary.parse({
            id: parsedDocument.id,
            sessionId: parsedDocument.sessionId,
            startedAt: parsedDocument.startedAt,
            finishedAt: parsedDocument.finishedAt,
            players: parsedDocument.players.map((player) => ({ ...player })),
            playerTiles: this.clonePlayerTiles(parsedDocument.playerTiles),
            gameOptions: this.cloneGameOptions(parsedDocument.gameOptions),
            moveCount: parsedDocument.moveCount,
            gameResult: parsedDocument.gameResult
                ? { ...parsedDocument.gameResult }
                : null
        });
    }

    private mapRecord(document: unknown): FinishedGameRecord {
        const parsedDocument = zGameHistoryDocument.parse(document);

        return zFinishedGameRecord.parse({
            ...this.mapSummary(parsedDocument),
            moves: parsedDocument.moves.map((move) => ({ ...move }))
        });
    }

    private mapAdminLongestGameInMoves(document: unknown): AdminLongestGameInMoves {
        const parsedDocument = zGameHistoryDocument.parse(document);

        return {
            gameId: parsedDocument.id,
            sessionId: parsedDocument.sessionId,
            players: parsedDocument.players.map((player) => player.displayName),
            finishedAt: parsedDocument.finishedAt ?? parsedDocument.startedAt,
            moveCount: parsedDocument.moveCount
        };
    }

    private mapAdminLongestGameInDuration(document: unknown): AdminLongestGameInDuration {
        const parsedDocument = zGameHistoryDocument.parse(document);
        const durationMs = parsedDocument.gameResult?.durationMs;
        if (durationMs === null || durationMs === undefined) {
            throw new Error(`Game ${parsedDocument.id} is missing a duration.`);
        }

        return {
            gameId: parsedDocument.id,
            sessionId: parsedDocument.sessionId,
            players: parsedDocument.players.map((player) => player.displayName),
            finishedAt: parsedDocument.finishedAt ?? parsedDocument.startedAt,
            durationMs
        };
    }

    private async migrateExistingGames(collection: Collection<GameHistoryDocument>): Promise<void> {
        const legacyDocuments = await collection.find({
            $or: [
                { version: { $exists: false } },
                { version: 2 },
                { playerTiles: { $exists: false } }
            ]
        } as Document).toArray();

        if (legacyDocuments.length === 0) {
            return;
        }

        const operations = legacyDocuments.flatMap((document) => {
            const migratedDocument = this.migrateLegacyDocument(document);
            if (!migratedDocument) {
                return [];
            }

            return [{
                replaceOne: {
                    filter: { _id: document._id },
                    replacement: {
                        _id: document._id,
                        ...migratedDocument
                    } as GameHistoryDocument
                }
            }];
        });

        if (operations.length === 0) {
            return;
        }

        await collection.bulkWrite(operations, { ordered: false });
        this.logger.info({
            type: 'game-history',
            event: 'game-history-migration-complete',
            storage: 'mongodb',
            migratedGames: operations.length
        }, 'Migrated legacy game history documents');
    }

    private migrateLegacyDocument(document: unknown): DatabaseGame | null {
        const alreadyMigratedDocument = zGameHistoryDocument.safeParse(document);
        if (alreadyMigratedDocument.success) {
            return alreadyMigratedDocument.data;
        }

        const version2Document = zVersion2GameHistoryDocument.safeParse(document);
        if (version2Document.success) {
            return this.migrateVersion2Document(version2Document.data);
        }

        const legacyDocument = zLegacyGameHistoryDocument.safeParse(document);
        if (!legacyDocument.success) {
            this.logger.warn({
                type: 'game-history',
                event: 'game-history-migration-skipped',
                storage: 'mongodb',
                issues: legacyDocument.error.issues
            }, 'Skipped migrating an invalid game history document');
            return null;
        }

        const parsedDocument = legacyDocument.data;
        const moves = parsedDocument.moves ?? [];
        const startedAt = parsedDocument.startedAt
            ?? parsedDocument.createdAt
            ?? moves[0]?.timestamp
            ?? parsedDocument.updatedAt
            ?? Date.now();
        const finishedAt = parsedDocument.finishedAt ?? null;
        const players = this.mapLegacyPlayers(parsedDocument.players ?? [], parsedDocument);
        const playerTiles = parsedDocument.playerTiles
            ? this.clonePlayerTiles(parsedDocument.playerTiles)
            : buildPlayerTileConfigMap(players.map((player) => player.playerId));
        const moveCount = Math.max(parsedDocument.moveCount ?? 0, moves.length);
        const durationMs = parsedDocument.gameDurationMs
            ?? (finishedAt === null ? null : Math.max(0, finishedAt - startedAt));
        const gameResult = finishedAt === null
            ? null
            : {
                winningPlayerId: parsedDocument.winningPlayerId ?? null,
                durationMs,
                reason: parsedDocument.reason ?? 'terminated'
            } satisfies DatabaseGameResult;

        return zGameHistoryDocument.parse({
            id: parsedDocument.id,
            version: 3,

            sessionId: parsedDocument.sessionId,
            startedAt,
            finishedAt,
            players,
            playerTiles,
            gameOptions: parsedDocument.gameOptions
                ? this.cloneGameOptions(parsedDocument.gameOptions)
                : this.createDefaultGameOptions(),
            moves: moves.map((move) => ({ ...move })),
            moveCount,
            gameResult
        });
    }

    private migrateVersion2Document(document: Version2GameHistoryDocument): DatabaseGame {
        return zGameHistoryDocument.parse({
            id: document.id,
            version: 3,
            sessionId: document.sessionId,
            startedAt: document.startedAt,
            finishedAt: document.finishedAt,
            players: document.players.map((player) => ({ ...player })),
            playerTiles: document.playerTiles
                ? this.clonePlayerTiles(document.playerTiles)
                : buildPlayerTileConfigMap(document.players.map((player) => player.playerId)),
            gameOptions: this.cloneGameOptions(document.gameOptions),
            moves: document.moves.map((move) => ({ ...move })),
            moveCount: document.moveCount,
            gameResult: document.gameResult
                ? { ...document.gameResult }
                : null
        });
    }

    private mapLegacyPlayers(playerIds: string[], document: LegacyGameHistoryDocument): DatabaseGamePlayer[] {
        return playerIds.map((playerId, playerIndex) => ({
            playerId,
            displayName: document.playerNames?.[playerId]?.trim() || `Player ${playerIndex + 1}`,
            profileId: document.playerProfileIds?.[playerId] ?? playerId,
            elo: null,
            eloChange: null
        }));
    }

    private cloneGameOptions(gameOptions: LobbyOptions): LobbyOptions {
        return {
            ...gameOptions,
            timeControl: { ...gameOptions.timeControl }
        };
    }

    private clonePlayerTiles(playerTiles: Record<string, PlayerTileConfig>): Record<string, PlayerTileConfig> {
        return Object.fromEntries(
            Object.entries(playerTiles).map(([playerId, playerTileConfig]) => [playerId, { ...playerTileConfig }])
        );
    }

    private createDefaultGameOptions(): LobbyOptions {
        return this.cloneGameOptions(DEFAULT_LOBBY_OPTIONS);
    }

    private buildFinishedGamesMatch(baseTimestamp: number, playerProfileId?: string) {
        return {
            finishedAt: {
                $ne: null,
                $lte: baseTimestamp
            },
            ...(playerProfileId ? { 'players.profileId': playerProfileId } : {})
        };
    }

    private normalizePageSize(pageSize: number | undefined): number {
        if (!pageSize || !Number.isFinite(pageSize)) {
            return 20;
        }

        return Math.min(100, Math.max(1, Math.floor(pageSize)));
    }

    private normalizePage(page: number | undefined): number {
        if (!page || !Number.isFinite(page)) {
            return 1;
        }

        return Math.max(1, Math.floor(page));
    }

    private normalizeBaseTimestamp(baseTimestamp: number | undefined): number {
        if (!baseTimestamp || !Number.isFinite(baseTimestamp)) {
            return Date.now();
        }

        return Math.max(0, Math.floor(baseTimestamp));
    }

    private createPlayerLeaderboardStatsPipeline(options: { ratedOnly?: boolean } = {}): Document[] {
        return [
            {
                $match: {
                    ...(options.ratedOnly ? { 'gameOptions.rated': true } : {}),
                    finishedAt: {
                        $ne: null
                    },
                }
            },
            {
                $unwind: '$players'
            },
            {
                $match: {
                    'players.profileId': {
                        $ne: null
                    }
                }
            },
            {
                $sort: {
                    finishedAt: -1,
                    id: -1
                }
            },
            {
                $group: {
                    _id: '$players.profileId',
                    profileId: { $first: '$players.profileId' },
                    displayName: { $first: '$players.displayName' },
                    gamesPlayed: { $sum: 1 },
                    gamesWon: {
                        $sum: {
                            $cond: [
                                { $eq: ['$players.playerId', '$gameResult.winningPlayerId'] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    profileId: 1,
                    displayName: 1,
                    gamesPlayed: 1,
                    gamesWon: 1,
                    winRatio: {
                        $cond: [
                            { $eq: ['$gamesPlayed', 0] },
                            0,
                            { $divide: ['$gamesWon', '$gamesPlayed'] }
                        ]
                    }
                }
            }
        ];
    }

    private createPlayerLeaderboardSortStage(): Document {
        return {
            $sort: {
                gamesWon: -1,
                winRatio: -1,
                gamesPlayed: -1,
                displayName: 1,
                profileId: 1
            }
        };
    }

    private normalizePlayerLeaderboardStats(player: PlayerLeaderboardStats): PlayerLeaderboardStats {
        return {
            profileId: player.profileId,
            displayName: player.displayName,
            gamesPlayed: player.gamesPlayed,
            gamesWon: player.gamesWon,
            winRatio: Number(player.winRatio.toFixed(4))
        };
    }

    private createEmptyPlayerProfileStatistics(profileId: string): PlayerProfileStatistics {
        return {
            profileId,
            totalGamesPlayed: 0,
            totalGamesWon: 0,
            rankedGamesPlayed: 0,
            rankedGamesWon: 0,
            totalMovesMade: 0
        };
    }

    private logMissingHistory(event: string, gameId: string, extraDetails: Record<string, unknown> = {}): void {
        this.logger.warn({
            type: 'game-history',
            event,
            storage: 'mongodb',
            gameId,
            ...extraDetails
        }, 'Game history does not exist');
    }
}
