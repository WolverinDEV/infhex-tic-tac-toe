import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import type { Collection, Document } from 'mongodb';
import { ROOT_LOGGER } from '../logger';
import { MongoDatabase } from './mongoClient';

export type MetricDetails = Record<string, unknown>;

export interface MetricDocument extends Document {
    event: string;
    timestamp: string;
    details: MetricDetails;
}

const mongoDbName = process.env.MONGODB_DB_NAME ?? 'ih3t';
const mongoCollectionName = process.env.MONGODB_METRICS_COLLECTION ?? 'metrics';

@injectable()
export class MetricsRepository {
    private collectionPromise: Promise<Collection<MetricDocument>> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase
    ) {
        this.logger = rootLogger.child({ component: 'metrics-repository' });
    }

    async persist(document: MetricDocument): Promise<void> {
        const collection = await this.getCollection();

        try {
            await collection.insertOne(document);
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                type: 'metric',
                event: 'metrics-write-error',
                storage: 'mongodb',
                metricEvent: document.event
            }, 'Failed to write metric');
        }
    }

    private async getCollection(): Promise<Collection<MetricDocument>> {
        if (this.collectionPromise !== null) {
            return this.collectionPromise;
        }

        this.collectionPromise = (async () => {
            const database = await this.mongoDatabase.getDatabase();
            const collection = database.collection<MetricDocument>(mongoCollectionName);
            await collection.createIndex({ timestamp: -1 });
            await collection.createIndex({ event: 1, timestamp: -1 });

            this.logger.info({
                type: 'metric',
                event: 'metrics-storage-ready',
                storage: 'mongodb',
                database: mongoDbName,
                collection: mongoCollectionName
            }, 'Metrics storage ready');

            return collection;
        })().catch((error: unknown) => {
            this.collectionPromise = null;

            this.logger.error({
                err: error,
                type: 'metric',
                event: 'metrics-storage-error',
                storage: 'mongodb',
            }, 'Failed to initialize metrics storage');

            throw error;
        });

        return this.collectionPromise;
    }
}
