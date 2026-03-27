import type { Logger } from 'pino';
import { MongoServerError, type Document } from 'mongodb';
import { inject, injectable } from 'tsyringe';
import { ROOT_LOGGER } from '../logger';
import { DATABASE_MIGRATIONS_COLLECTION_NAME } from './mongoCollections';
import { databaseMigrations } from './migrations';
import { MongoDatabase } from './mongoClient';

type AppliedMigrationDocument = {
    _id: string;
    description: string;
    appliedAt: string;
} & Document

@injectable()
export class DatabaseMigrationRunner {
    private readonly logger: Logger;
    private runPromise: Promise<void> | null = null;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase
    ) {
        this.logger = rootLogger.child({ component: 'database-migration-runner' });
    }

    async run(): Promise<void> {
        if (this.runPromise !== null) {
            return this.runPromise;
        }

        this.runPromise = this.runInternal().catch((error: unknown) => {
            this.runPromise = null;
            throw error;
        });

        return this.runPromise;
    }

    private async runInternal(): Promise<void> {
        const database = await this.mongoDatabase.getDatabase();
        const migrationsCollection = database.collection<AppliedMigrationDocument>(DATABASE_MIGRATIONS_COLLECTION_NAME);
        await migrationsCollection.createIndex({ appliedAt: 1 });

        for (const migration of databaseMigrations) {
            const existingMigration = await migrationsCollection.findOne(
                { _id: migration.id },
                { projection: { _id: 1 } }
            );
            if (existingMigration) {
                continue;
            }

            const logger = this.logger.child({ migrationId: migration.id });
            logger.info({
                event: 'database.migration.started',
                description: migration.description
            }, 'Running database migration');

            await migration.up({ database, logger });

            try {
                await migrationsCollection.insertOne({
                    _id: migration.id,
                    description: migration.description,
                    appliedAt: new Date().toISOString()
                });
            } catch (error: unknown) {
                if (error instanceof MongoServerError && error.code === 11000) {
                    logger.warn({
                        event: 'database.migration.raced'
                    }, 'Database migration was already recorded by another process');
                    continue;
                }

                throw error;
            }

            logger.info({
                event: 'database.migration.completed'
            }, 'Database migration completed');
        }
    }
}
