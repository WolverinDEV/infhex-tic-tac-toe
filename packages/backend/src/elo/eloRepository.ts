import type { Logger } from 'pino';
import { Collection, ObjectId, type Document } from 'mongodb';
import { inject, injectable } from 'tsyringe';
import { ROOT_LOGGER } from '../logger';
import { AUTH_USERS_COLLECTION_NAME } from '../persistence/mongoCollections';
import { MongoDatabase } from '../persistence/mongoClient';
import { PlayerRating } from '@ih3t/shared';

interface EloUserDocument extends Document {
    _id: ObjectId;
    elo?: number;
    ratedGamesPlayed?: number;
}


export interface StoredEloPlayerRating extends PlayerRating {
    profileId: string;
}


export interface EloLeaderboardPlayer extends StoredEloPlayerRating { }

export interface EloLeaderboardPlacement extends EloLeaderboardPlayer {
    rank: number;
}

export const DEFAULT_PLAYER_ELO = 1000;
const MINIMUM_PLAYER_ELO = 100;

@injectable()
export class EloRepository {
    private readonly logger: Logger;
    private usersCollectionPromise: Promise<Collection<EloUserDocument>> | null = null;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase
    ) {
        this.logger = rootLogger.child({ component: 'elo-repository' });
    }

    async initialize(): Promise<void> {
        await this.getUsersCollection();
    }

    async getPlayerRating(profileId: string): Promise<PlayerRating | null> {
        const collection = await this.getUsersCollection();
        const objectId = this.parseObjectId(profileId);
        if (!objectId) {
            return null;
        }

        const document = await collection.findOne({ _id: objectId });
        if (!document) {
            return null;
        }

        return this.mapRating(document);
    }

    async getPlayerRatings(profileIds: string[]): Promise<Map<string, PlayerRating>> {
        const validEntries = profileIds.flatMap((profileId) => {
            const objectId = this.parseObjectId(profileId);
            return objectId ? [{ profileId, objectId }] : [];
        });

        if (validEntries.length === 0) {
            return new Map();
        }

        const collection = await this.getUsersCollection();
        const documents = await collection.find({
            _id: {
                $in: validEntries.map(({ objectId }) => objectId)
            }
        }).toArray();

        return new Map(
            documents.map((document) => [
                document._id.toHexString(),
                this.mapRating(document)
            ] as const)
        );
    }

    async performEloAdjustment(profileId: string, delta: number): Promise<PlayerRating> {
        const collection = await this.getUsersCollection();
        const objectId = this.parseObjectId(profileId);
        if (!objectId) {
            throw Error(`invalid profile id`)
        }

        const document = await collection.findOneAndUpdate(
            { _id: objectId },
            {
                $inc: {
                    elo: delta,
                    ratedGamesPlayed: 1
                },
            },
            {
                returnDocument: "after",
                projection: {
                    elo: 1,
                    ratedGamesPlayed: 1
                }
            }
        );
        if (!document) {
            throw Error(`invalid profile id`)
        }

        return this.mapRating(document!);
    }

    async getTopLeaderboardPlayers(limit: number): Promise<EloLeaderboardPlayer[]> {
        if (limit <= 0) {
            return [];
        }

        const collection = await this.getUsersCollection();
        const documents = await collection.find({
            ratedGamesPlayed: { $gt: 0 }
        }).sort({
            elo: -1,
            ratedGamesPlayed: -1,
            _id: 1
        }).limit(limit).toArray();

        return documents.map((document) => ({
            profileId: document._id.toHexString(),
            ...this.mapRating(document)
        }));
    }

    async getLeaderboardPlacement(profileId: string): Promise<EloLeaderboardPlacement | null> {
        const collection = await this.getUsersCollection();
        const objectId = this.parseObjectId(profileId);
        if (!objectId) {
            return null;
        }

        const document = await collection.findOne({ _id: objectId });
        if (!document) {
            return null;
        }

        const rating = this.mapRating(document);
        if (rating.gameCount <= 0) {
            return null;
        }

        const higherRankedPlayers = await collection.countDocuments({
            ratedGamesPlayed: { $gt: 0 },
            $or: [
                { elo: { $gt: rating.eloScore } },
                {
                    elo: rating.eloScore,
                    ratedGamesPlayed: { $gt: rating.gameCount }
                },
                {
                    elo: rating.eloScore,
                    ratedGamesPlayed: rating.gameCount,
                    _id: { $lt: objectId }
                }
            ]
        });

        return {
            profileId,
            ...rating,
            rank: higherRankedPlayers + 1
        };
    }

    private async getUsersCollection(): Promise<Collection<EloUserDocument>> {
        if (this.usersCollectionPromise) {
            return this.usersCollectionPromise;
        }

        this.usersCollectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<EloUserDocument>(AUTH_USERS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.usersCollectionPromise = null;
            this.logger.error({ err: error, event: 'elo.users.init.failed' }, 'Failed to initialize elo users collection');
            throw error;
        });

        return this.usersCollectionPromise;
    }

    private parseObjectId(value: string | undefined | null): ObjectId | null {
        if (!value || !ObjectId.isValid(value)) {
            return null;
        }

        return new ObjectId(value);
    }

    private mapRating(document: EloUserDocument): PlayerRating {
        const normalizedElo = this.normalizeStoredElo(document.elo);
        return {
            eloScore: normalizedElo,
            gameCount: this.normalizeStoredRatedGamesPlayed(document.ratedGamesPlayed)
        };
    }

    private normalizeStoredElo(value: number | undefined): number {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return DEFAULT_PLAYER_ELO;
        }

        return Math.max(MINIMUM_PLAYER_ELO, Math.round(value));
    }

    private normalizeStoredRatedGamesPlayed(value: number | undefined): number {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return 0;
        }

        return Math.max(0, Math.floor(value));
    }
}
