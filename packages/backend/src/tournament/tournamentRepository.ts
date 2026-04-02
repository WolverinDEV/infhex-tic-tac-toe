import {
    zGameTimeControl,
    zTournamentActivityEntry,
    zTournamentExtensionRequest,
    zTournamentFormat,
    zTournamentKind,
    zTournamentMatch,
    zTournamentParticipant,
    zTournamentSeriesSettings,
    zTournamentStatus,
    zTournamentVisibility,
} from '@ih3t/shared';
import type { Collection, Document } from 'mongodb';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from '../persistence/mongoClient';
import { TOURNAMENTS_COLLECTION_NAME } from '../persistence/mongoCollections';

const zStoredTournament = z.object({
    version: z.literal(1),
    id: z.string(),
    name: z.string(),
    description: z.string()
        .nullable(),
    kind: zTournamentKind,
    format: zTournamentFormat,
    visibility: zTournamentVisibility,
    status: zTournamentStatus,
    isPublished: z.boolean(),
    scheduledStartAt: z.number().int(),
    checkInWindowMinutes: z.number().int()
        .positive(),
    checkInOpensAt: z.number().int(),
    checkInClosesAt: z.number().int(),
    maxPlayers: z.number().int().min(2).max(256),
    swissRoundCount: z.number().int()
        .min(1)
        .max(15)
        .nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
    startedAt: z.number().int()
        .nullable(),
    completedAt: z.number().int()
        .nullable(),
    cancelledAt: z.number().int()
        .nullable(),
    createdByProfileId: z.string(),
    createdByDisplayName: z.string(),
    timeControl: zGameTimeControl,
    seriesSettings: zTournamentSeriesSettings,
    matchJoinTimeoutMinutes: z.number().int()
        .min(0)
        .max(30)
        .default(5),
    lateRegistrationEnabled: z.boolean().default(false),
    thirdPlaceMatchEnabled: z.boolean().default(false),
    roundDelayMinutes: z.number().int()
        .nonnegative()
        .default(0),
    waitlistEnabled: z.boolean().default(false),
    waitlistCheckInMinutes: z.number().int()
        .nonnegative()
        .default(5),
    waitlistOpensAt: z.number().int()
        .nullable()
        .default(null),
    waitlistClosesAt: z.number().int()
        .nullable()
        .default(null),
    participants: z.array(zTournamentParticipant),
    matches: z.array(zTournamentMatch),
    activity: z.array(zTournamentActivityEntry),
    extensionRequests: z.array(zTournamentExtensionRequest).default([]),
    subscriberProfileIds: z.array(z.string()).default([]),
    organizers: z.array(z.string()).default([]),
    whitelist: z.array(z.object({ profileId: z.string(), displayName: z.string() })).default([]),
    blacklist: z.array(z.object({ profileId: z.string(), displayName: z.string() })).default([]),
});
export type TournamentRecord = z.infer<typeof zStoredTournament>;
type TournamentDocument = TournamentRecord & Document;

@injectable()
export class TournamentRepository {
    private collectionPromise: Promise<Collection<TournamentDocument>> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase,
    ) {
        this.logger = rootLogger.child({ component: `tournament-repository` });
    }

    async createTournament(tournament: TournamentRecord): Promise<void> {
        const collection = await this.getCollection();
        await collection.insertOne({
            ...tournament,
        });
    }

    async saveTournament(tournament: TournamentRecord): Promise<void> {
        const collection = await this.getCollection();
        await collection.replaceOne(
            { id: tournament.id },
            {
                ...tournament,
            },
            { upsert: true },
        );
    }

    async getTournament(id: string): Promise<TournamentRecord | null> {
        const collection = await this.getCollection();
        const document = await collection.findOne({ id });
        return document ? zStoredTournament.parse(document) : null;
    }

    async addSubscriber(tournamentId: string, profileId: string): Promise<void> {
        const collection = await this.getCollection();
        await collection.updateOne(
            { id: tournamentId },
            { $addToSet: { subscriberProfileIds: profileId } },
        );
    }

    async removeSubscriber(tournamentId: string, profileId: string): Promise<void> {
        const collection = await this.getCollection();
        await collection.updateOne(
            { id: tournamentId },
            // $pull on a primitive array requires a type assertion with the MongoDB driver
            { $pull: { subscriberProfileIds: profileId as never } },
        );
    }

    async listPastTournaments(
        profileId: string | null,
        page: number,
        pageSize: number,
    ): Promise<{ tournaments: TournamentRecord[]; total: number }> {
        const collection = await this.getCollection();
        const filter = {
            status: `completed` as const,
            $or: [
                { isPublished: true },
                ...(profileId
                    ? [
                        { 'participants.profileId': profileId },
                        { createdByProfileId: profileId },
                        { subscriberProfileIds: profileId },
                    ]
                    : []),
            ],
        };

        const [documents, total] = await Promise.all([
            collection.find(filter)
                .sort({ completedAt: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .toArray(),
            collection.countDocuments(filter),
        ]);

        return {
            tournaments: documents.map((document) => zStoredTournament.parse(document)),
            total,
        };
    }

    async listPublishedTournaments(): Promise<TournamentRecord[]> {
        const collection = await this.getCollection();
        const documents = await collection.find({
            isPublished: true,
        })
            .sort({
                scheduledStartAt: 1,
                createdAt: -1,
            })
            .toArray();

        return documents.map((document) => zStoredTournament.parse(document));
    }

    async listTournamentsForPlayer(profileId: string): Promise<TournamentRecord[]> {
        const collection = await this.getCollection();
        const documents = await collection.find({
            $or: [
                { 'participants.profileId': profileId },
                { createdByProfileId: profileId },
                { subscriberProfileIds: profileId },
            ],
        })
            .sort({
                updatedAt: -1,
                scheduledStartAt: 1,
            })
            .toArray();

        return documents.map((document) => zStoredTournament.parse(document));
    }

    async countActiveTournamentsForUser(profileId: string): Promise<number> {
        const collection = await this.getCollection();
        return await collection.countDocuments({
            createdByProfileId: profileId,
            status: { $nin: [`completed`, `cancelled`] },
        });
    }

    async getCompletedTournamentsForPlayer(profileId: string): Promise<TournamentRecord[]> {
        const collection = await this.getCollection();
        const documents = await collection.find({
            status: `completed`,
            'participants.profileId': profileId,
        }).sort({ completedAt: -1 }).toArray();
        return documents.map((document) => zStoredTournament.parse(document));
    }

    async countTournamentsCreatedByUser(profileId: string): Promise<number> {
        const collection = await this.getCollection();
        return await collection.countDocuments({ createdByProfileId: profileId });
    }

    async listReconciliableTournaments(): Promise<TournamentRecord[]> {
        const collection = await this.getCollection();
        const documents = await collection.find({
            status: {
                $in: [
                    `registration-open`,
                    `check-in-open`,
                    `waitlist-open`,
                    `live`,
                ],
            },
        })
            .sort({
                updatedAt: 1,
                scheduledStartAt: 1,
            })
            .toArray();

        return documents.map((document) => zStoredTournament.parse(document));
    }

    private async getCollection(): Promise<Collection<TournamentDocument>> {
        if (this.collectionPromise) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<TournamentDocument>(TOURNAMENTS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.collectionPromise = null;
            this.logger.error({ err: error, event: `tournament.storage.init.failed` }, `Failed to initialize tournament storage`);
            throw error;
        });

        return this.collectionPromise;
    }
}
