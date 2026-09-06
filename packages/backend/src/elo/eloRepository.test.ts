import 'reflect-metadata';

import assert from 'node:assert/strict';
import test from 'node:test';

import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import pino from 'pino';

import { lastGamePlayedAtMigration } from '../persistence/migrations/011-last-game-played-at';
import type { MongoDatabase } from '../persistence/mongoClient';
import { AUTH_USERS_COLLECTION_NAME, GAME_HISTORY_COLLECTION_NAME } from '../persistence/mongoCollections';
import { EloRepository } from './eloRepository';

test(`leaderboard eligibility uses completed rated games within the last 30 days`, async () => {
    const server = await MongoMemoryServer.create();
    const client = new MongoClient(server.getUri());
    try {
        await client.connect();
        const database = client.db(`leaderboard-test`);
        const repository = new EloRepository(pino({ level: `silent` }), {
            getDatabase: async () => database,
        } as MongoDatabase);
        const nowMs = 1_800_000_000_000;
        const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
        const ids = Array.from({ length: 6 }, () => new ObjectId());
        await database.collection(AUTH_USERS_COLLECTION_NAME).insertMany(ids.map((_id, index) => ({
            _id,
            elo: 2000 - index * 100,
            ratedGamesPlayed: 10,
        })));
        await database.collection(GAME_HISTORY_COLLECTION_NAME).insertMany([
            { finishedAt: cutoff - 1, rated: true },
            { finishedAt: nowMs, rated: false },
            { finishedAt: null, rated: true },
            { finishedAt: nowMs + 1, rated: true },
            { finishedAt: cutoff, rated: true },
            { finishedAt: nowMs, rated: true },
        ].map(({ finishedAt, rated }, index) => ({
            finishedAt,
            gameOptions: { rated },
            players: [{ profileId: ids[index].toHexString() }, { profileId: null }],
        })));

        const migrationContext = { database, logger: pino({ level: `silent` }) };
        await database.collection(GAME_HISTORY_COLLECTION_NAME).insertOne({
            finishedAt: cutoff - 100,
            gameOptions: { rated: true },
            players: [{ profileId: ids[5].toHexString() }, { profileId: `invalid` }],
        });
        await lastGamePlayedAtMigration.up(migrationContext);
        await lastGamePlayedAtMigration.up(migrationContext);
        const users = database.collection(AUTH_USERS_COLLECTION_NAME);
        assert.equal((await users.findOne({ _id: ids[5] }))?.lastGamePlayedAt, nowMs);
        assert.equal((await users.findOne({ _id: ids[1] }))?.lastGamePlayedAt, null);
        assert.equal((await users.findOne({ _id: ids[2] }))?.lastGamePlayedAt, null);
        // Leaderboard reads must work independently of game history after migration.
        await database.collection(GAME_HISTORY_COLLECTION_NAME).drop();

        const topPlayers = await repository.getTopLeaderboardPlayers(1, nowMs);
        assert.deepEqual(topPlayers.map((player) => player.profileId), [ids[4].toHexString()]);
        assert.equal((await repository.getLeaderboardPlacement(ids[4].toHexString(), nowMs))?.rank, 1);
        assert.equal((await repository.getLeaderboardPlacement(ids[5].toHexString(), nowMs))?.rank, 2);
        for (const id of ids.slice(0, 4)) {
            assert.equal(await repository.getLeaderboardPlacement(id.toHexString(), nowMs), null);
        }
        assert.deepEqual(await repository.getTopLeaderboardPlayers(10, nowMs + 31 * 24 * 60 * 60 * 1000), []);

        const beforeAdjustment = Date.now();
        const rating = await repository.performEloAdjustment(ids[1].toHexString(), 0);
        const updatedUser = await users.findOne({ _id: ids[1] });
        assert.ok(updatedUser);
        assert.ok(updatedUser.lastGamePlayedAt >= beforeAdjustment);
        assert.ok(updatedUser.lastGamePlayedAt <= Date.now());
        assert.equal(rating.gameCount, 11);
        assert.equal((await repository.getLeaderboardPlacement(ids[1].toHexString()))?.rank, 1);
    } finally {
        await client.close();
        await server.stop();
    }
});
