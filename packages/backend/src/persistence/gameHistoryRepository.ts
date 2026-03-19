import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import type { Collection, Document } from 'mongodb';
import type {
    FinishedGameRecord,
    FinishedGameSummary,
    GameMove,
    SessionFinishReason,
} from '@ih3t/shared';
import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';

export interface CreateGameHistoryPayload {
    id: string;
    sessionId: string;
    createdAt: number;
}

export interface StartedGameHistoryPayload extends CreateGameHistoryPayload {
    startedAt: number;
    players: string[];
}

export interface FinishedGameHistoryPayload extends StartedGameHistoryPayload {
    finishedAt: number;
    winningPlayerId: string | null;
    reason: SessionFinishReason;
    moves: GameMove[];
}

interface GameHistoryDocument extends Document {
    id: string;
    sessionId: string;
    state: 'lobby' | 'ingame' | 'finished';
    players: string[];
    winningPlayerId: string | null;
    reason: SessionFinishReason | null;
    moveCount: number;
    moves: GameMove[];
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    gameDurationMs: number | null;
    updatedAt: number;
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

    async markStarted(id: string, players: string[]): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            const result = await collection.updateOne(
                { id: id },
                {
                    $set: {
                        state: 'ingame',
                        players: players,
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

        try {
            const result = await collection.updateOne(
                { id: payload.id },
                {
                    $set: {
                        state: 'finished',
                        winningPlayerId: payload.winningPlayerId,
                        reason: payload.reason,
                        finishedAt: Date.now(),
                        gameDurationMs: Math.max(0, Date.now() - payload.startedAt),
                        updatedAt: Date.now()
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

    async listFinishedGames(limit = 50): Promise<FinishedGameSummary[]> {
        const collection = await this.getCollection();

        const documents = await collection
            .find({ state: 'finished' })
            .sort({ finishedAt: -1 })
            .limit(limit)
            .toArray();

        return documents.map((document) => this.mapSummary(document));
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
            await collection.createIndex({ state: 1, finishedAt: -1 });
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

    private mapSummary(document: GameHistoryDocument): FinishedGameSummary {
        const startedAt = document.startedAt ?? document.createdAt;
        const finishedAt = document.finishedAt ?? document.updatedAt;

        return {
            id: document.id,
            sessionId: document.sessionId,
            players: [...document.players],
            winningPlayerId: document.winningPlayerId,
            reason: document.reason ?? 'terminated',
            moveCount: document.moveCount,
            createdAt: document.createdAt,
            startedAt,
            finishedAt,
            gameDurationMs: document.gameDurationMs ?? Math.max(0, finishedAt - startedAt)
        };
    }

    private mapRecord(document: GameHistoryDocument): FinishedGameRecord {
        return {
            ...this.mapSummary(document),
            moves: [...document.moves]
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
