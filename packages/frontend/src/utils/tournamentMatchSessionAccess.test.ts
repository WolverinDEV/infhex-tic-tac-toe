import assert from 'node:assert/strict';
import test from 'node:test';

import type { TournamentMatch } from '@ih3t/shared';

import { getTournamentMatchSessionAccess } from './tournamentMatchSessionAccess';

function createMatch(overrides: Partial<TournamentMatch> & Pick<TournamentMatch, `id` | `bracket` | `round` | `order`>): TournamentMatch {
    return {
        id: overrides.id,
        bracket: overrides.bracket,
        round: overrides.round,
        order: overrides.order,
        state: overrides.state ?? `pending`,
        bestOf: overrides.bestOf ?? 1,
        slots: overrides.slots ?? [
            { source: null, profileId: null, displayName: null, image: null, seed: null, isBye: false },
            { source: null, profileId: null, displayName: null, image: null, seed: null, isBye: false },
        ],
        leftWins: overrides.leftWins ?? 0,
        rightWins: overrides.rightWins ?? 0,
        gameIds: overrides.gameIds ?? [],
        sessionId: overrides.sessionId ?? null,
        winnerProfileId: overrides.winnerProfileId ?? null,
        loserProfileId: overrides.loserProfileId ?? null,
        resultType: overrides.resultType ?? null,
        currentGameNumber: overrides.currentGameNumber ?? 1,
        startedAt: overrides.startedAt ?? null,
        claimWinExpiresAt: overrides.claimWinExpiresAt ?? null,
        resolvedAt: overrides.resolvedAt ?? null,
        advanceWinnerTo: overrides.advanceWinnerTo ?? null,
        advanceLoserTo: overrides.advanceLoserTo ?? null,
        waitingForPlayers: overrides.waitingForPlayers ?? false,
    };
}

test(`live tournament participants can still join their match session`, () => {
    const match = createMatch({
        id: `match-winners-1-1`,
        bracket: `winners`,
        round: 1,
        order: 1,
        state: `ready`,
        sessionId: `session-live`,
        slots: [
            { source: null, profileId: `player-1`, displayName: `Player 1`, image: null, seed: 1, isBye: false },
            { source: null, profileId: `player-2`, displayName: `Player 2`, image: null, seed: 2, isBye: false },
        ],
    });

    assert.deepEqual(getTournamentMatchSessionAccess(`live`, match, `player-1`), {
        isParticipant: true,
        canJoin: true,
        canSpectate: false,
    });
});

test(`cancelled tournaments do not expose join or spectate links`, () => {
    const match = createMatch({
        id: `match-winners-1-1`,
        bracket: `winners`,
        round: 1,
        order: 1,
        state: `in-progress`,
        sessionId: `session-cancelled`,
        startedAt: Date.now() - 60_000,
        slots: [
            { source: null, profileId: `player-1`, displayName: `Player 1`, image: null, seed: 1, isBye: false },
            { source: null, profileId: `player-2`, displayName: `Player 2`, image: null, seed: 2, isBye: false },
        ],
    });

    assert.deepEqual(getTournamentMatchSessionAccess(`cancelled`, match, `spectator-1`), {
        isParticipant: false,
        canJoin: false,
        canSpectate: false,
    });
    assert.deepEqual(getTournamentMatchSessionAccess(`cancelled`, match, `player-1`), {
        isParticipant: true,
        canJoin: false,
        canSpectate: false,
    });
});
