import type {
    Adapter,
    AdapterAccount,
    AdapterSession,
    AdapterUser,
} from '@auth/express/adapters';
import {
    DEFAULT_ACCOUNT_PREFERENCES,
    type AccountPreferences,
    type UserRole,
    zAccountPreferences,
} from '@ih3t/shared';
import type { Logger } from 'pino';
import { Collection, ObjectId, type Document } from 'mongodb';
import { inject, injectable } from 'tsyringe';
import { ROOT_LOGGER } from '../logger';
import {
    AUTH_ACCOUNTS_COLLECTION_NAME,
    AUTH_SESSIONS_COLLECTION_NAME,
    AUTH_USERS_COLLECTION_NAME,
    AUTH_VERIFICATION_TOKENS_COLLECTION_NAME,
} from '../persistence/mongoCollections';
import { MongoDatabase } from '../persistence/mongoClient';

interface AuthUserDocument extends Document {
    _id: ObjectId;
    name?: string | null;
    email?: string | null;
    emailVerified?: Date | null;
    image?: string | null;
    role?: UserRole;
    preferences?: AccountPreferences;
    registeredAt?: number;
    lastActiveAt?: number;
}

interface AuthAccountDocument extends Document {
    _id: ObjectId;
    userId: ObjectId;
    type: AdapterAccount['type'];
    provider: string;
    providerAccountId: string;
    refresh_token?: string;
    access_token?: string;
    expires_at?: number;
    token_type?: string;
    scope?: string;
    id_token?: string;
    session_state?: string;
}

interface AuthSessionDocument extends Document {
    _id: ObjectId;
    sessionToken: string;
    userId: ObjectId;
    expires: Date;
}

interface AuthVerificationTokenDocument extends Document {
    _id: ObjectId;
    identifier: string;
    token: string;
    expires: Date;
}

type StoredAdapterUser = AdapterUser & {
    role: UserRole;
    registeredAt: number;
    lastActiveAt: number;
};

const DEFAULT_PLAYER_ELO = 1000;

export interface AdminUserWindowStats {
    newUsers: number;
    activeUsers: number;
}

export interface AccountUserProfile {
    id: string;
    username: string;
    email: string | null;
    image: string | null;
    role: UserRole;
    registeredAt: number;
    lastActiveAt: number;
}

