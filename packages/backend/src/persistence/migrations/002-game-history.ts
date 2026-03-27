import type { Document } from 'mongodb';
import type { Logger } from 'pino';
import {
    buildPlayerTileConfigMap,
    type DatabaseGame,
    type DatabaseGamePlayer,
    type DatabaseGameResult,
    DEFAULT_LOBBY_OPTIONS,
    type LobbyOptions,
    type PlayerTileConfig,
    zDatabaseGame,
    zDatabaseGamePlayer,
    zDatabaseGameResult,
    zGameMove,
    zLobbyOptions,
    zSessionFinishReason,
} from '@ih3t/shared';
import { z } from 'zod';
import type { DatabaseMigration } from './types';
import { GAME_HISTORY_COLLECTION_NAME } from '../mongoCollections';

type GameHistoryDocument = z.infer<typeof zDatabaseGame> & Document;

const zVersion2GameHistoryDocument = z.object({
    _id: z.unknown().optional(),
    id: z.string(),
    version: z.literal(2),
    sessionId: z.string(),
    startedAt: z.number().int(),
    finishedAt: z.number().int().nullable(),
    players: z.array(zDatabaseGamePlayer),
    gameOptions: zLobbyOptions,
    moves: z.array(zGameMove),
    moveCount: z.number().int().nonnegative(),
    gameResult: zDatabaseGameResult.nullable(),
    playerTiles: z.record(z.string(), z.object({
        color: z.string()
    })).optional()
});
type Version2GameHistoryDocument = z.infer<typeof zVersion2GameHistoryDocument> & Document;

const zLegacyGameHistoryDocument = z.object({
    _id: z.unknown().optional(),
    id: z.string(),
    sessionId: z.string(),
    state: z.enum(['lobby', 'in-game', 'finished']).optional(),
    players: z.array(z.string()).optional(),
    playerNames: z.record(z.string(), z.string()).optional(),
    playerProfileIds: z.record(z.string(), z.string().nullable()).optional(),
    winningPlayerId: z.string().nullable().optional(),
    reason: zSessionFinishReason.nullable().optional(),
    moveCount: z.number().int().nonnegative().optional(),
    moves: z.array(zGameMove).optional(),
    createdAt: z.number().int().optional(),
    startedAt: z.number().int().nullable().optional(),
    finishedAt: z.number().int().nullable().optional(),
    gameDurationMs: z.number().int().nonnegative().nullable().optional(),
    updatedAt: z.number().int().optional(),
    gameOptions: zLobbyOptions.optional(),
    playerTiles: z.record(z.string(), z.object({
        color: z.string()
    })).optional(),
});
type LegacyGameHistoryDocument = z.infer<typeof zLegacyGameHistoryDocument> & Document;

export const gameHistoryMigration: DatabaseMigration = {
    id: '002-game-history',
    description: 'Create game history indexes and migrate legacy game history documents',
    async up({ database, logger }) {
        const collection = database.collection<GameHistoryDocument>(GAME_HISTORY_COLLECTION_NAME);
        await collection.createIndex({ id: 1 }, { unique: true });
        await collection.createIndex({ finishedAt: -1, id: -1 });
        await collection.createIndex({ startedAt: 1, finishedAt: 1 });
        await collection.createIndex({ sessionId: 1, finishedAt: -1 });
        await collection.createIndex({ 'players.profileId': 1, finishedAt: -1, id: -1 });

        const legacyDocuments = await collection.find({
            $or: [
                { version: { $exists: false } },
                { version: 2 },
                { playerTiles: { $exists: false } }
            ]
        } as Document).toArray();

        if (legacyDocuments.length === 0) {
            return;
        }

        const operations = legacyDocuments.flatMap((document) => {
            const migratedDocument = migrateLegacyDocument(document, logger);
            if (!migratedDocument) {
                return [];
            }

            return [{
                replaceOne: {
                    filter: { _id: document._id },
                    replacement: {
                        _id: document._id,
                        ...migratedDocument
                    } as GameHistoryDocument
                }
            }];
        });

        if (operations.length === 0) {
            return;
        }

        await collection.bulkWrite(operations, { ordered: false });
        logger.info({
            type: 'game-history',
            event: 'game-history-migration-complete',
            storage: 'mongodb',
            migratedGames: operations.length
        }, 'Migrated legacy game history documents');
    }
};

