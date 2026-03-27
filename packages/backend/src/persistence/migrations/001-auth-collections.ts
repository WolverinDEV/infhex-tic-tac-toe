import { ObjectId, type Collection, type Document } from 'mongodb';
import type { Logger } from 'pino';
import type { DatabaseMigration } from './types';
import {
    AUTH_ACCOUNTS_COLLECTION_NAME,
    AUTH_SESSIONS_COLLECTION_NAME,
    AUTH_USERS_COLLECTION_NAME,
    AUTH_VERIFICATION_TOKENS_COLLECTION_NAME,
} from '../mongoCollections';

type AuthUserDocument = {
    _id: ObjectId;
    registeredAt?: number;
    lastActiveAt?: number;
} & Document

type AuthAccountDocument = {
    _id: ObjectId;
} & Document

type AuthSessionDocument = {
    _id: ObjectId;
} & Document

type AuthVerificationTokenDocument = {
    _id: ObjectId;
} & Document

export const authCollectionsMigration: DatabaseMigration = {
    id: '001-auth-collections',
    description: 'Create auth collection indexes and backfill legacy user timestamps',
    async up({ database, logger }) {
        const usersCollection = database.collection<AuthUserDocument>(AUTH_USERS_COLLECTION_NAME);
        await usersCollection.createIndex({ email: 1 }, { unique: true, sparse: true });
        await usersCollection.createIndex({ registeredAt: -1 });
        await usersCollection.createIndex({ lastActiveAt: -1 });
        await migrateExistingUsers(usersCollection, logger);

        const accountsCollection = database.collection<AuthAccountDocument>(AUTH_ACCOUNTS_COLLECTION_NAME);
        await accountsCollection.createIndex({ provider: 1, providerAccountId: 1 }, { unique: true });
        await accountsCollection.createIndex({ userId: 1, provider: 1 });

        const sessionsCollection = database.collection<AuthSessionDocument>(AUTH_SESSIONS_COLLECTION_NAME);
        await sessionsCollection.createIndex({ sessionToken: 1 }, { unique: true });
        await sessionsCollection.createIndex({ userId: 1, expires: 1 });
        await sessionsCollection.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });

        const verificationTokensCollection =
            database.collection<AuthVerificationTokenDocument>(AUTH_VERIFICATION_TOKENS_COLLECTION_NAME);
        await verificationTokensCollection.createIndex({ identifier: 1, token: 1 }, { unique: true });
        await verificationTokensCollection.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
    }
};

async function migrateExistingUsers(collection: Collection<AuthUserDocument>, logger: Logger): Promise<void> {
    const legacyDocuments = await collection.find({
        $or: [
            { registeredAt: { $exists: false } },
            { lastActiveAt: { $exists: false } },
        ]
    } as Document).toArray();

    if (legacyDocuments.length === 0) {
        return;
    }

    await collection.bulkWrite(
        legacyDocuments.map((document) => {
            const registeredAt = resolveRegisteredAt(document);
            return {
                updateOne: {
                    filter: { _id: document._id },
                    update: {
                        $set: {
                            registeredAt,
                            lastActiveAt: resolveLastActiveAt(document, registeredAt),
                        }
                    }
                }
            };
        }),
        { ordered: false }
    );

    logger.info({
        event: 'auth.users.migration.complete',
        migratedUsers: legacyDocuments.length
    }, 'Migrated legacy auth users with missing account timestamps');
}

function resolveRegisteredAt(document: Pick<AuthUserDocument, '_id' | 'registeredAt'>): number {
    return normalizeTimestamp(document.registeredAt)
        ?? document._id.getTimestamp().valueOf();
}

function resolveLastActiveAt(
    document: Pick<AuthUserDocument, 'lastActiveAt'>,
    registeredAt: number
): number {
    return normalizeTimestamp(document.lastActiveAt) ?? registeredAt;
}

function normalizeTimestamp(value: number | undefined | null): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.max(0, Math.floor(value));
}
