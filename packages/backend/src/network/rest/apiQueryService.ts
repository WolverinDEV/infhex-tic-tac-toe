import type {
    AccountBotsResponse,
    AccountPreferencesResponse,
    AccountResponse,
    FinishedGameRecord,
    FinishedGamesArchiveView,
    FinishedGamesPage,
    Leaderboard,
    LobbyInfo,
    ProfileGamesResponse,
    ProfileResponse,
    ProfileStatisticsResponse,
    SandboxPositionResponse,
    SessionInfo,
} from '@ih3t/shared';
import type express from 'express';
import { inject, injectable } from 'tsyringe';

import { type AccountUserProfile, AuthRepository } from '../../auth/authRepository';
import { AccountBotService } from '../../bots/accountBotService';
import { AuthService } from '../../auth/authService';
import { EloRepository } from '../../elo/eloRepository';
import { LeaderboardService } from '../../leaderboard/leaderboardService';
import { GameHistoryRepository } from '../../persistence/gameHistoryRepository';
import { SandboxPositionService } from '../../sandbox/sandboxPositionService';
import { SessionManager } from '../../session/sessionManager';

export class ApiRequestError extends Error {
    constructor(
        readonly statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = `ApiRequestError`;
    }
}

type FinishedGamesQueryOptions = {
    view: FinishedGamesArchiveView;
    page: number;
    pageSize: number;
    baseTimestamp: number;
};

@injectable()
export class ApiQueryService {
    constructor(
        @inject(AuthService) private readonly authService: AuthService,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(AccountBotService) private readonly accountBotService: AccountBotService,
        @inject(EloRepository) private readonly eloRepository: EloRepository,
        @inject(LeaderboardService) private readonly leaderboardService: LeaderboardService,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(SandboxPositionService) private readonly sandboxPositionService: SandboxPositionService,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
    ) { }

    async getAccount(req: express.Request): Promise<AccountResponse> {
        return {
            user: await this.authService.getUserFromRequest(req),
        };
    }

    async getAccountPreferences(req: express.Request): Promise<AccountPreferencesResponse> {
        const user = await this.authService.getUserFromRequest(req);
        if (!user) {
            throw new ApiRequestError(401, `Sign in with Discord to view your account preferences.`);
        }

        const preferences = await this.authRepository.getAccountPreferences(user.id);
        if (!preferences) {
            throw new ApiRequestError(404, `Account not found.`);
        }

        return { preferences };
    }

    async getAccountBots(req: express.Request): Promise<AccountBotsResponse> {
        const user = await this.authService.getUserFromRequest(req);
        if (!user) {
            throw new ApiRequestError(401, `Sign in with Discord to manage your bots.`);
        }

        return {
            bots: await this.accountBotService.listBots(user.id),
        };
    }

    async getProfile(profileId: string): Promise<ProfileResponse | null> {
        const user = await this.authRepository.getUserProfileById(profileId);
        if (!user) {
            return null;
        }

        return {
            user: this.toPublicAccountProfile(user),
        };
    }

    async getProfileStatistics(profileId: string): Promise<ProfileStatisticsResponse | null> {
        const user = await this.authRepository.getUserProfileById(profileId);
        if (!user) {
            return null;
        }

        return {
            statistics: await this.buildAccountStatistics(user.id),
        };
    }

    async getProfileGames(profileId: string): Promise<ProfileGamesResponse | null> {
        const user = await this.authRepository.getUserProfileById(profileId);
        if (!user) {
            return null;
        }

        return await this.gameHistoryRepository.listFinishedGames({
            page: 1,
            pageSize: 10,
            playerProfileId: user.id,
        });
    }

    getSession(sessionId: string): SessionInfo | null {
        return this.sessionManager.getSessionInfo(sessionId);
    }

    listSessions(): LobbyInfo[] {
        return this.sessionManager.listLobbyInfo();
    }

    async getFinishedGames(
        req: express.Request,
        options: FinishedGamesQueryOptions,
    ): Promise<FinishedGamesPage> {
        const currentUser = await this.authService.getUserFromRequest(req);
        if (options.view === `mine` && !currentUser) {
            throw new ApiRequestError(401, `Sign in to view your own match history.`);
        }

        if (options.view !== `mine` && options.page * options.pageSize >= 500 && currentUser?.role !== `admin`) {
            throw new ApiRequestError(401, `Public match history is limited to the last 500 games`);
        }

        return await this.gameHistoryRepository.listFinishedGames({
            page: options.page,
            pageSize: options.pageSize,
            baseTimestamp: options.baseTimestamp,
            playerProfileId: options.view === `mine` ? currentUser?.id : undefined,
        });
    }

    async getFinishedGame(gameId: string): Promise<FinishedGameRecord | null> {
        return await this.gameHistoryRepository.getFinishedGame(gameId) ?? null;
    }

    async getLeaderboard(req: express.Request): Promise<Leaderboard> {
        const currentUser = await this.authService.getUserFromRequest(req);
        return await this.leaderboardService.getLeaderboardSnapshot(currentUser?.id ?? null);
    }

    async getSandboxPosition(id: string): Promise<SandboxPositionResponse | null> {
        const sandboxPosition = await this.sandboxPositionService.loadPosition(id);
        if (!sandboxPosition) {
            return null;
        }

        return {
            id,
            name: sandboxPosition.name,
            gamePosition: sandboxPosition.gamePosition,
        };
    }

    private async buildAccountStatistics(profileId: string): Promise<ProfileStatisticsResponse[`statistics`]> {
        const [
            gameStats, eloHistory, playerRating, leaderboardPlacement,
        ] = await Promise.all([
            this.gameHistoryRepository.getPlayerProfileStatistics(profileId),
            this.gameHistoryRepository.getPlayerEloHistory(profileId),
            this.eloRepository.getPlayerRating(profileId),
            this.eloRepository.getLeaderboardPlacement(profileId),
        ]);

        return {
            totalGames: {
                played: gameStats.totalGamesPlayed,
                won: gameStats.totalGamesWon,
            },
            rankedGames: {
                played: gameStats.rankedGamesPlayed,
                won: gameStats.rankedGamesWon,
                currentWinStreak: gameStats.currentRankedWinStreak,
                longestWinStreak: gameStats.longestRankedWinStreak,
            },
            longestGamePlayedMs: gameStats.longestGamePlayedMs,
            longestGameByMoves: gameStats.longestGameByMoves,
            totalMovesMade: gameStats.totalMovesMade,
            eloHistory,
            elo: leaderboardPlacement?.eloScore ?? playerRating?.eloScore ?? 1000,
            worldRank: leaderboardPlacement?.rank ?? null,
        };
    }

    private toPublicAccountProfile(user: AccountUserProfile): ProfileResponse[`user`] {
        const { email: _email, ...publicProfile } = user;
        return publicProfile;
    }
}