@injectable()
export class AuthRepository implements Adapter {
    private static readonly LAST_ACTIVE_WRITE_INTERVAL_MS = 60_000;
    private readonly logger: Logger;
    private usersCollectionPromise: Promise<Collection<AuthUserDocument>> | null = null;
    private accountsCollectionPromise: Promise<Collection<AuthAccountDocument>> | null = null;
    private sessionsCollectionPromise: Promise<Collection<AuthSessionDocument>> | null = null;
    private verificationTokensCollectionPromise: Promise<Collection<AuthVerificationTokenDocument>> | null = null;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase
    ) {
        this.logger = rootLogger.child({ component: 'auth-repository' });
    }

    readonly createUser: NonNullable<Adapter['createUser']> = async (user) => {
        const collection = await this.getUsersCollection();
        const now = Date.now();
        const document: AuthUserDocument = {
            _id: new ObjectId(),
            role: 'user',
            highestElo: DEFAULT_PLAYER_ELO,
            preferences: {
                ...DEFAULT_ACCOUNT_PREFERENCES,
                changelogReadAt: Date.now()
            },
            registeredAt: now,
            lastActiveAt: now,
            ...this.toUserDocument(user),
        };

        await collection.insertOne(document);

        return this.mapUserDocument(document);
    };

    readonly getUser: NonNullable<Adapter['getUser']> = async (id) => {
        const collection = await this.getUsersCollection();
        const userId = this.parseObjectId(id);
        if (!userId) {
            return null;
        }

        const document = await collection.findOne({ _id: userId });
        return document ? this.mapUserDocument(document) : null;
    };

    readonly getUserByEmail: NonNullable<Adapter['getUserByEmail']> = async (email) => {
        const collection = await this.getUsersCollection();
        const document = await collection.findOne({ email });
        return document ? this.mapUserDocument(document) : null;
    };

    readonly getUserByAccount: NonNullable<Adapter['getUserByAccount']> = async ({
        provider,
        providerAccountId,
    }) => {
        const accountsCollection = await this.getAccountsCollection();
        const account = await accountsCollection.findOne({
            provider,
            providerAccountId,
        });
        if (!account) {
            return null;
        }

        const user = await this.getUser(account.userId.toHexString());
        return user;
    };

    readonly updateUser: NonNullable<Adapter['updateUser']> = async (user) => {
        const collection = await this.getUsersCollection();
        const userId = this.parseObjectId(user.id);
        if (!userId) {
            throw new Error('Invalid user id');
        }

        const update = this.toUserUpdateDocument(user);
        if (Object.keys(update).length > 0) {
            await collection.updateOne(
                { _id: userId },
                {
                    $set: update,
                }
            );
        }

        const document = await collection.findOne({ _id: userId });
        if (!document) {
            throw new Error('User not found');
        }

        return this.mapUserDocument(document);
    };

    readonly linkAccount: NonNullable<Adapter['linkAccount']> = async (account) => {
        const collection = await this.getAccountsCollection();
        const userId = this.parseObjectId(account.userId);
        if (!userId) {
            throw new Error('Invalid user id');
        }

        const documentWithoutId: Omit<AuthAccountDocument, '_id'> = {
            userId,
            ...this.toAccountDocument(account),
        };

        await collection.updateOne(
            {
                provider: documentWithoutId.provider,
                providerAccountId: documentWithoutId.providerAccountId,
            },
            {
                $set: documentWithoutId,
                $setOnInsert: {
                    _id: new ObjectId(),
                },
            },
            { upsert: true }
        );

        return undefined;
    };

    readonly createSession: NonNullable<Adapter['createSession']> = async (session) => {
        const collection = await this.getSessionsCollection();
        const userId = this.parseObjectId(session.userId);
        if (!userId) {
            throw new Error('Invalid user id');
        }

        const document: AuthSessionDocument = {
            _id: new ObjectId(),
            sessionToken: session.sessionToken,
            userId,
            expires: session.expires,
        };

        await collection.insertOne(document);

        return this.mapSessionDocument(document);
    };

    readonly getSessionAndUser: NonNullable<Adapter['getSessionAndUser']> = async (sessionToken) => {
        const sessionsCollection = await this.getSessionsCollection();
        const usersCollection = await this.getUsersCollection();
        const sessionDocument = await sessionsCollection.findOne({ sessionToken });
        if (!sessionDocument) {
            return null;
        }

        const userDocument = await usersCollection.findOne({ _id: sessionDocument.userId });
        if (!userDocument) {
            return null;
        }

        return {
            session: this.mapSessionDocument(sessionDocument),
            user: this.mapUserDocument(userDocument),
        };
    };

    readonly updateSession: NonNullable<Adapter['updateSession']> = async (session) => {
        const collection = await this.getSessionsCollection();
        const update: Partial<AuthSessionDocument> = {};

        if (session.expires) {
            update.expires = session.expires;
        }

        if (session.userId) {
            const userId = this.parseObjectId(session.userId);
            if (!userId) {
                throw new Error('Invalid user id');
            }

            update.userId = userId;
        }

        if (Object.keys(update).length === 0) {
            const document = await collection.findOne({ sessionToken: session.sessionToken });
            return document ? this.mapSessionDocument(document) : null;
        }

        await collection.updateOne(
            { sessionToken: session.sessionToken },
            {
                $set: update,
            }
        );

        const document = await collection.findOne({ sessionToken: session.sessionToken });
        return document ? this.mapSessionDocument(document) : null;
    };

    readonly deleteSession: NonNullable<Adapter['deleteSession']> = async (sessionToken) => {
        const collection = await this.getSessionsCollection();
        const result = await collection.findOneAndDelete({ sessionToken });
        return result ? this.mapSessionDocument(result) : null;
    };

    readonly createVerificationToken: NonNullable<Adapter['createVerificationToken']> = async (verificationToken) => {
        const collection = await this.getVerificationTokensCollection();
        const document: AuthVerificationTokenDocument = {
            _id: new ObjectId(),
            identifier: verificationToken.identifier,
            token: verificationToken.token,
            expires: verificationToken.expires,
        };

        await collection.insertOne(document);

        return {
            identifier: document.identifier,
            token: document.token,
            expires: document.expires,
        };
    };

    readonly useVerificationToken: NonNullable<Adapter['useVerificationToken']> = async ({
        identifier,
        token,
    }) => {
        const collection = await this.getVerificationTokensCollection();
        const document = await collection.findOneAndDelete({ identifier, token });
        if (!document) {
            return null;
        }

        return {
            identifier: document.identifier,
            token: document.token,
            expires: document.expires,
        };
    };

    async getUserProfileBySessionToken(sessionToken: string): Promise<AccountUserProfile | null> {
        const sessionAndUser = await this.getSessionAndUser(sessionToken);
        if (!sessionAndUser || sessionAndUser.session.expires.valueOf() < Date.now()) {
            return null;
        }

        const user = await this.touchUserLastActive(sessionAndUser.user);
        return this.mapAccountUserProfile(user);
    }

    async getUserProfileById(userId: string): Promise<AccountUserProfile | null> {
        const collection = await this.getUsersCollection();
        const objectId = this.parseObjectId(userId);
        if (!objectId) {
            return null;
        }

        const document = await collection.findOne({ _id: objectId });
        return document ? this.mapAccountUserProfile(this.mapUserDocument(document)) : null;
    }

    async updateUsername(userId: string, username: string): Promise<AccountUserProfile | null> {
        const collection = await this.getUsersCollection();
        const objectId = this.parseObjectId(userId);
        if (!objectId) {
            return null;
        }

        await collection.updateOne(
            { _id: objectId },
            {
                $set: {
                    name: username,
                },
            }
        );

        const document = await collection.findOne({ _id: objectId });
        return document ? this.mapAccountUserProfile(this.mapUserDocument(document)) : null;
    }

    async getAccountPreferences(userId: string): Promise<AccountPreferences | null> {
        const collection = await this.getUsersCollection();
        const objectId = this.parseObjectId(userId);
        if (!objectId) {
            return null;
        }

        const document = await collection.findOne({ _id: objectId }, { projection: { preferences: 1 } });
        return document
            ? this.normalizeAccountPreferences(document.preferences)
            : null;
    }

    async updateAccountPreferences(userId: string, preferences: AccountPreferences): Promise<AccountPreferences | null> {
        const collection = await this.getUsersCollection();
        const objectId = this.parseObjectId(userId);
        if (!objectId) {
            return null;
        }

        const normalizedPreferences = this.normalizeAccountPreferences(preferences);
        await collection.updateOne(
            { _id: objectId },
            {
                $set: {
                    preferences: normalizedPreferences,
                },
            }
        );

        const document = await collection.findOne({ _id: objectId });
        return document ? this.normalizeAccountPreferences(document.preferences) : null;
    }

    async getUserProfilesByIds(userIds: string[]): Promise<Map<string, AccountUserProfile>> {
        const validEntries = userIds.flatMap((userId) => {
            const objectId = this.parseObjectId(userId);
            return objectId ? [{ userId, objectId }] : [];
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
            documents.map((document) => {
                const profile = this.mapAccountUserProfile(this.mapUserDocument(document));
                return [profile.id, profile] as const;
            })
        );
    }

    async countUsers(): Promise<number> {
        const collection = await this.getUsersCollection();
        return await collection.countDocuments();
    }

    async getAdminUserWindowStats(startAt: number, endAt: number): Promise<AdminUserWindowStats> {
        const collection = await this.getUsersCollection();
        const [newUsers, activeUsers] = await Promise.all([
            collection.countDocuments({
                registeredAt: {
                    $gte: startAt,
                    $lte: endAt
                }
            }),
            collection.countDocuments({
                lastActiveAt: {
                    $gte: startAt,
                    $lte: endAt
                }
            })
        ]);

        return {
            newUsers,
            activeUsers
        };
    }

    private async getUsersCollection(): Promise<Collection<AuthUserDocument>> {
        if (this.usersCollectionPromise) {
            return this.usersCollectionPromise;
        }

        this.usersCollectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<AuthUserDocument>(AUTH_USERS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.usersCollectionPromise = null;
            this.logger.error({ err: error, event: 'auth.users.init.failed' }, 'Failed to initialize auth users collection');
            throw error;
        });

        return this.usersCollectionPromise;
    }

    private async getAccountsCollection(): Promise<Collection<AuthAccountDocument>> {
        if (this.accountsCollectionPromise) {
            return this.accountsCollectionPromise;
        }

        this.accountsCollectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<AuthAccountDocument>(AUTH_ACCOUNTS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.accountsCollectionPromise = null;
            this.logger.error({ err: error, event: 'auth.accounts.init.failed' }, 'Failed to initialize auth accounts collection');
            throw error;
        });

        return this.accountsCollectionPromise;
    }

    private async getSessionsCollection(): Promise<Collection<AuthSessionDocument>> {
        if (this.sessionsCollectionPromise) {
            return this.sessionsCollectionPromise;
        }

        this.sessionsCollectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<AuthSessionDocument>(AUTH_SESSIONS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.sessionsCollectionPromise = null;
            this.logger.error({ err: error, event: 'auth.sessions.init.failed' }, 'Failed to initialize auth sessions collection');
            throw error;
        });

        return this.sessionsCollectionPromise;
    }

    private async getVerificationTokensCollection(): Promise<Collection<AuthVerificationTokenDocument>> {
        if (this.verificationTokensCollectionPromise) {
            return this.verificationTokensCollectionPromise;
        }

        this.verificationTokensCollectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<AuthVerificationTokenDocument>(AUTH_VERIFICATION_TOKENS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.verificationTokensCollectionPromise = null;
            this.logger.error({ err: error, event: 'auth.verification-tokens.init.failed' }, 'Failed to initialize auth verification token collection');
            throw error;
        });

        return this.verificationTokensCollectionPromise;
    }

    private parseObjectId(value: string | undefined | null): ObjectId | null {
        if (!value || !ObjectId.isValid(value)) {
            return null;
        }

        return new ObjectId(value);
    }

    private mapUserDocument(document: AuthUserDocument): StoredAdapterUser {
        const registeredAt = this.resolveRegisteredAt(document);

        return {
            id: document._id.toHexString(),
            name: document.name ?? null,
            email: document.email ?? '',
            emailVerified: document.emailVerified ?? null,
            image: document.image ?? null,
            role: document.role ?? 'user',
            registeredAt,
            lastActiveAt: this.resolveLastActiveAt(document, registeredAt),
        };
    }

    private mapSessionDocument(document: AuthSessionDocument): AdapterSession {
        return {
            sessionToken: document.sessionToken,
            userId: document.userId.toHexString(),
            expires: document.expires,
        };
    }

    private mapAccountUserProfile(
        user: AdapterUser & { role?: UserRole; registeredAt?: number; lastActiveAt?: number }
    ): AccountUserProfile {
        const registeredAt = this.normalizeTimestamp(user.registeredAt) ?? Date.now();

        return {
            id: user.id,
            username: user.name?.trim() || 'Player',
            email: user.email || null,
            image: user.image ?? null,
            role: user.role ?? 'user',
            registeredAt,
            lastActiveAt: this.normalizeTimestamp(user.lastActiveAt) ?? registeredAt,
        };
    }

    private async touchUserLastActive(
        user: AdapterUser & { role?: UserRole; registeredAt?: number; lastActiveAt?: number }
    ): Promise<StoredAdapterUser> {
        const storedUser = this.toStoredAdapterUser(user);
        const now = Date.now();
        if (storedUser.lastActiveAt >= now - AuthRepository.LAST_ACTIVE_WRITE_INTERVAL_MS) {
            return storedUser;
        }

        const userId = this.parseObjectId(storedUser.id);
        if (!userId) {
            return {
                ...storedUser,
                lastActiveAt: now,
            };
        }

        const collection = await this.getUsersCollection();
        await collection.updateOne(
            { _id: userId },
            {
                $set: {
                    lastActiveAt: now,
                }
            }
        );

        return {
            ...storedUser,
            lastActiveAt: now,
        };
    }

    private resolveRegisteredAt(document: Pick<AuthUserDocument, '_id' | 'registeredAt'>): number {
        return this.normalizeTimestamp(document.registeredAt)
            ?? document._id.getTimestamp().valueOf();
    }

    private resolveLastActiveAt(
        document: Pick<AuthUserDocument, 'lastActiveAt'>,
        registeredAt: number
    ): number {
        return this.normalizeTimestamp(document.lastActiveAt) ?? registeredAt;
    }

    private normalizeTimestamp(value: number | undefined | null): number | null {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return null;
        }

        return Math.max(0, Math.floor(value));
    }

    private toStoredAdapterUser(
        user: AdapterUser & { role?: UserRole; registeredAt?: number; lastActiveAt?: number }
    ): StoredAdapterUser {
        const registeredAt = this.normalizeTimestamp(user.registeredAt) ?? Date.now();

        return {
            ...user,
            role: user.role ?? 'user',
            registeredAt,
            lastActiveAt: this.normalizeTimestamp(user.lastActiveAt) ?? registeredAt,
        };
    }

    private normalizeAccountPreferences(value: unknown): AccountPreferences {
        const result = zAccountPreferences.safeParse(value ?? {});
        return result.success ? result.data : DEFAULT_ACCOUNT_PREFERENCES;
    }

    private toUserDocument(user: Partial<AdapterUser>): Omit<AuthUserDocument, '_id'> {
        const document: Omit<AuthUserDocument, '_id'> = {};

        if (user.name !== undefined) {
            document.name = user.name ?? null;
        }

        if (user.email !== undefined) {
            document.email = user.email ?? null;
        }

        if (user.emailVerified !== undefined) {
            document.emailVerified = user.emailVerified ?? null;
        }

        if (user.image !== undefined) {
            document.image = user.image ?? null;
        }

        return document;
    }

    private toUserUpdateDocument(user: Partial<AdapterUser>): Partial<AuthUserDocument> {
        const document = this.toUserDocument(user);
        return document;
    }

    private toAccountDocument(account: AdapterAccount): Omit<AuthAccountDocument, '_id' | 'userId'> {
        const document: Omit<AuthAccountDocument, '_id' | 'userId'> = {
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
        };

        if (account.refresh_token !== undefined) {
            document.refresh_token = account.refresh_token;
        }

        if (account.access_token !== undefined) {
            document.access_token = account.access_token;
        }

        if (account.expires_at !== undefined) {
            document.expires_at = account.expires_at;
        }

        if (account.token_type !== undefined) {
            document.token_type = account.token_type;
        }

        if (account.scope !== undefined) {
            document.scope = account.scope;
        }

        if (account.id_token !== undefined) {
            document.id_token = account.id_token;
        }

        if (account.session_state !== undefined) {
            document.session_state = account.session_state;
        }

        return document;
    }
}
