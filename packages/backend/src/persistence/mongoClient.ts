import '../env.js';
import { inject, injectable } from 'tsyringe';
import { MongoClient, type Db } from 'mongodb';
import { ServerTokens } from '../di/tokens';

@injectable()
export class MongoDatabase {
    private mongoClient: MongoClient | null = null;
    private databasePromise: Promise<Db> | null = null;

    constructor(
        @inject(ServerTokens.MongoUri) private readonly mongoUri: string,
        @inject(ServerTokens.MongoDbName) private readonly mongoDbName: string
    ) {}

    async getDatabase(): Promise<Db> {
        if (this.databasePromise !== null) {
            return this.databasePromise;
        }

        this.databasePromise = (async () => {
            this.mongoClient = new MongoClient(this.mongoUri);
            await this.mongoClient.connect();
            return this.mongoClient.db(this.mongoDbName);
        })().catch((error: unknown) => {
            this.databasePromise = null;
            this.mongoClient = null;

            console.error(JSON.stringify({
                type: 'mongo',
                event: 'connection-error',
                timestamp: new Date().toISOString(),
                database: this.mongoDbName,
                message: error instanceof Error ? error.message : String(error)
            }));

            throw error;
        });

        return this.databasePromise;
    }

    async close(): Promise<void> {
        const client = this.mongoClient;
        this.mongoClient = null;
        this.databasePromise = null;

        if (!client) {
            return;
        }

        await client.close();
    }
}
