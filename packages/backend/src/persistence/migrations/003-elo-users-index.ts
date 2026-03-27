import type { Document } from 'mongodb';
import type { DatabaseMigration } from './types';
import { AUTH_USERS_COLLECTION_NAME } from '../mongoCollections';

type EloUserDocument = {
    _id: unknown;
} & Document

export const eloUsersIndexMigration: DatabaseMigration = {
    id: '003-elo-users-index',
    description: 'Create partial leaderboard index for ELO lookups',
    async up({ database }) {
        const collection = database.collection<EloUserDocument>(AUTH_USERS_COLLECTION_NAME);
        await collection.createIndex(
            { elo: -1, ratedGamesPlayed: -1, _id: 1 },
            {
                partialFilterExpression: {
                    ratedGamesPlayed: { $gt: 0 }
                },
                name: 'elo_-1_ratedGamesPlayed_-1__id_1_2'
            }
        );
    }
};
