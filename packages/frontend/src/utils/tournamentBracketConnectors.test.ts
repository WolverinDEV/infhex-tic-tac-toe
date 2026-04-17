import assert from 'node:assert/strict';
import test from 'node:test';

import type { TournamentMatch, TournamentMatchSlot } from '@ih3t/shared';

import { getBracketConnectorEdges } from './tournamentBracketConnectors';

function createSlot(overrides: Partial<TournamentMatchSlot> = {}): TournamentMatchSlot {
    return {
        source: overrides.source ?? null,
        profileId: overrides.profileId ?? null,
        displayName: overrides.displayName ?? null,
        image: overrides.image ?? null,
        seed: overrides.seed ?? null,
        isBye: overrides.isBye ?? false,
    };
}

function createMatch(overrides: Partial<TournamentMatch> & Pick<TournamentMatch, `id` | `bracket` | `round` | `order`>): TournamentMatch {
    return {
        id: overrides.id,
        bracket: overrides.bracket,
        round: overrides.round,
        order: overrides.order,
        state: overrides.state ?? `pending`,
        bestOf: overrides.bestOf ?? 1,
        slots: overrides.slots ?? [createSlot(), createSlot()],
        leftWins: overrides.leftWins ?? 0,
        rightWins: overrides.rightWins ?? 0,
        gameIds: overrides.gameIds ?? [],
        sessionId: overrides.sessionId ?? null,
        winnerProfileId: overrides.winnerProfileId ?? null,
        loserProfileId: overrides.loserProfileId ?? null,
        resultType: overrides.resultType ?? null,
        currentGameNumber: overrides.currentGameNumber ?? 1,
        startedAt: overrides.startedAt ?? null,
        resolvedAt: overrides.resolvedAt ?? null,
        advanceWinnerTo: overrides.advanceWinnerTo ?? null,
        advanceLoserTo: overrides.advanceLoserTo ?? null,
        claimWinExpiresAt: overrides.claimWinExpiresAt ?? null,
        waitingForPlayers: overrides.waitingForPlayers ?? false,
    };
}

test(`connectors only draw in-section losers dependencies`, () => {
    const edges = getBracketConnectorEdges([
        {
            round: 1,
            matches: [
                createMatch({ id: `match-losers-1-1`, bracket: `losers`, round: 1, order: 1 }),
                createMatch({ id: `match-losers-1-2`, bracket: `losers`, round: 1, order: 2 }),
            ],
        },
        {
            round: 2,
            matches: [
                createMatch({
                    id: `match-losers-2-1`,
                    bracket: `losers`,
                    round: 2,
                    order: 1,
                    slots: [
                        createSlot({ source: { type: `winner`, matchId: `match-losers-1-1` } }),
                        createSlot({ source: { type: `loser`, matchId: `match-winners-2-1` } }),
                    ],
                }),
                createMatch({
                    id: `match-losers-2-2`,
                    bracket: `losers`,
                    round: 2,
                    order: 2,
                    slots: [
                        createSlot({ source: { type: `winner`, matchId: `match-losers-1-2` } }),
                        createSlot({ source: { type: `loser`, matchId: `match-winners-2-2` } }),
                    ],
                }),
            ],
        },
    ]);

    assert.deepEqual(edges, [
        { sourceRoundIndex: 0, sourceMatchIndex: 0, targetRoundIndex: 1, targetMatchIndex: 0 },
        { sourceRoundIndex: 0, sourceMatchIndex: 1, targetRoundIndex: 1, targetMatchIndex: 1 },
    ]);
});

test(`connectors link grand-final resets back to the grand final`, () => {
    const edges = getBracketConnectorEdges([
        {
            round: 1,
            matches: [
                createMatch({
                    id: `match-grand-final-1-1`,
                    bracket: `grand-final`,
                    round: 1,
                    order: 1,
                }),
            ],
        },
        {
            round: 2,
            matches: [
                createMatch({
                    id: `match-grand-final-reset-1-1`,
                    bracket: `grand-final-reset`,
                    round: 1,
                    order: 1,
                }),
            ],
        },
    ]);

    assert.deepEqual(edges, [
        { sourceRoundIndex: 0, sourceMatchIndex: 0, targetRoundIndex: 1, targetMatchIndex: 0 },
    ]);
});
