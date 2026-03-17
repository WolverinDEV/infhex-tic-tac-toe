import './env';
import { MongoClient, type Collection, type Document } from 'mongodb';

type MetricDetails = Record<string, unknown>;

interface MetricDocument extends Document {
    event: string;
    timestamp: string;
    details: MetricDetails,
}

const mongoUri = process.env.MONGODB_URI ?? null;
const mongoDbName = process.env.MONGODB_DB_NAME ?? 'ih3t';
const mongoCollectionName = process.env.MONGODB_METRICS_COLLECTION ?? 'metrics';

let mongoClient: MongoClient | null = null;
let collectionPromise: Promise<Collection<MetricDocument> | null> | null = null;

async function getMetricsCollection(): Promise<Collection<MetricDocument> | null> {
    if (!mongoUri) {
        return null;
    }

    if (collectionPromise !== null) {
        return collectionPromise;
    }

    collectionPromise = (async () => {
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();

        const database = mongoClient.db(mongoDbName);
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
        collectionPromise = null;
        mongoClient = null;

        console.error(JSON.stringify({
            type: 'metric',
            event: 'metrics-storage-error',
            timestamp: new Date().toISOString(),
            storage: 'mongodb',
            message: error instanceof Error ? error.message : String(error)
        }));

        return null;
    });

    return collectionPromise;
}

async function persistMetric(document: MetricDocument): Promise<void> {
    const collection = await getMetricsCollection();
    if (!collection) {
        return;
    }

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

export function logMetric(event: string, details: MetricDetails): void {
    const document: MetricDocument = {
        event,
        timestamp: new Date().toISOString(),
        details,
    };

    console.log(JSON.stringify(document));
    void persistMetric(document);
}

export async function closeMetricLogger(): Promise<void> {
    const client = mongoClient;
    mongoClient = null;
    collectionPromise = null;

    if (!client) {
        return;
    }

    await client.close();
}
