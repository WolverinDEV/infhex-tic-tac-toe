import { randomUUID } from 'node:crypto';

import {
    type AccountEloHistory,
    AccountEloHistoryPoint,
    type AdminLongestGameInDuration,
    type AdminLongestGameInMoves,
    type DatabaseGamePlayer,
    type DatabaseGameResult,
    type FinishedGameTournamentInfo,
    type FinishedGameRecord,
    type FinishedGamesPage,
    type FinishedGameSummary,
    type GameMove,
    type LobbyOptions,
    type PlayerTileConfig,
    zDatabaseGame,
    zFinishedGameRecord,
    zFinishedGamesPage,
    zFinishedGameSummary,
} from '@ih3t/shared';
import type { Collection, Document } from 'mongodb';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';
import { GAME_HISTORY_COLLECTION_NAME } from './mongoCollections';

const zGameHistoryDocument = zDatabaseGame;
type GameHistoryDocument = z.infer<typeof zGameHistoryDocument> & Document;

type ListFinishedGamesOptions = {
    page?: number;
    pageSize?: number;
    baseTimestamp?: number;
    playerProfileId?: string;
};

export type GameHistoryAdminWindowStats = {
    gamesPlayed: number;
    timePlayedMs: number;
    longestGameInMoves: AdminLongestGameInMoves | null;
    longestGameInDuration: AdminLongestGameInDuration | null;
};

export type ActiveGamesTimelinePoint = {
    timestamp: number;
    activeGames: number;
};

export type PlayerLeaderboardStats = {
    profileId: string;
    displayName: string;
    gamesPlayed: number;
    gamesWon: number;
    winRatio: number;
};

export type PlayerProfileStatistics = {
    profileId: string;
    totalGamesPlayed: number;
    totalGamesWon: number;
    rankedGamesPlayed: number;
    rankedGamesWon: number;
    currentRankedWinStreak: number;
    longestRankedWinStreak: number;
    longestGamePlayedMs: number;
    longestGameByMoves: number;
    totalMovesMade: number;
};

const maxTrackedGameDurationMs = 8 * 60 * 60 * 1000;
const accountEloHistoryBucketSizeMs = 60 * 60 * 1000;

