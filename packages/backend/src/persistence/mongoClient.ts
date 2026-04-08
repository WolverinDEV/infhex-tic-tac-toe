import '../env.js';

import { type Db, MongoClient } from 'mongodb';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';

import { ServerConfig } from '../config/serverConfig';
import { ROOT_LOGGER } from '../logger';

@injectable()
export class MongoDatabase {
    private mongoClient: MongoClient | null = null;
    private databasePromise: Promise<Db> | null = null;
    private memoryServerStop: (() => Promise<void>) | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ServerConfig) private readonly serverConfig: ServerConfig,
    ) {
        this.logger = rootLogger.child({ component: `mongo-database` });
    }

    async getDatabase(): Promise<Db> {
        if (this.databasePromise !== null) {
            return this.databasePromise;
        }

        this.databasePromise = (async () => {
            try {
                return await this.connectToDatabase(this.serverConfig.mongoUri, `configured`);
            } catch (error: unknown) {
                if (!this.serverConfig.isDevelopment || !this.serverConfig.mongoUseMemoryFallback) {
                    throw error;
                }

                this.logger.warn({
                    err: error,
                    event: `mongo.fallback.starting`,
                    database: this.serverConfig.mongoDbName,
                }, `MongoDB is unavailable; starting an ephemeral development database`);

                const fallbackUri = await this.startMemoryServer();
                return await this.connectToDatabase(fallbackUri, `memory`);
            }
        })().catch((error: unknown) => {
            this.databasePromise = null;
            this.mongoClient = null;

            this.logger.error({
                err: error,
                type: `mongo`,
                event: `connection-error`,
                database: this.serverConfig.mongoDbName,
            }, `Failed to connect to MongoDB`);

            throw error;
        });

        return this.databasePromise;
    }

    async close(): Promise<void> {
        const client = this.mongoClient;
        const stopMemoryServer = this.memoryServerStop;
        this.mongoClient = null;
        this.databasePromise = null;
        this.memoryServerStop = null;

        if (client) {
            await client.close();
            this.logger.info({
                event: `mongo.closed`,
                database: this.serverConfig.mongoDbName,
            }, `Closed MongoDB connection`);
        }

        if (stopMemoryServer) {
            await stopMemoryServer();
            this.logger.info({
                event: `mongo.memory.closed`,
                database: this.serverConfig.mongoDbName,
            }, `Stopped ephemeral MongoDB server`);
        }
    }

    private async connectToDatabase(uri: string, source: `configured` | `memory`): Promise<Db> {
        this.mongoClient = new MongoClient(uri);
        await this.mongoClient.connect();
        this.logger.info({
            event: `mongo.connected`,
            database: this.serverConfig.mongoDbName,
            source,
        }, `Connected to MongoDB`);
        return this.mongoClient.db(this.serverConfig.mongoDbName);
    }

    private async startMemoryServer(): Promise<string> {
        if (this.memoryServerStop) {
            throw new Error(`Ephemeral MongoDB server was already started without an active connection.`);
        }

        const { MongoMemoryServer } = await import(`mongodb-memory-server`);
        const memoryServer = await MongoMemoryServer.create({
            instance: {
                dbName: this.serverConfig.mongoDbName,
            },
        });
        this.memoryServerStop = async () => {
            await memoryServer.stop();
        };

        return memoryServer.getUri();
    }
}
