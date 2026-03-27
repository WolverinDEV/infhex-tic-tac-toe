import {
    type AdminActiveGamesTimeline,
    type AdminStatsResponse,
    type AdminStatsWindow,
    type AdminUserStatsWindow,
    zAdminStatsResponse,
} from '@ih3t/shared';
import { inject, injectable } from 'tsyringe';

import { AuthRepository } from '../auth/authRepository';
import { SocketServerGateway } from '../network/createSocketServer';
import { GameHistoryRepository } from '../persistence/gameHistoryRepository';
import { MetricsRepository } from '../persistence/metricsRepository';
import { SessionManager } from '../session/sessionManager';

type AdminStatsInterval = {
    startAt: number;
    endAt: number;
};

@injectable()
export class AdminStatsService {
    private static readonly ACTIVE_GAMES_TIMELINE_BUCKET_SIZE_MS = 5 * 60 * 1000;

    constructor(
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(SocketServerGateway) private readonly socketServerGateway: SocketServerGateway,
        @inject(MetricsRepository) private readonly metricsRepository: MetricsRepository,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
    ) { }

    async getStats(now = new Date(), timezoneOffsetMinutes = now.getTimezoneOffset()): Promise<AdminStatsResponse> {
        const generatedAt = now.getTime();
        const intervals = this.createIntervals(generatedAt, timezoneOffsetMinutes);

        const [
            sinceMidnight,
            last24Hours,
            last7Days,
            totalUsers,
            usersSinceMidnight,
            usersLast7Days,
            usersLastMonth,
            activeGamesTimeline,
        ] = await Promise.all([
            this.getIntervalStats(intervals.sinceMidnight),
            this.getIntervalStats(intervals.last24Hours),
            this.getIntervalStats(intervals.last7Days),
            this.authRepository.countUsers(),
            this.getUserWindowStats(intervals.sinceMidnight),
            this.getUserWindowStats(intervals.last7Days),
            this.getUserWindowStats(intervals.lastMonth),
            this.getActiveGamesTimeline(intervals.last7Days),
        ]);

        return zAdminStatsResponse.parse({
            generatedAt,
            activeGames: this.sessionManager.getActiveSessionCounts(),
            connectedClients: this.socketServerGateway.getConnectedClientCount(),
            users: {
                total: totalUsers,
                intervals: {
                    sinceMidnight: usersSinceMidnight,
                    last7Days: usersLast7Days,
                    lastMonth: usersLastMonth,
                },
            },
            intervals: {
                sinceMidnight,
                last24Hours,
                last7Days,
            },
            activeGamesTimeline,
        } satisfies AdminStatsResponse);
    }

    private async getIntervalStats(interval: AdminStatsInterval): Promise<AdminStatsWindow> {
        const [siteVisits, gameStats] = await Promise.all([
            this.metricsRepository.countByEventBetween(
                `site-visited`,
                new Date(interval.startAt).toISOString(),
                new Date(interval.endAt).toISOString(),
            ),
            this.gameHistoryRepository.getAdminWindowStats(interval.startAt, interval.endAt),
        ]);

        return {
            startAt: interval.startAt,
            endAt: interval.endAt,
            siteVisits,
            gamesPlayed: gameStats.gamesPlayed,
            timePlayedMs: gameStats.timePlayedMs,
            longestGameInMoves: gameStats.longestGameInMoves,
            longestGameInDuration: gameStats.longestGameInDuration,
        };
    }

    private async getUserWindowStats(interval: AdminStatsInterval): Promise<AdminUserStatsWindow> {
        const userStats = await this.authRepository.getAdminUserWindowStats(interval.startAt, interval.endAt);

        return {
            startAt: interval.startAt,
            endAt: interval.endAt,
            newUsers: userStats.newUsers,
            activeUsers: userStats.activeUsers,
        };
    }

    private async getActiveGamesTimeline(interval: AdminStatsInterval): Promise<AdminActiveGamesTimeline> {
        const bucketSizeMs = AdminStatsService.ACTIVE_GAMES_TIMELINE_BUCKET_SIZE_MS;
        const points = await this.gameHistoryRepository.getActiveGamesTimeline(
            interval.startAt,
            interval.endAt,
            bucketSizeMs,
        );

        return {
            startAt: interval.startAt,
            endAt: interval.endAt,
            bucketSizeMs,
            points,
        };
    }

    private createIntervals(nowMs: number, timezoneOffsetMinutes: number) {
        return {
            sinceMidnight: {
                startAt: this.getMidnightTimestamp(nowMs, timezoneOffsetMinutes),
                endAt: nowMs,
            },
            last24Hours: {
                startAt: nowMs - 24 * 60 * 60 * 1000,
                endAt: nowMs,
            },
            last7Days: {
                startAt: nowMs - 7 * 24 * 60 * 60 * 1000,
                endAt: nowMs,
            },
            lastMonth: {
                startAt: nowMs - 30 * 24 * 60 * 60 * 1000,
                endAt: nowMs,
            },
        };
    }

    private getMidnightTimestamp(nowMs: number, timezoneOffsetMinutes: number): number {
        const shiftedNow = new Date(nowMs - timezoneOffsetMinutes * 60 * 1000);
        shiftedNow.setUTCHours(0, 0, 0, 0);
        return shiftedNow.getTime() + timezoneOffsetMinutes * 60 * 1000;
    }
}
