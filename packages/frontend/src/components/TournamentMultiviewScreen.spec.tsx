import type { SessionParticipant } from '@ih3t/shared';
import { createStartedGameState, zCellOccupant } from '@ih3t/shared';
import { expect, test } from '@playwright/experimental-ct-react';

import TournamentMultiviewScreen, {
    type TournamentMultiviewAvailableMatch,
    type TournamentMultiviewTileViewModel,
} from './TournamentMultiviewScreen';

test.describe(`Tournament multiview`, () => {
    test.use({
        viewport: {
            width: 1440,
            height: 1400,
        },
    });

    function createPlayers(prefix: string): SessionParticipant[] {
        return [
            {
                id: `${prefix}-left`,
                displayName: `Alpha ${prefix}`,
                profileId: `${prefix}-left`,
                rating: { eloScore: 1500, gameCount: 42 },
                ratingAdjustment: null,
                connection: { status: `connected` },
            },
            {
                id: `${prefix}-right`,
                displayName: `Bravo ${prefix}`,
                profileId: `${prefix}-right`,
                rating: { eloScore: 1490, gameCount: 39 },
                ratingAdjustment: null,
                connection: { status: `connected` },
            },
        ];
    }

    function createTile(sessionId: string, status: TournamentMultiviewTileViewModel[`status`], index: number): TournamentMultiviewTileViewModel {
        const players = createPlayers(sessionId);
        const gameState = status === `unavailable` || status === `error` || status === `loading`
            ? null
            : createStartedGameState(players.map((player) => player.id));

        if (gameState) {
            gameState.cells = [
                { x: 0, y: 0, occupiedBy: zCellOccupant.parse(players[0].id) },
                { x: 1, y: 0, occupiedBy: zCellOccupant.parse(players[1].id) },
                { x: 0, y: 1, occupiedBy: zCellOccupant.parse(players[0].id) },
            ];
        }

        if (status === `finished` && gameState) {
            gameState.winner = {
                playerId: players[0].id,
                cells: [
                    { x: 0, y: 0 },
                    { x: 0, y: 1 },
                    { x: 0, y: 2 },
                    { x: 0, y: 3 },
                    { x: 0, y: 4 },
                    { x: 0, y: 5 },
                ],
            };
        }

        const statusLine = status === `live`
            ? `Game ${index + 1} · Turn: ${players[0].displayName}`
            : status === `finished`
                ? `Game ended. ${players[0].displayName} won this board.`
                : status === `loading`
                    ? `Connecting to the live board...`
                    : `session unavailable`;

        return {
            sessionId,
            matchLabel: `M${index + 1}`,
            leftDisplayName: players[0].displayName,
            rightDisplayName: players[1].displayName,
            gameOptions: {
                visibility: `private`,
                timeControl: {
                    mode: `turn`,
                    turnTimeMs: 20_000,
                },
                rated: false,
            },
            bestOf: 3,
            leftWins: index,
            rightWins: Math.max(0, index - 1),
            currentGameNumber: index + 1,
            status,
            statusLabel: status === `live`
                ? `Live`
                : status === `finished`
                    ? `Ended`
                    : status === `loading`
                        ? `Connecting`
                        : status === `unavailable`
                            ? `Unavailable`
                            : `Error`,
            statusLine,
            errorMessage: status === `unavailable` ? `session unavailable` : null,
            players,
            gameState,
            reviewPath: status === `finished` ? `/games/review-${sessionId}` : null,
            finishedTitle: status === `finished` ? `${players[0].displayName} Won` : null,
            finishedMessage: status === `finished` ? `${players[0].displayName} connected six hexagons in a row.` : null,
            canMoveLeft: index > 0,
            canMoveRight: index < 3,
        };
    }

    function createAvailableMatches(): TournamentMultiviewAvailableMatch[] {
        return [
            {
                sessionId: `session-live-1`,
                matchLabel: `M1`,
                description: `Alpha session-live-1 vs Bravo session-live-1`,
                isSelected: true,
                isDisabled: true,
            },
            {
                sessionId: `session-live-2`,
                matchLabel: `M2`,
                description: `Alpha session-live-2 vs Bravo session-live-2`,
                isSelected: false,
                isDisabled: false,
            },
            {
                sessionId: `session-live-3`,
                matchLabel: `M3`,
                description: `Alpha session-live-3 vs Bravo session-live-3`,
                isSelected: false,
                isDisabled: false,
            },
        ];
    }

    test(`renders desktop tiles and forwards add, remove, and reorder actions`, async ({ mount }) => {
        const calls = {
            added: [] as string[],
            removed: [] as string[],
            moved: [] as Array<{ sessionId: string; direction: -1 | 1 }>,
            refreshed: 0,
        };

        const component = await mount(
            <TournamentMultiviewScreen
                tournamentId="tournament-1"
                tournamentName="Spring Major"
                liveMatchCount={3}
                availableMatches={createAvailableMatches()}
                tiles={[
                    createTile(`session-live-1`, `live`, 0),
                    createTile(`session-live-2`, `finished`, 1),
                    createTile(`session-live-3`, `loading`, 2),
                    createTile(`session-live-4`, `unavailable`, 3),
                ]}
                onRefresh={() => { calls.refreshed += 1; }}
                onAddMatch={(sessionId) => { calls.added.push(sessionId); }}
                onRemoveMatch={(sessionId) => { calls.removed.push(sessionId); }}
                onMoveMatch={(sessionId, direction) => { calls.moved.push({ sessionId, direction }); }}
            />,
        );

        await expect(component.getByRole(`heading`, { name: `Spring Major` })).toBeVisible();
        await expect(component.getByText(`Live`, { exact: true }).first()).toBeVisible();
        await expect(component.getByText(`Ended`, { exact: true })).toBeVisible();
        await expect(component.getByText(`Connecting`, { exact: true })).toBeVisible();
        await expect(component.getByText(`Unavailable`, { exact: true })).toBeVisible();
        await expect(component.getByText(`Game Ended`, { exact: true })).toBeVisible();
        await expect(component.getByText(`Turn 20s`, { exact: true }).first()).toBeVisible();
        await expect(component.getByText(`1 placement left`, { exact: true }).first()).toBeVisible();
        await expect(component.getByRole(`link`, { name: `Review Game` })).toHaveAttribute(`href`, `/games/review-session-live-2`);
        await component.getByRole(`button`, { name: `Show Selector` }).click();
        await component.getByRole(`button`, { name: `Add M2` }).click();
        await component.getByRole(`button`, { name: `Move Right` }).first().click();
        await component.getByRole(`button`, { name: `Remove` }).first().click();
        await component.getByRole(`button`, { name: `Refresh` }).click();

        await expect.poll(() => calls).toEqual({
            added: [`session-live-2`],
            removed: [`session-live-1`],
            moved: [{ sessionId: `session-live-1`, direction: 1 }],
            refreshed: 1,
        });

        await expect(component.getByRole(`link`, { name: `Open Full View` }).first()).toHaveAttribute(`href`, `/session/session-live-1`);
        await expect(component.getByText(`session unavailable`).first()).toBeVisible();
    });
});

test.describe(`Tournament multiview mobile fallback`, () => {
    test.use({
        viewport: {
            width: 900,
            height: 1200,
        },
    });

    test(`shows the unsupported fallback below 1024px`, async ({ mount }) => {
        const component = await mount(
            <TournamentMultiviewScreen
                tournamentId="tournament-1"
                tournamentName="Spring Major"
                liveMatchCount={2}
                availableMatches={[
                    {
                        sessionId: `session-live-1`,
                        matchLabel: `M1`,
                        description: `Alpha vs Bravo`,
                        isSelected: false,
                        isDisabled: false,
                    },
                    {
                        sessionId: `session-live-2`,
                        matchLabel: `M2`,
                        description: `Charlie vs Delta`,
                        isSelected: false,
                        isDisabled: false,
                    },
                ]}
                tiles={[]}
                onRefresh={() => { }}
                onAddMatch={() => { }}
                onRemoveMatch={() => { }}
                onMoveMatch={() => { }}
            />,
        );

        await expect(component.getByText(`Mobile is unsupported currently`)).toBeVisible();
    });
});
