import { ObjectId } from 'mongodb';

import { AUTH_USERS_COLLECTION_NAME, GAME_HISTORY_COLLECTION_NAME } from '../mongoCollections';
import type { DatabaseMigration } from './types';

export const lastGamePlayedAtMigration: DatabaseMigration = {
    id: `011-last-game-played-at`,
    description: `Backfill users' last rated game timestamp and index leaderboard activity`,
    async up({ database }) {
        const users = database.collection(AUTH_USERS_COLLECTION_NAME);
        await users.updateMany(
            { lastGamePlayedAt: { $exists: false } },
            { $set: { lastGamePlayedAt: null } },
        );

        const latestGames = database.collection(GAME_HISTORY_COLLECTION_NAME).aggregate<{
            _id: string;
            lastGamePlayedAt: number;
        }>([
            { $match: { 'gameOptions.rated': true, finishedAt: { $type: `number` } } },
            { $unwind: `$players` },
            { $match: { 'players.profileId': { $type: `string` } } },
            { $group: { _id: `$players.profileId`, lastGamePlayedAt: { $max: `$finishedAt` } } },
        ], { allowDiskUse: true });

        for await (const player of latestGames) {
            if (!ObjectId.isValid(player._id)) {
                continue;
            }
            await users.updateOne(
                { _id: new ObjectId(player._id) },
                { $max: { lastGamePlayedAt: player.lastGamePlayedAt } },
            );
        }

        await users.createIndex(
            { lastGamePlayedAt: -1, elo: -1, ratedGamesPlayed: -1, _id: 1 },
            { partialFilterExpression: { ratedGamesPlayed: { $gt: 0 } } },
        );
    },
};
