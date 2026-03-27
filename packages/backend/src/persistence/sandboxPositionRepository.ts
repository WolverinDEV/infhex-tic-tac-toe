import {
    type SandboxGamePosition,
    type SandboxPositionName,
    zSandboxGamePosition,
    zSandboxPositionId,
    zSandboxPositionName,
} from '@ih3t/shared';
import type { Collection, Document } from 'mongodb';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';
import { SANDBOX_POSITIONS_COLLECTION_NAME } from './mongoCollections';

const zSandboxPositionDocument = z.object({
    id: zSandboxPositionId,
    name: zSandboxPositionName,
    gamePosition: zSandboxGamePosition,
    createdAt: z.number().int()
        .nonnegative(),
    createdBy: z.string().trim()
        .min(1),
    loadCount: z.number().int()
        .nonnegative(),
});

type SandboxPositionDocument = z.infer<typeof zSandboxPositionDocument> & Document;

type CreateSandboxPositionDocumentParams = {
    id: string;
    name: SandboxPositionName;
    gamePosition: SandboxGamePosition;
    createdAt: number;
    createdBy: string;
};

export type LoadedSandboxPositionRecord = {
    name: SandboxPositionName;
    gamePosition: SandboxGamePosition;
};

@injectable()
export class SandboxPositionRepository {
    private collectionPromise: Promise<Collection<SandboxPositionDocument>> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase,
    ) {
        this.logger = rootLogger.child({ component: `sandbox-position-repository` });
    }

    async createPosition(params: CreateSandboxPositionDocumentParams): Promise<string> {
        const collection = await this.getCollection();
        const document = zSandboxPositionDocument.parse({
            id: params.id,
            name: params.name,
            gamePosition: params.gamePosition,
            createdAt: params.createdAt,
            createdBy: params.createdBy,
            loadCount: 0,
        });

        await collection.insertOne(document);
        return document.id;
    }

    async getPositionAndIncrementLoadCount(id: string): Promise<LoadedSandboxPositionRecord | null> {
        const collection = await this.getCollection();
        const document = await collection.findOneAndUpdate(
            { id },
            {
                $inc: {
                    loadCount: 1,
                },
            },
            {
                returnDocument: `after`,
            },
        );

        if (!document) {
            return null;
        }

        const parsedDocument = zSandboxPositionDocument.parse(document);
        return {
            name: parsedDocument.name,
            gamePosition: parsedDocument.gamePosition,
        };
    }

    async getPosition(id: string): Promise<LoadedSandboxPositionRecord | null> {
        const collection = await this.getCollection();
        const document = await collection.findOne({ id });
        if (!document) {
            return null;
        }

        const parsedDocument = zSandboxPositionDocument.parse(document);
        return {
            name: parsedDocument.name,
            gamePosition: parsedDocument.gamePosition,
        };
    }

    private async getCollection(): Promise<Collection<SandboxPositionDocument>> {
        if (this.collectionPromise !== null) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<SandboxPositionDocument>(SANDBOX_POSITIONS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.collectionPromise = null;
            this.logger.error({ err: error, event: `sandbox-positions.init.failed` }, `Failed to initialize sandbox positions collection`);
            throw error;
        });

        return this.collectionPromise;
    }
}
