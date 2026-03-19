import { injectable } from 'tsyringe';
import type { Collection, Document } from 'mongodb';
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

    constructor(private readonly mongoDatabase: MongoDatabase) {}

    async persist(document: MetricDocument): Promise<void> {
        const collection = await this.getCollection();

        try {
            await collection.insertOne(document);
        } catch (error: unknown) {
            console.error(JSON.stringify({
                type: 'metric',
                event: 'metrics-write-error',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                message: error instanceof Error ? error.message : String(error),
                metricEvent: document.event
            }));
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

            console.log(JSON.stringify({
                type: 'metric',
                event: 'metrics-storage-ready',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                database: mongoDbName,
                collection: mongoCollectionName
            }));

            return collection;
        })().catch((error: unknown) => {
            this.collectionPromise = null;

            console.error(JSON.stringify({
                type: 'metric',
                event: 'metrics-storage-error',
                timestamp: new Date().toISOString(),
                storage: 'mongodb',
                message: error instanceof Error ? error.message : String(error)
            }));

            throw error;
        });

        return this.collectionPromise;
    }
}
