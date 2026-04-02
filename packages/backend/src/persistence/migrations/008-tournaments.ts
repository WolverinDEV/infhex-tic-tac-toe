import type { Document } from 'mongodb';

import { TOURNAMENTS_COLLECTION_NAME } from '../mongoCollections';
import type { DatabaseMigration } from './types';

type TournamentDocument = {
    _id: unknown;
} & Document;

export const tournamentsMigration: DatabaseMigration = {
    id: `008-tournaments`,
    description: `Create tournament indexes`,
    async up({ database }) {
        const collection = database.collection<TournamentDocument>(TOURNAMENTS_COLLECTION_NAME);
        await collection.createIndex({ id: 1 }, { unique: true });
        await collection.createIndex({ isPublished: 1, kind: 1, scheduledStartAt: 1, createdAt: -1 });
        await collection.createIndex({ 'participants.profileId': 1, updatedAt: -1 });
        await collection.createIndex({ status: 1, updatedAt: 1, scheduledStartAt: 1 });
    },
};
