import type { AccountBot, AccountBotCapabilities, AccountBotName } from '@ih3t/shared';
import { zAccountBot, zAccountBotCapabilities, zAccountBotName } from '@ih3t/shared';
import type { Collection, Document } from 'mongodb';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';
import { ACCOUNT_BOTS_COLLECTION_NAME } from './mongoCollections';

const zAccountBotDocument = z.object({
    id: z.string().trim()
        .min(1),
    ownerProfileId: z.string().trim()
        .min(1),
    name: zAccountBotName,
    endpoint: z.string().trim()
        .min(1),
    createdAt: z.number().int()
        .nonnegative(),
    updatedAt: z.number().int()
        .nonnegative(),
    capabilities: zAccountBotCapabilities,
});

type AccountBotDocument = z.infer<typeof zAccountBotDocument> & Document;

type CreateAccountBotParams = {
    id: string;
    ownerProfileId: string;
    name: AccountBotName;
    endpoint: string;
    createdAt: number;
    updatedAt: number;
    capabilities: AccountBotCapabilities;
};

type UpdateAccountBotParams = {
    name: AccountBotName;
    endpoint: string;
    updatedAt: number;
    capabilities: AccountBotCapabilities;
};

@injectable()
export class AccountBotRepository {
    private collectionPromise: Promise<Collection<AccountBotDocument>> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase,
    ) {
        this.logger = rootLogger.child({ component: `account-bot-repository` });
    }

    async countByOwnerProfileId(ownerProfileId: string): Promise<number> {
        const collection = await this.getCollection();
        return await collection.countDocuments({ ownerProfileId });
    }

    async listByOwnerProfileId(ownerProfileId: string): Promise<AccountBot[]> {
        const collection = await this.getCollection();
        const documents = await collection.find({ ownerProfileId })
            .sort({ updatedAt: -1, id: 1 })
            .toArray();

        return documents.map((document) => zAccountBot.parse(document));
    }

    async getById(id: string): Promise<AccountBot | null> {
        const collection = await this.getCollection();
        const document = await collection.findOne({ id });
        return document ? zAccountBot.parse(document) : null;
    }

    async getByOwnerProfileIdAndId(ownerProfileId: string, id: string): Promise<AccountBot | null> {
        const collection = await this.getCollection();
        const document = await collection.findOne({ ownerProfileId, id });
        return document ? zAccountBot.parse(document) : null;
    }

    async createBot(params: CreateAccountBotParams): Promise<AccountBot> {
        const collection = await this.getCollection();
        const document = zAccountBotDocument.parse(params);
        await collection.insertOne(document);
        return zAccountBot.parse(document);
    }

    async updateBot(ownerProfileId: string, id: string, params: UpdateAccountBotParams): Promise<AccountBot | null> {
        const collection = await this.getCollection();
        const update = z.object({
            name: zAccountBotName,
            endpoint: z.string().trim()
                .min(1),
            updatedAt: z.number().int()
                .nonnegative(),
            capabilities: zAccountBotCapabilities,
        }).parse(params);

        const document = await collection.findOneAndUpdate(
            { ownerProfileId, id },
            {
                $set: update,
            },
            {
                returnDocument: `after`,
            },
        );

        return document ? zAccountBot.parse(document) : null;
    }

    async deleteBot(ownerProfileId: string, id: string): Promise<boolean> {
        const collection = await this.getCollection();
        const result = await collection.deleteOne({ ownerProfileId, id });
        return result.deletedCount > 0;
    }

    private async getCollection(): Promise<Collection<AccountBotDocument>> {
        if (this.collectionPromise !== null) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<AccountBotDocument>(ACCOUNT_BOTS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.collectionPromise = null;
            this.logger.error({ err: error, event: `account-bots.init.failed` }, `Failed to initialize account bots collection`);
            throw error;
        });

        return this.collectionPromise;
    }
}
