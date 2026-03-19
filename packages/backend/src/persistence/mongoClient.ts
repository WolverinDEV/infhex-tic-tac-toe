import '../env.js';
import { injectable } from 'tsyringe';
import { MongoClient, type Db } from 'mongodb';
import { ServerConfig } from '../config/serverConfig';

@injectable()
export class MongoDatabase {
    private mongoClient: MongoClient | null = null;
    private databasePromise: Promise<Db> | null = null;

    constructor(private readonly serverConfig: ServerConfig) {}

    async getDatabase(): Promise<Db> {
        if (this.databasePromise !== null) {
            return this.databasePromise;
        }

        this.databasePromise = (async () => {
            this.mongoClient = new MongoClient(this.serverConfig.mongoUri);
            await this.mongoClient.connect();
            return this.mongoClient.db(this.serverConfig.mongoDbName);
        })().catch((error: unknown) => {
            this.databasePromise = null;
            this.mongoClient = null;

            console.error(JSON.stringify({
                type: 'mongo',
                event: 'connection-error',
                timestamp: new Date().toISOString(),
                database: this.serverConfig.mongoDbName,
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
