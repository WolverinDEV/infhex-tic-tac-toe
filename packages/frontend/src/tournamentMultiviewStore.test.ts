import assert from 'node:assert/strict';
import test from 'node:test';

import { useTournamentMultiviewStore } from './tournamentMultiviewStore';

function resetStore() {
    useTournamentMultiviewStore.setState({
        activeTournamentId: null,
        selectionsByTournament: {},
        tilesBySessionId: {},
    });
}

test(`multiview keeps a trimmed manual selection across reactivation`, () => {
    resetStore();
    const store = useTournamentMultiviewStore.getState();

    store.activateTournament(`tournament-1`, [
        `session-1`,
        `session-2`,
        `session-3`,
    ]);
    store.removeSession(`tournament-1`, `session-2`);
    store.removeSession(`tournament-1`, `session-3`);
    store.activateTournament(`tournament-1`, [
        `session-1`,
        `session-2`,
        `session-3`,
    ]);

    assert.deepEqual(useTournamentMultiviewStore.getState().selectionsByTournament[`tournament-1`], [`session-1`]);
});

test(`multiview prunes unavailable sessions without auto-filling replacements`, () => {
    resetStore();
    const store = useTournamentMultiviewStore.getState();

    store.activateTournament(`tournament-1`, [
        `session-1`,
        `session-2`,
    ]);
    store.activateTournament(`tournament-1`, [`session-1`]);

    assert.deepEqual(useTournamentMultiviewStore.getState().selectionsByTournament[`tournament-1`], [`session-1`]);
});
