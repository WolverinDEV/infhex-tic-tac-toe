import { injectable } from 'tsyringe';
import type { Collection, Document } from 'mongodb';
import type {
    FinishedGameRecord,
    FinishedGameSummary,
    GameMove,
    SessionFinishReason,
} from '@ih3t/shared';
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

    constructor(private readonly mongoDatabase: MongoDatabase) {}

    async createHistory(payload: CreateGameHistoryPayload): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            await collection.insertOne(this.createDocument(payload) as GameHistoryDocument);
            return true;
        } catch (error: unknown) {
            console.error(JSON.stringify({
                type: 'game-history',
                event: 'game-history-create-error',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                gameId: payload.id,
                message: error instanceof Error ? error.message : String(error)
            }));

            return false;
        }
    }

    async markStarted(payload: StartedGameHistoryPayload): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            const result = await collection.updateOne(
                { id: payload.id },
                {
                    $set: {
                        state: 'ingame',
                        players: [...payload.players],
                        startedAt: payload.startedAt,
                        updatedAt: payload.startedAt
                    }
                }
            );

            if (result.matchedCount === 0) {
                this.logMissingHistory('game-history-start-error', payload.id);
                return false;
            }

            return true;
        } catch (error: unknown) {
            console.error(JSON.stringify({
                type: 'game-history',
                event: 'game-history-start-error',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                gameId: payload.id,
                message: error instanceof Error ? error.message : String(error)
            }));

            return false;
        }
    }

    async appendMove(payload: StartedGameHistoryPayload, move: GameMove): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            const result = await collection.updateOne(
                { id: payload.id },
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
                this.logMissingHistory('game-history-move-error', payload.id, {
                    moveNumber: move.moveNumber
                });
                return false;
            }

            return true;
        } catch (error: unknown) {
            console.error(JSON.stringify({
                type: 'game-history',
                event: 'game-history-move-error',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                gameId: payload.id,
                moveNumber: move.moveNumber,
                message: error instanceof Error ? error.message : String(error)
            }));

            return false;
        }
    }

    async finalizeHistory(payload: FinishedGameHistoryPayload): Promise<boolean> {
        const collection = await this.getCollection();

        try {
            const result = await collection.updateOne(
                { id: payload.id },
                {
                    $set: {
                        state: 'finished',
                        players: [...payload.players],
                        winningPlayerId: payload.winningPlayerId,
                        reason: payload.reason,
                        moveCount: payload.moves.length,
                        moves: [...payload.moves],
                        startedAt: payload.startedAt,
                        finishedAt: payload.finishedAt,
                        gameDurationMs: Math.max(0, payload.finishedAt - payload.startedAt),
                        updatedAt: payload.finishedAt
                    }
                }
            );

            if (result.matchedCount === 0) {
                this.logMissingHistory('game-history-finalize-error', payload.id);
                return false;
            }

            return true;
        } catch (error: unknown) {
            console.error(JSON.stringify({
                type: 'game-history',
                event: 'game-history-finalize-error',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                gameId: payload.id,
                message: error instanceof Error ? error.message : String(error)
            }));

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

            console.log(JSON.stringify({
                type: 'game-history',
                event: 'game-history-storage-ready',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                database: mongoDbName,
                collection: mongoCollectionName
            }));

            return collection;
        })().catch((error: unknown) => {
            this.collectionPromise = null;

            console.error(JSON.stringify({
                type: 'game-history',
                event: 'game-history-storage-error',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                message: error instanceof Error ? error.message : String(error)
            }));

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
        console.error(JSON.stringify({
            type: 'game-history',
            event,
            timestamp: new Date().toISOString(),
            storage: 'mongodb',
            gameId,
            message: 'Game history does not exist.',
            ...extraDetails
        }));
    }
}
