import type { Db } from 'mongodb';
import type { Logger } from 'pino';

export type DatabaseMigrationContext = {
    database: Db;
    logger: Logger;
};

export type DatabaseMigration = {
    id: string;
    description: string;
    up(context: DatabaseMigrationContext): Promise<void>;
};
