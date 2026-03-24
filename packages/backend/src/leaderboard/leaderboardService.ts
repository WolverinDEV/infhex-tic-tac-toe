import { inject, injectable } from 'tsyringe';
import {
    type Leaderboard,
    type LeaderboardPlacement,
    type LeaderboardPlayer,
} from '@ih3t/shared';
import { AuthRepository, type AccountUserProfile } from '../auth/authRepository';
import { EloRepository, type EloLeaderboardPlacement, type EloLeaderboardPlayer } from '../elo/eloRepository';
import { GameHistoryRepository, type PlayerLeaderboardStats } from '../persistence/gameHistoryRepository';

const LEADERBOARD_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const LEADERBOARD_PLAYER_LIMIT = 10;

interface LeaderboardPlacementCache {
    generatedAt: number;
    nextRefreshAt: number;
    refreshIntervalMs: number;
    topPlayers: EloLeaderboardPlayer[];
    topPlayerProfiles: Map<string, AccountUserProfile>;
    topPlayerStats: Map<string, PlayerLeaderboardStats>;
}

@injectable()
export class LeaderboardService {
    private leaderboardCache: LeaderboardPlacementCache | null = null;

    constructor(
        @inject(EloRepository) private readonly eloRepository: EloRepository,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(AuthRepository) private readonly authRepository: AuthRepository
    ) { }

    async getLeaderboardSnapshot(targetProfileId: string | null = null, nowMs = Date.now()): Promise<Leaderboard> {
        const placementCache = await this.getPlacementCache(nowMs);
        const players = placementCache.topPlayers.map((player) => this.mapLeaderboardPlayer(
            player,
            placementCache.topPlayerProfiles,
            placementCache.topPlayerStats.get(player.profileId) ?? null
        ));

        return {
            generatedAt: placementCache.generatedAt,
            nextRefreshAt: placementCache.nextRefreshAt,
            refreshIntervalMs: placementCache.refreshIntervalMs,
            players,

            ownPlacement: await this.getTargetLeaderboardPlayer(targetProfileId)
        };
    }

    private async getPlacementCache(nowMs: number): Promise<LeaderboardPlacementCache> {
        const currentWindowStart = Math.floor(nowMs / LEADERBOARD_REFRESH_INTERVAL_MS) * LEADERBOARD_REFRESH_INTERVAL_MS;
        const nextRefreshAt = currentWindowStart + LEADERBOARD_REFRESH_INTERVAL_MS;

        if (this.leaderboardCache && this.leaderboardCache.generatedAt >= currentWindowStart) {
            return {
                ...this.leaderboardCache,
                nextRefreshAt
            };
        }

        const topPlayers = await this.eloRepository.getTopLeaderboardPlayers(LEADERBOARD_PLAYER_LIMIT);
        const topProfileIds = topPlayers.map((player) => player.profileId);
        const [topPlayerProfiles, topPlayerStats] = await Promise.all([
            this.authRepository.getUserProfilesByIds(topProfileIds),
            this.gameHistoryRepository.getPlayerLeaderboardStatsForPlayers(topProfileIds, { ratedOnly: true })
        ]);

        this.leaderboardCache = {
            generatedAt: nowMs,
            nextRefreshAt,
            refreshIntervalMs: LEADERBOARD_REFRESH_INTERVAL_MS,
            topPlayers,
            topPlayerProfiles,
            topPlayerStats
        };

        return this.leaderboardCache;
    }

    private async getTargetLeaderboardPlayer(
        profileId: string | null,
    ): Promise<LeaderboardPlacement | null> {
        if (!profileId) {
            return null;
        }

        const [placement, profiles, stats] = await Promise.all([
            this.eloRepository.getLeaderboardPlacement(profileId),
            this.authRepository.getUserProfilesByIds([profileId]),
            this.gameHistoryRepository.getPlayerLeaderboardStatsForPlayers([profileId], { ratedOnly: true })
        ]);
        if (!placement) {
            return null;
        }

        return this.mapLeaderboardPlacement(placement, profiles, stats.get(profileId) ?? null);
    }

    private mapLeaderboardPlayer(
        player: EloLeaderboardPlayer,
        profiles: Map<string, AccountUserProfile>,
        stats: PlayerLeaderboardStats | null
    ): LeaderboardPlayer {
        const profile = profiles.get(player.profileId);
        const leaderboardPlayer = {
            profileId: player.profileId,
            displayName: profile?.username?.trim() || 'Player',
            image: profile?.image ?? null,
            elo: player.eloScore,
            gamesPlayed: stats?.gamesPlayed ?? 0,
            gamesWon: stats?.gamesWon ?? 0
        };

        return leaderboardPlayer as LeaderboardPlayer;
    }

    private mapLeaderboardPlacement(
        player: EloLeaderboardPlacement,
        profiles: Map<string, AccountUserProfile>,
        stats: PlayerLeaderboardStats | null
    ): LeaderboardPlacement {
        return {
            ...this.mapLeaderboardPlayer(player, profiles, stats),
            rank: player.rank
        };
    }
}
