import '../env.js';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { MongoClient, type Db } from 'mongodb';
import { ServerConfig } from '../config/serverConfig';
import { ROOT_LOGGER } from '../logger';

@injectable()
export class MongoDatabase {
    private mongoClient: MongoClient | null = null;
    private databasePromise: Promise<Db> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        private readonly serverConfig: ServerConfig
    ) {
        this.logger = rootLogger.child({ component: 'mongo-database' });
    }

    async getDatabase(): Promise<Db> {
        if (this.databasePromise !== null) {
            return this.databasePromise;
        }

        this.databasePromise = (async () => {
            this.mongoClient = new MongoClient(this.serverConfig.mongoUri);
            await this.mongoClient.connect();
            this.logger.info({
                event: 'mongo.connected',
                database: this.serverConfig.mongoDbName
            }, 'Connected to MongoDB');
            return this.mongoClient.db(this.serverConfig.mongoDbName);
        })().catch((error: unknown) => {
            this.databasePromise = null;
            this.mongoClient = null;

            this.logger.error({
                err: error,
                type: 'mongo',
                event: 'connection-error',
                database: this.serverConfig.mongoDbName,
            }, 'Failed to connect to MongoDB');

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
        this.logger.info({
            event: 'mongo.closed',
            database: this.serverConfig.mongoDbName
        }, 'Closed MongoDB connection');
    }
}
