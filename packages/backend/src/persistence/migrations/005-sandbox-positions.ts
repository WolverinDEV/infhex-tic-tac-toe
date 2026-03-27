import type { Document } from 'mongodb';
import type { DatabaseMigration } from './types';
import { SANDBOX_POSITIONS_COLLECTION_NAME } from '../mongoCollections';

type SandboxPositionDocument = {
    _id: unknown;
} & Document

export const sandboxPositionsMigration: DatabaseMigration = {
    id: '005-sandbox-positions',
    description: 'Create sandbox position indexes',
    async up({ database }) {
        const collection = database.collection<SandboxPositionDocument>(SANDBOX_POSITIONS_COLLECTION_NAME);
        await collection.createIndex({ id: 1 }, { unique: true });
        await collection.createIndex({ createdBy: 1, createdAt: -1 });
        await collection.createIndex({ createdAt: -1 });
    }
};
