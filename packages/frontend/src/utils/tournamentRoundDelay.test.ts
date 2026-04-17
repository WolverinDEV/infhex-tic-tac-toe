import assert from 'node:assert/strict';
import test from 'node:test';

import type { TournamentDetail, TournamentMatch } from '@ih3t/shared';

import { getRoundDelayCountdownState } from './tournamentRoundDelay';

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

function createTournament(matches: TournamentMatch[], roundDelayMinutes: number): Pick<TournamentDetail, `status` | `roundDelayMinutes` | `matches`> {
    return {
        status: `live`,
        roundDelayMinutes,
        matches,
    };
}

test(`countdown uses both prerequisites for even losers rounds`, () => {
    const now = 1_000_000;
    const countdown = getRoundDelayCountdownState(createTournament([
        createMatch({
            id: `match-losers-1-1`,
            bracket: `losers`,
            round: 1,
            order: 1,
            state: `completed`,
            resolvedAt: now - 9 * 60_000,
        }),
        createMatch({
            id: `match-winners-2-1`,
            bracket: `winners`,
            round: 2,
            order: 1,
            state: `completed`,
            resolvedAt: now - 2 * 60_000,
        }),
        createMatch({
            id: `match-losers-2-1`,
            bracket: `losers`,
            round: 2,
            order: 1,
            slots: [
                { source: { type: `winner`, matchId: `match-losers-1-1` }, profileId: null, displayName: null, image: null, seed: null, isBye: false },
                { source: { type: `loser`, matchId: `match-winners-2-1` }, profileId: null, displayName: null, image: null, seed: null, isBye: false },
            ],
        }),
    ], 5), now);

    assert.ok(countdown);
    assert.equal(countdown.matchId, `match-losers-2-1`);
    assert.equal(countdown.remainingMs, 3 * 60_000);
});

test(`countdown uses the grand final as the reset dependency`, () => {
    const now = 2_000_000;
    const countdown = getRoundDelayCountdownState(createTournament([
        createMatch({
            id: `match-grand-final-1-1`,
            bracket: `grand-final`,
            round: 1,
            order: 1,
            state: `completed`,
            resolvedAt: now - 60_000,
        }),
        createMatch({
            id: `match-grand-final-reset-1-1`,
            bracket: `grand-final-reset`,
            round: 1,
            order: 1,
        }),
    ], 4), now);

    assert.ok(countdown);
    assert.equal(countdown.matchId, `match-grand-final-reset-1-1`);
    assert.equal(countdown.remainingMs, 3 * 60_000);
});
