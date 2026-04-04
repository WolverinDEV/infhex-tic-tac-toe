import type { CreateTournamentRequest } from '@ih3t/shared';
import { expect, test } from '@playwright/experimental-ct-react';

import TournamentEditorCardComponent from './TournamentEditorCard';

test.use({
    viewport: {
        width: 1280,
        height: 960,
    },
});

const baseRequest: CreateTournamentRequest = {
    name: `Test Tournament`,
    description: ``,
    format: `double-elimination`,
    visibility: `private`,
    scheduledStartAt: Date.now() + 60 * 60 * 1000,
    checkInWindowMinutes: 30,
    maxPlayers: 16,
    timeControl: { mode: `turn`, turnTimeMs: 45_000 },
    seriesSettings: {
        earlyRoundsBestOf: 1,
        finalsBestOf: 3,
        grandFinalBestOf: 5,
        grandFinalResetEnabled: true,
    },
};

test(`submits 256-player elimination tournaments without shrinking the bracket`, async ({ mount }) => {
    let submitted: CreateTournamentRequest | null = null;

    const component = await mount(
        <TournamentEditorCardComponent
            formKey="edit"
            title="Edit Tournament"
            description=""
            defaultRequest={{
                ...baseRequest,
                format: `double-elimination`,
                maxPlayers: 256,
            }}
            submitLabel="Save"
            submitting={false}
            onSubmit={({ request }) => {
                submitted = request;
            }}
        />,
    );

    await component.getByRole(`button`, { name: `Save` }).click();

    await expect.poll(() => submitted?.maxPlayers ?? null).toBe(256);
});

test(`submits 256-player swiss tournaments without clamping to 128`, async ({ mount }) => {
    let submitted: CreateTournamentRequest | null = null;

    const component = await mount(
        <TournamentEditorCardComponent
            formKey="edit"
            title="Edit Tournament"
            description=""
            defaultRequest={{
                ...baseRequest,
                format: `swiss`,
                maxPlayers: 256,
            }}
            submitLabel="Save"
            submitting={false}
            onSubmit={({ request }) => {
                submitted = request;
            }}
        />,
    );

    await component.getByRole(`button`, { name: `Save` }).click();

    await expect.poll(() => submitted?.maxPlayers ?? null).toBe(256);
});
