import type { Document } from 'mongodb';
import type { DatabaseMigration } from './types';
import { SERVER_SETTINGS_COLLECTION_NAME } from '../mongoCollections';

type ServerSettingDocument = {
    _id: unknown;
} & Document

export const serverSettingsMigration: DatabaseMigration = {
    id: '006-server-settings',
    description: 'Create server settings indexes',
    async up({ database }) {
        const collection = database.collection<ServerSettingDocument>(SERVER_SETTINGS_COLLECTION_NAME);
        await collection.createIndex({ key: 1 }, { unique: true });
    }
};
