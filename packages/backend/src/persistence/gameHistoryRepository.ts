import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import type { Collection, Document } from 'mongodb';
import {
    FinishedGamesPage,
    FinishedGameRecord,
    FinishedGameSummary,
    GameMove,
    PlayerNames,
    PlayerProfileIds,
    SessionFinishReason,
    zFinishedGameRecord,
    zFinishedGamesPage,
    zFinishedGameSummary,
    zGameMove,
    zPlayerNames,
    zPlayerProfileIds,
    zSessionFinishReason,
} from '@ih3t/shared';
import { z } from 'zod';
import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';

export interface CreateGameHistoryPayload {
    id: string;
    sessionId: string;
    createdAt: number;
}

export interface StartedGameHistoryPayload extends CreateGameHistoryPayload {
    startedAt: number | null;
    players: string[];
    playerNames: PlayerNames;
    playerProfileIds: PlayerProfileIds;
}

export interface FinishedGameHistoryPayload extends StartedGameHistoryPayload {
    finishedAt: number;
    winningPlayerId: string | null;
    reason: SessionFinishReason;
    moves: GameMove[];
}

const zGameHistoryDocument = z.object({
    id: z.string(),
    sessionId: z.string(),
    state: z.enum(['lobby', 'ingame', 'finished']),
    players: z.array(z.string()),
    playerNames: zPlayerNames.optional(),
    playerProfileIds: zPlayerProfileIds.optional(),
    winningPlayerId: z.string().nullable(),
    reason: zSessionFinishReason.nullable(),
    moveCount: z.number().int().nonnegative(),
    moves: z.array(zGameMove),
    createdAt: z.number().int(),
    startedAt: z.number().int().nullable(),
    finishedAt: z.number().int().nullable(),
    gameDurationMs: z.number().int().nonnegative().nullable(),
    updatedAt: z.number().int()
});
type GameHistoryDocument = z.infer<typeof zGameHistoryDocument> & Document;

interface ListFinishedGamesOptions {
    page?: number;
    pageSize?: number;
    baseTimestamp?: number;
}