function migrateLegacyDocument(document: unknown, logger: Logger): DatabaseGame | null {
    const alreadyMigratedDocument = zDatabaseGame.safeParse(document);
    if (alreadyMigratedDocument.success) {
        return alreadyMigratedDocument.data;
    }

    const version2Document = zVersion2GameHistoryDocument.safeParse(document);
    if (version2Document.success) {
        return migrateVersion2Document(version2Document.data);
    }

    const legacyDocument = zLegacyGameHistoryDocument.safeParse(document);
    if (!legacyDocument.success) {
        logger.warn({
            type: 'game-history',
            event: 'game-history-migration-skipped',
            storage: 'mongodb',
            issues: legacyDocument.error.issues
        }, 'Skipped migrating an invalid game history document');
        return null;
    }

    const parsedDocument = legacyDocument.data;
    const moves = parsedDocument.moves ?? [];
    const startedAt = parsedDocument.startedAt
        ?? parsedDocument.createdAt
        ?? moves[0]?.timestamp
        ?? parsedDocument.updatedAt
        ?? Date.now();
    const finishedAt = parsedDocument.finishedAt ?? null;
    const players = mapLegacyPlayers(parsedDocument.players ?? [], parsedDocument);
    const playerTiles = parsedDocument.playerTiles
        ? clonePlayerTiles(parsedDocument.playerTiles)
        : buildPlayerTileConfigMap(players.map((player) => player.playerId));
    const moveCount = Math.max(parsedDocument.moveCount ?? 0, moves.length);
    const durationMs = parsedDocument.gameDurationMs
        ?? (finishedAt === null ? null : Math.max(0, finishedAt - startedAt));
    const gameResult = finishedAt === null
        ? null
        : {
            winningPlayerId: parsedDocument.winningPlayerId ?? null,
            durationMs,
            reason: parsedDocument.reason ?? 'terminated'
        } satisfies DatabaseGameResult;

    return zDatabaseGame.parse({
        id: parsedDocument.id,
        version: 3,
        sessionId: parsedDocument.sessionId,
        startedAt,
        finishedAt,
        players,
        playerTiles,
        gameOptions: parsedDocument.gameOptions
            ? cloneGameOptions(parsedDocument.gameOptions)
            : createDefaultGameOptions(),
        moves: moves.map((move) => ({ ...move })),
        moveCount,
        gameResult
    });
}

function migrateVersion2Document(document: Version2GameHistoryDocument): DatabaseGame {
    return zDatabaseGame.parse({
        id: document.id,
        version: 3,
        sessionId: document.sessionId,
        startedAt: document.startedAt,
        finishedAt: document.finishedAt,
        players: document.players.map((player) => ({ ...player })),
        playerTiles: document.playerTiles
            ? clonePlayerTiles(document.playerTiles)
            : buildPlayerTileConfigMap(document.players.map((player) => player.playerId)),
        gameOptions: cloneGameOptions(document.gameOptions),
        moves: document.moves.map((move) => ({ ...move })),
        moveCount: document.moveCount,
        gameResult: document.gameResult
            ? { ...document.gameResult }
            : null
    });
}

function mapLegacyPlayers(playerIds: string[], document: LegacyGameHistoryDocument): DatabaseGamePlayer[] {
    return playerIds.map((playerId, playerIndex) => ({
        playerId,
        displayName: document.playerNames?.[playerId]?.trim() ?? `Player ${playerIndex + 1}`,
        profileId: document.playerProfileIds?.[playerId] ?? playerId,
        elo: null,
        eloChange: null
    }));
}

function cloneGameOptions(gameOptions: LobbyOptions): LobbyOptions {
    return {
        ...gameOptions,
        timeControl: { ...gameOptions.timeControl }
    };
}

function clonePlayerTiles(playerTiles: Record<string, PlayerTileConfig>): Record<string, PlayerTileConfig> {
    return Object.fromEntries(
        Object.entries(playerTiles).map(([playerId, playerTileConfig]) => [playerId, { ...playerTileConfig }])
    );
}

function createDefaultGameOptions(): LobbyOptions {
    return cloneGameOptions(DEFAULT_LOBBY_OPTIONS);
}
