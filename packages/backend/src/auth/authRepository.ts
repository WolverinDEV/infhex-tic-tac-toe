import type {
    Adapter,
    AdapterAccount,
    AdapterSession,
    AdapterUser,
} from '@auth/express/adapters';
import type { Logger } from 'pino';
import { Collection, ObjectId, type Document } from 'mongodb';
import { inject, injectable } from 'tsyringe';
import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from '../persistence/mongoClient';

interface AuthUserDocument extends Document {
    _id: ObjectId;
    name?: string | null;
    email?: string | null;
    emailVerified?: Date | null;
    image?: string | null;
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

export interface AccountUserProfile {
    id: string;
    username: string;
    email: string | null;
    image: string | null;
}

const USERS_COLLECTION_NAME = process.env.MONGODB_AUTH_USERS_COLLECTION ?? 'users';
const ACCOUNTS_COLLECTION_NAME = process.env.MONGODB_AUTH_ACCOUNTS_COLLECTION ?? 'accounts';
const SESSIONS_COLLECTION_NAME = process.env.MONGODB_AUTH_SESSIONS_COLLECTION ?? 'sessions';
const VERIFICATION_TOKENS_COLLECTION_NAME = process.env.MONGODB_AUTH_VERIFICATION_TOKENS_COLLECTION ?? 'verificationTokens';

@injectable()
export class AuthRepository implements Adapter {
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
        const now = new ObjectId();
        const document: AuthUserDocument = {
            _id: now,
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

        return this.mapAccountUserProfile(sessionAndUser.user);
    }

    async updateUsername(userId: string, username: string): Promise<AccountUserProfile | null> {
        const updatedUser = await this.updateUser({
            id: userId,
            name: username,
        });

        return this.mapAccountUserProfile(updatedUser);
    }

    private async getUsersCollection(): Promise<Collection<AuthUserDocument>> {
        if (this.usersCollectionPromise) {
            return this.usersCollectionPromise;
        }

        this.usersCollectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            const collection = database.collection<AuthUserDocument>(USERS_COLLECTION_NAME);
            await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
            return collection;
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
            const collection = database.collection<AuthAccountDocument>(ACCOUNTS_COLLECTION_NAME);
            await collection.createIndex({ provider: 1, providerAccountId: 1 }, { unique: true });
            await collection.createIndex({ userId: 1, provider: 1 });
            return collection;
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
            const collection = database.collection<AuthSessionDocument>(SESSIONS_COLLECTION_NAME);
            await collection.createIndex({ sessionToken: 1 }, { unique: true });
            await collection.createIndex({ userId: 1, expires: 1 });
            await collection.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
            return collection;
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
            const collection = database.collection<AuthVerificationTokenDocument>(VERIFICATION_TOKENS_COLLECTION_NAME);
            await collection.createIndex({ identifier: 1, token: 1 }, { unique: true });
            await collection.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
            return collection;
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

    private mapUserDocument(document: AuthUserDocument): AdapterUser {
        return {
            id: document._id.toHexString(),
            name: document.name ?? null,
            email: document.email ?? '',
            emailVerified: document.emailVerified ?? null,
            image: document.image ?? null,
        };
    }

    private mapSessionDocument(document: AuthSessionDocument): AdapterSession {
        return {
            sessionToken: document.sessionToken,
            userId: document.userId.toHexString(),
            expires: document.expires,
        };
    }

    private mapAccountUserProfile(user: AdapterUser): AccountUserProfile {
        return {
            id: user.id,
            username: user.name?.trim() || 'Player',
            email: user.email || null,
            image: user.image ?? null,
        };
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
