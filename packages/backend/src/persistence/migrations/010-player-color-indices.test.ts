import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlayerTileConfigMap, zPlayerTileConfig } from '@ih3t/shared';
import type { Db, Document } from 'mongodb';
import pino from 'pino';

import { GAME_HISTORY_COLLECTION_NAME } from '../mongoCollections';
import { playerColorIndicesMigration } from './010-player-color-indices';

test(`player indices follow session order and only allow two players`, () => {
    assert.deepEqual(buildPlayerTileConfigMap([`guest`, `host`]), {
        guest: { colorIndex: 0 },
        host: { colorIndex: 1 },
    });
    assert.equal(zPlayerTileConfig.safeParse({ colorIndex: 2 }).success, false);
    assert.equal(zPlayerTileConfig.safeParse({ colorIndex: -1 }).success, false);
    assert.throws(() => buildPlayerTileConfigMap([`a`, `b`, `c`]));
});

test(`migration replaces every stored config by player order and is repeatable`, async () => {
    const documents: Document[] = [
        {
            _id: `finished`,
            players: [{ playerId: `second` }, { playerId: `first` }],
            playerTiles: {
                first: { color: `#abcdef` },
                second: { color: `#123456` },
                stale: { color: `#ffffff` },
            },
            finishedAt: 123,
            moves: [{ playerId: `first`, x: 0, y: 0 }],
            tournament: { tournamentId: `tournament` },
        },
        { _id: `unfinished`, players: [{ playerId: `a` }, { playerId: `b` }], finishedAt: null },
        { _id: `empty`, players: [], playerTiles: {} },
        { _id: `single`, players: [{ playerId: `a` }], playerTiles: { a: { colorIndex: 1 } } },
    ];
    const original = structuredClone(documents);
    const database = {
        collection(name: string) {
            assert.equal(name, GAME_HISTORY_COLLECTION_NAME);
            return {
                async *find(filter: Document) {
                    assert.deepEqual(filter, {});
                    yield* documents;
                },
                async updateOne(filter: Document, update: Document) {
                    const document = documents.find((candidate) => candidate._id === filter._id);
                    assert.ok(document);
                    Object.assign(document, update.$set);
                },
            };
        },
    } as unknown as Db;
    const context = { database, logger: pino({ enabled: false }) };

    await playerColorIndicesMigration.up(context);
    assert.deepEqual(documents.map((document) => document.playerTiles), [
        { second: { colorIndex: 0 }, first: { colorIndex: 1 } },
        { a: { colorIndex: 0 }, b: { colorIndex: 1 } },
        {},
        { a: { colorIndex: 0 } },
    ]);
    for (const [index, document] of documents.entries()) {
        const { playerTiles: _oldConfig, ...before } = original[index];
        const { playerTiles: _newConfig, ...after } = document;
        assert.deepEqual(after, before);
    }
    const migrated = structuredClone(documents);
    await playerColorIndicesMigration.up(context);
    assert.deepEqual(documents, migrated);
});
