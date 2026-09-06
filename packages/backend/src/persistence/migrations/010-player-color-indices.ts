import { buildPlayerTileConfigMap } from '@ih3t/shared';

import { GAME_HISTORY_COLLECTION_NAME } from '../mongoCollections';
import type { DatabaseMigration } from './types';

export const playerColorIndicesMigration: DatabaseMigration = {
    id: `010-player-color-indices`,
    description: `Replace stored player colors with indices derived from player order`,
    async up({ database, logger }) {
        const collection = database.collection<{ players: { playerId: string }[] }>(GAME_HISTORY_COLLECTION_NAME);
        let migratedGames = 0;

        // Include finished and unfinished games, including records without a config.
        // Replace the entire map to remove legacy colors and stale player entries.
        for await (const document of collection.find({}, { projection: { players: 1 } })) {
            const playerIds = document.players.map((player) => player.playerId);
            await collection.updateOne(
                { _id: document._id },
                { $set: { playerTiles: buildPlayerTileConfigMap(playerIds) } },
            );
            migratedGames += 1;
        }

        logger.info({ migratedGames }, `Migrated player color indices`);
    },
};