@injectable()
export class GameHistoryRepository {
    private collectionPromise: Promise<Collection<GameHistoryDocument>> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase,
    ) {
        this.logger = rootLogger.child({ component: `game-history-repository` });
    }

    async createGame(
        sessionId: string,
        players: DatabaseGamePlayer[],
        playerTiles: Record<string, PlayerTileConfig>,
        gameOptions: LobbyOptions,
        tournament: FinishedGameTournamentInfo | null = null,
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
                gameResult: null,
                tournament: tournament ? { ...tournament } : null,
            });
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: `game-history`,
                event: `game-history-create-error`,
                storage: `mongodb`,
                gameId,
                sessionId,
            }, `Failed to create game history`);
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
                        moves: move,
                    } as never,
                    $inc: {
                        moveCount: 1,
                    },
                },
            );

            if (result.matchedCount === 0) {
                this.logMissingHistory(`game-history-move-error`, gameId, {
                    moveNumber: move.moveNumber,
                });
            }
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: `game-history`,
                event: `game-history-move-error`,
                storage: `mongodb`,
                gameId,
                moveNumber: move.moveNumber,
            }, `Failed to append game move`);
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
                            reason: result.reason,
                        },
                    },
                },
            );

            if (updateResult.matchedCount === 0) {
                this.logMissingHistory(`game-history-finalize-error`, gameId);
            }
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: `game-history`,
                event: `game-history-finalize-error`,
                storage: `mongodb`,
                gameId,
            }, `Failed to finalize game history`);
        }
    }

    async updatePlayerEloChanges(gameId: string, playerEloChanges: Map<string, number>): Promise<void> {
        if (playerEloChanges.size === 0) {
            return;
        }

        const collection = await this.getCollection();
        const setEntries = Array.from(playerEloChanges.values()).map((eloChange, index) => [
            `players.$[player${index}].eloChange`,
            eloChange,
        ] as const);

        try {
            const updateResult = await collection.updateOne(
                { id: gameId },
                {
                    $set: Object.fromEntries(setEntries),
                },
                {
                    arrayFilters: Array.from(playerEloChanges.keys()).map((playerId, index) => ({
                        [`player${index}.playerId`]: playerId,
                    })),
                },
            );

            if (updateResult.matchedCount === 0) {
                this.logMissingHistory(`game-history-elo-update-error`, gameId);
            }
        } catch (error: unknown) {
            this.logger.error(
                {
                    err: error,
                    type: `game-history`,
                    event: `game-history-elo-update-error`,
                    storage: `mongodb`,
                    gameId,
                },
                `Failed to update stored player elo changes`,
            );
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
            totals: { totalGames: number; totalMoves: number }[];
        }>([
            {
                $match: matchStage,
            },
            { $sort: { finishedAt: -1, id: -1 } },
            {
                $facet: {
                    games: [
                        { $skip: (requestedPage - 1) * pageSize },
                        { $limit: pageSize },
                    ],
                    totals: [
                        {
                            $group: {
                                _id: null,
                                totalGames: { $sum: 1 },
                                totalMoves: { $sum: `$moveCount` },
                            },
                        },
                    ],
                },
            },
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
            games: games.map((document) => this.mapSummary(document)).filter(game => !!game),
            pagination: {
                page,
                pageSize,
                totalGames,
                totalMoves,
                totalPages,
                baseTimestamp,
            },
        });
    }

    async getFinishedGame(id: string): Promise<FinishedGameRecord | undefined> {
        const collection = await this.getCollection();
        const document = await collection.findOne({
            id,
            finishedAt: {
                $ne: null,
            },
        });

        if (!document) {
            return undefined;
        }

        return this.mapRecord(document);
    }

    async getFinishedGameBySessionId(sessionId: string): Promise<FinishedGameRecord | undefined> {
        const collection = await this.getCollection();
        const document = await collection.findOne({
            sessionId,
            finishedAt: { $ne: null },
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
                $lte: endAt,
            },
        };

        const [
            gamesPlayed, timePlayedResult, longestGameInMovesDocument, longestGameInDurationDocument,
        ] = await Promise.all([
            collection.countDocuments(finishedGameMatch),
            collection.aggregate<{ timePlayedMs: number }>([
                {
                    $match: finishedGameMatch,
                },
                {
                    $group: {
                        _id: null,
                        timePlayedMs: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: [`$gameResult.durationMs`, null] },
                                            { $lt: [`$gameResult.durationMs`, maxTrackedGameDurationMs] },
                                        ],
                                    },
                                    `$gameResult.durationMs`,
                                    0,
                                ],
                            },
                        },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        timePlayedMs: 1,
                    },
                },
            ]).next(),
            collection.find(finishedGameMatch).sort({ moveCount: -1, finishedAt: -1, id: 1 })
                .limit(1)
                .next(),
            collection.find({
                ...finishedGameMatch,
                'gameResult.durationMs': {
                    $ne: null,
                    $lt: maxTrackedGameDurationMs,
                },
            }).sort({ 'gameResult.durationMs': -1, finishedAt: -1, id: 1 })
                .limit(1)
                .next(),
        ]);

        return {
            gamesPlayed,
            timePlayedMs: timePlayedResult?.timePlayedMs ?? 0,
            longestGameInMoves: longestGameInMovesDocument
                ? this.mapAdminLongestGameInMoves(longestGameInMovesDocument)
                : null,
            longestGameInDuration: longestGameInDurationDocument
                ? this.mapAdminLongestGameInDuration(longestGameInDurationDocument)
                : null,
        };
    }

    async getActiveGamesTimeline(
        startAt: number,
        endAt: number,
        bucketSizeMs: number,
    ): Promise<ActiveGamesTimelinePoint[]> {
        const collection = await this.getCollection();
        const safeStartAt = Math.max(0, Math.floor(startAt));
        const safeEndAt = Math.max(safeStartAt, Math.floor(endAt));
        const safeBucketSizeMs = Math.max(60_000, Math.floor(bucketSizeMs));
        const overlappingGames = await collection.find(
            {
                startedAt: {
                    $lte: safeEndAt,
                },
                finishedAt: {
                    $ne: null,
                    $gt: safeStartAt,
                },
            },
            {
                projection: {
                    _id: 0,
                    startedAt: 1,
                    finishedAt: 1,
                },
            },
        ).toArray();

        const startEvents: number[] = [];
        const endEvents: number[] = [];
        let activeGames = 0;

        for (const game of overlappingGames) {
            const startedAt = typeof game.startedAt === `number` ? game.startedAt : null;
            const finishedAt = typeof game.finishedAt === `number` ? game.finishedAt : null;

            if (startedAt === null || startedAt > safeEndAt) {
                continue;
            }

            if (finishedAt === null || finishedAt < startedAt) {
                continue;
            }

            const isActiveAtWindowStart = startedAt <= safeStartAt && (finishedAt === null || finishedAt > safeStartAt);
            if (isActiveAtWindowStart) {
                activeGames += 1;
            }

            if (startedAt > safeStartAt) {
                startEvents.push(startedAt);
            }

            if (finishedAt !== null && finishedAt > safeStartAt && finishedAt <= safeEndAt) {
                endEvents.push(finishedAt);
            }
        }

        startEvents.sort((left, right) => left - right);
        endEvents.sort((left, right) => left - right);

        const points: ActiveGamesTimelinePoint[] = [];
        let startIndex = 0;
        let endIndex = 0;

        for (let bucketStartAt = safeStartAt; bucketStartAt < safeEndAt; bucketStartAt += safeBucketSizeMs) {
            const bucketEndExclusive = Math.min(bucketStartAt + safeBucketSizeMs, safeEndAt + 1);
            let bucketPeakActiveGames = activeGames;

            while (true) {
                const nextStartAt = startEvents[startIndex];
                const nextEndAt = endEvents[endIndex];
                const nextStartIsWithinBucket = nextStartAt !== undefined && nextStartAt < bucketEndExclusive;
                const nextEndIsWithinBucket = nextEndAt !== undefined && nextEndAt < bucketEndExclusive;

                if (!nextStartIsWithinBucket && !nextEndIsWithinBucket) {
                    break;
                }

                if (nextEndIsWithinBucket && (!nextStartIsWithinBucket || nextEndAt <= nextStartAt)) {
                    activeGames = Math.max(0, activeGames - 1);
                    endIndex += 1;
                    continue;
                }

                activeGames += 1;
                bucketPeakActiveGames = Math.max(bucketPeakActiveGames, activeGames);
                startIndex += 1;
            }

            points.push({
                timestamp: bucketStartAt,
                activeGames: bucketPeakActiveGames,
            });
        }

        return points;
    }

    async getLeaderboardProfileIds(): Promise<string[]> {
        const collection = await this.getCollection();
        const players = await collection.aggregate<{ profileId: string }>([
            ...this.createPlayerLeaderboardStatsPipeline(),
            this.createPlayerLeaderboardSortStage(),
            {
                $project: {
                    _id: 0,
                    profileId: 1,
                },
            },
        ]).toArray();

        return players.map((player) => player.profileId);
    }

    async getPlayerLeaderboardStatsForPlayers(
        profileIds: string[],
        options: { ratedOnly: boolean },
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
                        $in: uniqueProfileIds,
                    },
                },
            },
        ]).toArray();

        return new Map(players.map((player) => [player.profileId, this.normalizePlayerLeaderboardStats(player)] as const));
    }

    async getPlayerProfileStatistics(profileId: string): Promise<PlayerProfileStatistics> {
        const normalizedProfileId = profileId.trim();
        if (normalizedProfileId.length === 0) {
            return this.createEmptyPlayerProfileStatistics(profileId);
        }

        const collection = await this.getCollection();
        const [statsResult, ratedGameResults] = await Promise.all([
            collection.aggregate<Omit<PlayerProfileStatistics, `profileId` | `currentRankedWinStreak` | `longestRankedWinStreak`>>([
                {
                    $match: {
                        finishedAt: {
                            $ne: null,
                        },
                        'players.profileId': normalizedProfileId,
                    },
                },
                {
                    $set: {
                        matchedPlayer: {
                            $first: {
                                $filter: {
                                    input: `$players`,
                                    as: `player`,
                                    cond: {
                                        $eq: [`$$player.profileId`, normalizedProfileId],
                                    },
                                },
                            },
                        },
                    },
                },
                {
                    $match: {
                        'matchedPlayer.playerId': {
                            $exists: true,
                        },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        isRated: {
                            $eq: [`$gameOptions.rated`, true],
                        },
                        gameWon: {
                            $cond: [
                                { $eq: [`$gameResult.winningPlayerId`, `$matchedPlayer.playerId`] },
                                1,
                                0,
                            ],
                        },
                        longestTrackedDurationMs: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: [`$gameResult.durationMs`, null] },
                                        { $lt: [`$gameResult.durationMs`, maxTrackedGameDurationMs] },
                                    ],
                                },
                                `$gameResult.durationMs`,
                                0,
                            ],
                        },
                        moveCount: `$moveCount`,
                        playerMoveCount: {
                            $size: {
                                $filter: {
                                    input: `$moves`,
                                    as: `move`,
                                    cond: {
                                        $eq: [`$$move.playerId`, `$matchedPlayer.playerId`],
                                    },
                                },
                            },
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalGamesPlayed: { $sum: 1 },
                        totalGamesWon: { $sum: `$gameWon` },
                        rankedGamesPlayed: {
                            $sum: {
                                $cond: [
                                    `$isRated`, 1, 0,
                                ],
                            },
                        },
                        rankedGamesWon: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            `$isRated`,
                                            { $eq: [`$gameWon`, 1] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                        longestGamePlayedMs: { $max: `$longestTrackedDurationMs` },
                        longestGameByMoves: { $max: `$moveCount` },
                        totalMovesMade: { $sum: `$playerMoveCount` },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        totalGamesPlayed: 1,
                        totalGamesWon: 1,
                        rankedGamesPlayed: 1,
                        rankedGamesWon: 1,
                        longestGamePlayedMs: 1,
                        longestGameByMoves: 1,
                        totalMovesMade: 1,
                    },
                },
            ]).toArray(),
            collection.aggregate<{ gameWon: boolean }>([
                {
                    $match: {
                        finishedAt: {
                            $ne: null,
                        },
                        'players.profileId': normalizedProfileId,
                        'gameOptions.rated': true,
                    },
                },
                {
                    $set: {
                        matchedPlayer: {
                            $first: {
                                $filter: {
                                    input: `$players`,
                                    as: `player`,
                                    cond: {
                                        $eq: [`$$player.profileId`, normalizedProfileId],
                                    },
                                },
                            },
                        },
                    },
                },
                {
                    $match: {
                        'matchedPlayer.playerId': {
                            $exists: true,
                        },
                    },
                },
                {
                    $sort: {
                        finishedAt: -1,
                        id: -1,
                    },
                },
                {
                    $project: {
                        _id: 0,
                        gameWon: {
                            $eq: [`$gameResult.winningPlayerId`, `$matchedPlayer.playerId`],
                        },
                    },
                },
            ]).toArray(),
        ]);
        const [stats] = statsResult;
        const streakStats = this.calculateWinStreaks(ratedGameResults.map((game) => game.gameWon));

        return {
            profileId: normalizedProfileId,
            totalGamesPlayed: stats?.totalGamesPlayed ?? 0,
            totalGamesWon: stats?.totalGamesWon ?? 0,
            rankedGamesPlayed: stats?.rankedGamesPlayed ?? 0,
            rankedGamesWon: stats?.rankedGamesWon ?? 0,
            currentRankedWinStreak: streakStats.current,
            longestRankedWinStreak: streakStats.longest,
            longestGamePlayedMs: stats?.longestGamePlayedMs ?? 0,
            longestGameByMoves: stats?.longestGameByMoves ?? 0,
            totalMovesMade: stats?.totalMovesMade ?? 0,
        };
    }

    async getPlayerEloHistory(profileId: string): Promise<AccountEloHistory> {
        const normalizedProfileId = profileId.trim();
        if (normalizedProfileId.length === 0) {
            return {
                bucketSizeMs: accountEloHistoryBucketSizeMs,
                points: [],
            };
        }

        const collection = await this.getCollection();
        const points = await collection.aggregate<AccountEloHistoryPoint>([
            {
                $match: {
                    finishedAt: {
                        $ne: null,
                    },
                    'gameOptions.rated': true,
                    'players.profileId': normalizedProfileId,
                },
            },
            {
                $unwind: `$players`,
            },
            {
                $match: {
                    'players.profileId': normalizedProfileId,
                    'players.elo': {
                        $ne: null,
                    },
                    'players.eloChange': {
                        $ne: null,
                    },
                },
            },
            {
                $set: {
                    timestamp: {
                        $subtract: [
                            `$finishedAt`,
                            {
                                $mod: [`$finishedAt`, accountEloHistoryBucketSizeMs],
                            },
                        ],
                    },
                    postGameElo: {
                        $add: [
                            `$players.elo`,
                            {
                                /* 
                                 * As we do want the highest ELO it's ether the starting ELO or 
                                 * the ELO after the match in case of a win. Hence just taking the
                                 * maximum removes the ELO loss.
                                 */
                                $max: [`$players.eloChange`, 0],
                            },
                        ],
                    },
                },
            },
            {
                $sort: {
                    finishedAt: 1,
                    id: 1,
                },
            },
            {
                $group: {
                    _id: `$timestamp`,
                    timestamp: {
                        $first: `$timestamp`,
                    },
                    elo: {
                        $max: `$postGameElo`,
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    timestamp: 1,
                    elo: 1,
                },
            },
            {
                $sort: {
                    timestamp: 1,
                },
            },
        ]).toArray();

        return {
            bucketSizeMs: accountEloHistoryBucketSizeMs,
            points,
        };
    }

    private async getCollection(): Promise<Collection<GameHistoryDocument>> {
        if (this.collectionPromise !== null) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<GameHistoryDocument>(GAME_HISTORY_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.collectionPromise = null;

            this.logger.error({
                err: error,
                type: `game-history`,
                event: `game-history-storage-error`,
                storage: `mongodb`,
            }, `Failed to initialize game history storage`);

            throw error;
        });

        return this.collectionPromise;
    }

    private mapSummary(document: unknown): FinishedGameSummary | null {
        let parsedDocument: GameHistoryDocument;
        try {
            parsedDocument = zGameHistoryDocument.parse(document);
        } catch {
            return null;
        }

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
                : null,
            tournament: parsedDocument.tournament
                ? { ...parsedDocument.tournament }
                : null,
        });
    }

    private mapRecord(document: unknown): FinishedGameRecord {
        const parsedDocument = zGameHistoryDocument.parse(document);
        const summary = this.mapSummary(parsedDocument);
        if (!summary) {
            throw new Error(`Failed to parse database game`);
        }

        return zFinishedGameRecord.parse({
            ...summary,
            moves: parsedDocument.moves.map((move) => ({ ...move })),
        });
    }

    private mapAdminLongestGameInMoves(document: unknown): AdminLongestGameInMoves {
        const parsedDocument = zGameHistoryDocument.parse(document);

        return {
            gameId: parsedDocument.id,
            sessionId: parsedDocument.sessionId,
            players: parsedDocument.players.map((player) => player.displayName),
            finishedAt: parsedDocument.finishedAt ?? parsedDocument.startedAt,
            moveCount: parsedDocument.moveCount,
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
            durationMs,
        };
    }

    private cloneGameOptions(gameOptions: LobbyOptions): LobbyOptions {
        return {
            ...gameOptions,
            timeControl: { ...gameOptions.timeControl },
        };
    }

    private clonePlayerTiles(playerTiles: Record<string, PlayerTileConfig>): Record<string, PlayerTileConfig> {
        return Object.fromEntries(Object.entries(playerTiles).map(([playerId, playerTileConfig]) => [playerId, { ...playerTileConfig }]));
    }

    private buildFinishedGamesMatch(baseTimestamp: number, playerProfileId?: string) {
        return {
            finishedAt: {
                $ne: null,
                $lte: baseTimestamp,
            },
            ...(playerProfileId ? { 'players.profileId': playerProfileId } : {}),
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
                        $ne: null,
                    },
                },
            },
            {
                $unwind: `$players`,
            },
            {
                $match: {
                    'players.profileId': {
                        $ne: null,
                    },
                },
            },
            {
                $sort: {
                    finishedAt: -1,
                    id: -1,
                },
            },
            {
                $group: {
                    _id: `$players.profileId`,
                    profileId: { $first: `$players.profileId` },
                    displayName: { $first: `$players.displayName` },
                    gamesPlayed: { $sum: 1 },
                    gamesWon: {
                        $sum: {
                            $cond: [
                                { $eq: [`$players.playerId`, `$gameResult.winningPlayerId`] },
                                1,
                                0,
                            ],
                        },
                    },
                },
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
                            { $eq: [`$gamesPlayed`, 0] },
                            0,
                            { $divide: [`$gamesWon`, `$gamesPlayed`] },
                        ],
                    },
                },
            },
        ];
    }

    private createPlayerLeaderboardSortStage(): Document {
        return {
            $sort: {
                gamesWon: -1,
                winRatio: -1,
                gamesPlayed: -1,
                displayName: 1,
                profileId: 1,
            },
        };
    }

    private normalizePlayerLeaderboardStats(player: PlayerLeaderboardStats): PlayerLeaderboardStats {
        return {
            profileId: player.profileId,
            displayName: player.displayName,
            gamesPlayed: player.gamesPlayed,
            gamesWon: player.gamesWon,
            winRatio: Number(player.winRatio.toFixed(4)),
        };
    }

    private createEmptyPlayerProfileStatistics(profileId: string): PlayerProfileStatistics {
        return {
            profileId,
            totalGamesPlayed: 0,
            totalGamesWon: 0,
            rankedGamesPlayed: 0,
            rankedGamesWon: 0,
            currentRankedWinStreak: 0,
            longestRankedWinStreak: 0,
            longestGamePlayedMs: 0,
            longestGameByMoves: 0,
            totalMovesMade: 0,
        };
    }

    private calculateWinStreaks(gameResults: boolean[]): { current: number; longest: number } {
        let longestStreak = 0;
        let activeStreak = 0;
        let currentStreak = 0;
        let currentStreakActive = true;

        for (const gameWon of gameResults) {
            if (!gameWon) {
                currentStreakActive = false;
                activeStreak = 0;
                continue;
            }

            activeStreak += 1;
            if (currentStreakActive) {
                currentStreak = activeStreak;
            }

            if (activeStreak > longestStreak) {
                longestStreak = activeStreak;
            }
        }

        return {
            current: currentStreak,
            longest: longestStreak,
        };
    }

    private logMissingHistory(event: string, gameId: string, extraDetails: Record<string, unknown> = {}): void {
        this.logger.warn({
            type: `game-history`,
            event,
            storage: `mongodb`,
            gameId,
            ...extraDetails,
        }, `Game history does not exist`);
    }
}