const mongoDbName = process.env.MONGODB_DB_NAME ?? 'ih3t';
const mongoCollectionName = process.env.MONGODB_GAME_HISTORY_COLLECTION ?? 'gameHistory';

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

    async createHistory(payload: CreateGameHistoryPayload): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            await collection.insertOne(this.createDocument(payload) as GameHistoryDocument);
            return true;
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-create-error',
                storage: 'mongodb',
                gameId: payload.id
            }, 'Failed to create game history');

            return false;
        }
    }

    async markStarted(
        id: string,
        players: string[],
        playerNames: PlayerNames,
        playerProfileIds: PlayerProfileIds
    ): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            const result = await collection.updateOne(
                { id: id },
                {
                    $set: {
                        state: 'ingame',
                        players: players,
                        playerNames: { ...playerNames },
                        playerProfileIds: { ...playerProfileIds },
                        startedAt: Date.now(),
                        updatedAt: Date.now()
                    }
                }
            );

            if (result.matchedCount === 0) {
                this.logMissingHistory('game-history-start-error', id);
                return false;
            }

            return true;
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-start-error',
                storage: 'mongodb',
                gameId: id
            }, 'Failed to mark game history as started');

            return false;
        }
    }

    async appendMove(id: string, move: GameMove): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            const result = await collection.updateOne(
                { id: id },
                {
                    $set: {
                        updatedAt: move.timestamp
                    },
                    $push: {
                        moves: move
                    } as never,
                    $inc: {
                        moveCount: 1
                    }
                }
            );

            if (result.matchedCount === 0) {
                this.logMissingHistory('game-history-move-error', id, {
                    moveNumber: move.moveNumber
                });
                return false;
            }

            return true;
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-move-error',
                storage: 'mongodb',
                gameId: id,
                moveNumber: move.moveNumber
            }, 'Failed to append game move');

            return false;
        }
    }

    async finalizeHistory(payload: Pick<FinishedGameHistoryPayload, "id" | "winningPlayerId" | "reason" | "startedAt">): Promise<boolean> {
        const collection = await this.getCollection();
        const finishedAt = Date.now();
        const effectiveStartedAt = payload.startedAt ?? finishedAt;

        try {
            const result = await collection.updateOne(
                { id: payload.id },
                {
                    $set: {
                        state: 'finished',
                        winningPlayerId: payload.winningPlayerId,
                        reason: payload.reason,
                        finishedAt,
                        gameDurationMs: Math.max(0, finishedAt - effectiveStartedAt),
                        updatedAt: finishedAt
                    }
                }
            );

            if (result.matchedCount === 0) {
                this.logMissingHistory('game-history-finalize-error', payload.id);
                return false;
            }

            return true;
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'game-history',
                event: 'game-history-finalize-error',
                storage: 'mongodb',
                gameId: payload.id
            }, 'Failed to finalize game history');

            return false;
        }
    }

    async listFinishedGames(options: ListFinishedGamesOptions = {}): Promise<FinishedGamesPage> {
        const collection = await this.getCollection();
        const pageSize = this.normalizePageSize(options.pageSize);
        const baseTimestamp = this.normalizeBaseTimestamp(options.baseTimestamp);
        const requestedPage = this.normalizePage(options.page);
        const aggregationResult = await collection.aggregate<{
            games: GameHistoryDocument[];
            totals: Array<{ totalGames: number; totalMoves: number }>;
        }>([
            {
                $match: {
                    state: 'finished',
                    finishedAt: { $lte: baseTimestamp }
                }
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
                .find({
                    state: 'finished',
                    finishedAt: { $lte: baseTimestamp }
                })
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

        const document = await collection.findOne({ id, state: 'finished' });
        if (!document) {
            return undefined;
        }

        return this.mapRecord(document);
    }

    private async getCollection(): Promise<Collection<GameHistoryDocument>> {
        if (this.collectionPromise !== null) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            const collection = database.collection<GameHistoryDocument>(mongoCollectionName);
            await collection.createIndex({ id: 1 }, { unique: true });
            await collection.createIndex({ state: 1, finishedAt: -1, id: -1 });
            await collection.createIndex({ sessionId: 1, finishedAt: -1 });

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

    private createDocument(payload: CreateGameHistoryPayload): Omit<GameHistoryDocument, '_id'> {
        return {
            id: payload.id,
            sessionId: payload.sessionId,
            state: 'lobby',
            players: [],
            playerNames: {},
            playerProfileIds: {},
            winningPlayerId: null,
            reason: null,
            moveCount: 0,
            moves: [],
            createdAt: payload.createdAt,
            startedAt: null,
            finishedAt: null,
            gameDurationMs: null,
            updatedAt: payload.createdAt
        };
    }

    private mapSummary(document: unknown): FinishedGameSummary {
        const parsedDocument = zGameHistoryDocument.parse(document);
        const startedAt = parsedDocument.startedAt ?? parsedDocument.createdAt;
        const finishedAt = parsedDocument.finishedAt ?? parsedDocument.updatedAt;

        return zFinishedGameSummary.parse({
            id: parsedDocument.id,
            sessionId: parsedDocument.sessionId,
            players: [...parsedDocument.players],
            playerNames: this.normalizePlayerNames(parsedDocument.players, parsedDocument.playerNames),
            playerProfileIds: this.normalizePlayerProfileIds(parsedDocument.players, parsedDocument.playerProfileIds),
            winningPlayerId: parsedDocument.winningPlayerId,
            reason: parsedDocument.reason ?? 'terminated',
            moveCount: parsedDocument.moveCount,
            createdAt: parsedDocument.createdAt,
            startedAt,
            finishedAt,
            gameDurationMs: parsedDocument.gameDurationMs ?? Math.max(0, finishedAt - startedAt)
        });
    }

    private mapRecord(document: unknown): FinishedGameRecord {
        const parsedDocument = zGameHistoryDocument.parse(document);

        return zFinishedGameRecord.parse({
            ...this.mapSummary(document),
            moves: [...parsedDocument.moves]
        });
    }

    private normalizePlayerNames(players: string[], playerNames: PlayerNames | undefined): PlayerNames {
        const normalizedPlayerNames: PlayerNames = {};

        for (const [playerIndex, playerId] of players.entries()) {
            normalizedPlayerNames[playerId] = playerNames?.[playerId] ?? `Player ${playerIndex + 1}`;
        }

        return normalizedPlayerNames;
    }

    private normalizePlayerProfileIds(
        players: string[],
        playerProfileIds: PlayerProfileIds | undefined
    ): PlayerProfileIds {
        const normalizedPlayerProfileIds: PlayerProfileIds = {};

        for (const playerId of players) {
            normalizedPlayerProfileIds[playerId] = playerProfileIds?.[playerId] ?? null;
        }

        return normalizedPlayerProfileIds;
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
