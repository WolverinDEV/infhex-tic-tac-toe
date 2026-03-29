import type { Document } from 'mongodb';

import { ACCOUNT_BOTS_COLLECTION_NAME } from '../mongoCollections';
import type { DatabaseMigration } from './types';

type AccountBotDocument = {
    id: string;
    ownerProfileId: string;
    updatedAt: number;
} & Document;

export const accountBotsMigration: DatabaseMigration = {
    id: `008-account-bots`,
    description: `Create account bot indexes`,
    async up({ database }) {
        const collection = database.collection<AccountBotDocument>(ACCOUNT_BOTS_COLLECTION_NAME);
        await collection.createIndex({ id: 1 }, { unique: true });
        await collection.createIndex({ ownerProfileId: 1, updatedAt: -1 });
    },
};
