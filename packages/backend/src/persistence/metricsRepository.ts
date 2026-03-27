import type { Collection, Document } from 'mongodb';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';

import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';
import { METRICS_COLLECTION_NAME } from './mongoCollections';

export type MetricDetails = Record<string, unknown>;

export type MetricDocument = {
    event: string;
    timestamp: string;
    details: MetricDetails;
} & Document;

@injectable()
export class MetricsRepository {
    private collectionPromise: Promise<Collection<MetricDocument>> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase,
    ) {
        this.logger = rootLogger.child({ component: `metrics-repository` });
    }

    async persist(document: MetricDocument): Promise<void> {
        const collection = await this.getCollection();

        try {
            await collection.insertOne(document);
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: `metric`,
                event: `metrics-write-error`,
                storage: `mongodb`,
                metricEvent: document.event,
            }, `Failed to write metric`);
        }
    }

    async countByEventBetween(event: string, startTimestamp: string, endTimestamp: string): Promise<number> {
        const collection = await this.getCollection();
        return await collection.countDocuments({
            event,
            timestamp: {
                $gte: startTimestamp,
                $lte: endTimestamp,
            },
        });
    }

    private async getCollection(): Promise<Collection<MetricDocument>> {
        if (this.collectionPromise !== null) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            return database.collection<MetricDocument>(METRICS_COLLECTION_NAME);
        })().catch((error: unknown) => {
            this.collectionPromise = null;

            this.logger.error({
                err: error,
                type: `metric`,
                event: `metrics-storage-error`,
                storage: `mongodb`,
            }, `Failed to initialize metrics storage`);

            throw error;
        });

        return this.collectionPromise;
    }
}
