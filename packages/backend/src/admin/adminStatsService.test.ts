import 'reflect-metadata';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AdminTimelineRange } from '@ih3t/shared';

import { AdminStatsService } from './adminStatsService';

test(`timeline selections query the requested interval and bucket size`, async () => {
    const calls: number[][] = [];
    type Dependencies = ConstructorParameters<typeof AdminStatsService>;
    const service = new AdminStatsService(
        {
            countUsers: async () => 0,
            getAdminUserWindowStats: async () => ({ newUsers: 0, activeUsers: 0 }),
        } as unknown as Dependencies[0],
        { getActiveSessionCounts: () => ({ total: 0, public: 0, private: 0 }) } as unknown as Dependencies[1],
        { getConnectedClientCount: () => 0 } as unknown as Dependencies[2],
        { countByEventBetween: async () => 0 } as unknown as Dependencies[3],
        {
            getAdminWindowStats: async () => ({
                gamesPlayed: 0, timePlayedMs: 0, longestGameInMoves: null, longestGameInDuration: null,
            }),
            getActiveGamesTimeline: async (...args: number[]) => {
                calls.push(args);
                return [{ timestamp: args[0], activeGames: 2 }];
            },
        } as unknown as Dependencies[4],
    );
    const now = new Date(`2026-09-06T12:17:43.123Z`);
    const cases: [AdminTimelineRange, number, number, string][] = [
        [`24h`, 1, 5, `2026-09-06T12:15:00Z`],
        [`7d`, 7, 10, `2026-09-06T12:10:00Z`],
        [`14d`, 14, 60, `2026-09-06T12:00:00Z`],
        [`30d`, 30, 60, `2026-09-06T12:00:00Z`],
    ];
    for (const [range, days, minutes, expectedEnd] of cases) {
        const timeline = await service.getActiveGamesTimeline(range, now);
        const endAt = new Date(expectedEnd).getTime();
        const startAt = endAt - days * 86_400_000;
        assert.deepEqual(calls.at(-1), [startAt, endAt, minutes * 60_000]);
        assert.deepEqual(timeline, {
            startAt, endAt, bucketSizeMs: minutes * 60_000,
            points: [{ timestamp: startAt, activeGames: 2 }],
        });

    }
    calls.length = 0;
    await service.getStats(now, 0);
    assert.equal(calls.length, 0, `summary stats must not query the timeline`);
});
