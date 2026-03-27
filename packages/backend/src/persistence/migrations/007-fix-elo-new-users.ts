import type { DatabaseMigration } from './types';
import { AUTH_USERS_COLLECTION_NAME } from '../mongoCollections';
import { DEFAULT_PLAYER_ELO } from '../../elo/eloRepository';

type AuthUserDocument = {
    elo: number,
    highestElo: number
}
export default {
    id: '007-fix-elo-new-users',
    description: 'Fix ELO for new users which started at 100',
    async up({ database, logger }) {
        const collection = database.collection<AuthUserDocument>(AUTH_USERS_COLLECTION_NAME);
        {
            const updated = await collection.updateMany({
                highestElo: 1000,
                elo: { $lt: 200 }
            }, {
                $set: {
                    highestElo: undefined,
                },
                $inc: {
                    elo: 950
                }
            });
            logger.info(
                {
                    count: updated.modifiedCount
                },
                `Migrated users with invalid highest elo`
            )
        }


        {
            const updated = await collection.updateMany({
                elo: {
                    $exists: false
                }
            }, {
                $set: {
                    elo: DEFAULT_PLAYER_ELO,
                },
            });
            logger.info(
                {
                    count: updated.modifiedCount
                },
                `Applied default ELO to users without elo`
            )
        }
    }
} satisfies DatabaseMigration;
