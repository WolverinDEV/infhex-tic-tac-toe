import assert from 'node:assert/strict';
import test from 'node:test';

import { zDatabaseGame, zFinishedGameRecord } from '@ih3t/shared';

void test(`parses legacy tournament replay records without live timeout fields`, () => {
    const legacyTournamentGame = {
        id: `game-1`,
        version: 3,
        sessionId: `session-1`,
        startedAt: 1_700_000_000_000,
        finishedAt: 1_700_000_120_000,
        players: [
            {
                playerId: `player-left`,
                displayName: `Left`,
                profileId: `profile-left`,
                elo: null,
                eloChange: null,
            },
            {
                playerId: `player-right`,
                displayName: `Right`,
                profileId: `profile-right`,
                elo: null,
                eloChange: null,
            },
        ],
        playerTiles: {
            'player-left': { color: `#fbbf24` },
            'player-right': { color: `#38bdf8` },
        },
        gameOptions: {
            visibility: `public`,
            rated: false,
            firstPlayer: `random`,
            timeControl: {
                mode: `unlimited`,
            },
        },
        moves: [],
        moveCount: 0,
        gameResult: {
            winningPlayerId: `player-left`,
            durationMs: 120_000,
            reason: `six-in-a-row`,
        },
        tournament: {
            tournamentId: `tournament-1`,
            tournamentName: `Spring Major`,
            matchId: `match-1`,
            bracket: `winners`,
            round: 1,
            order: 1,
            bestOf: 1,
            currentGameNumber: 1,
            leftWins: 1,
            rightWins: 0,
            matchJoinTimeoutMs: 300_000,
            matchExtensionMs: 300_000,
            leftDisplayName: `Left`,
            rightDisplayName: `Right`,
            resultType: `played`,
        },
    };

    const parsedDatabaseGame = zDatabaseGame.parse(legacyTournamentGame);
    assert.equal(parsedDatabaseGame.tournament?.pendingExtension, false);
    assert.equal(parsedDatabaseGame.tournament?.matchJoinTimeoutInMs, null);
    assert.equal(parsedDatabaseGame.tournament?.leftProfileId, null);
    assert.equal(parsedDatabaseGame.tournament?.rightProfileId, null);

    const parsedReplay = zFinishedGameRecord.parse(parsedDatabaseGame);
    assert.equal(parsedReplay.tournament?.pendingExtension, false);
    assert.equal(parsedReplay.tournament?.matchJoinTimeoutInMs, null);
    assert.equal(parsedReplay.tournament?.leftProfileId, null);
    assert.equal(parsedReplay.tournament?.rightProfileId, null);
});
