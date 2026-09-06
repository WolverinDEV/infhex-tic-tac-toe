import assert from 'node:assert/strict';
import test from 'node:test';

import { normalBoardTheme, omokBoardTheme } from '@ih3t/board-renderer';
import { applyGameMove, createStartedGameState } from '@ih3t/shared';

import { getPlayerColor, toRendererBoardState } from './gameBoard';

test(`player colors and markers follow session order even when the second player starts`, () => {
    const state = createStartedGameState([`host`, `guest`], `guest`);
    applyGameMove(state, { playerId: `guest`, x: 0, y: 0 });
    applyGameMove(state, { playerId: `host`, x: 1, y: 0 });
    // Wire map key order must not affect player identity.
    state.playerTiles = { guest: state.playerTiles.guest, host: state.playerTiles.host };
    assert.deepEqual(toRendererBoardState(state).placedCells, [
        { x: 0, y: 0, marker: `O`, colorIndex: 1 },
        { x: 1, y: 0, marker: `X`, colorIndex: 0 },
    ]);
    assert.equal(getPlayerColor(state.playerTiles, `guest`, normalBoardTheme), `#38bdf8`);
    assert.equal(getPlayerColor(state.playerTiles, `guest`, omokBoardTheme), `#f4f4f4`);
    assert.equal(getPlayerColor(state.playerTiles, `host`, omokBoardTheme), `#111111`);
});
