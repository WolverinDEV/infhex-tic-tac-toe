import express from 'express';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
    type AccountPreferencesResponse,
    type AccountResponse,
    type PublicAccountResponse,
    type AccountStatisticsResponse,
    type AdminServerSettingsResponse,
    type AdminStatsResponse,
    type AdminBroadcastMessageResponse,
    type AdminShutdownControlResponse,
    type AdminTerminateSessionResponse,
    type ServerSettings,
    type Leaderboard,
    DEFAULT_LOBBY_OPTIONS,
    type CreateSandboxPositionResponse,
    type CreateSessionResponse,
    type LobbyOptions,
    type SandboxPositionResponse,
    zCreateSandboxPositionRequest,
    zAdminBroadcastMessageRequest,
    zAdminUpdateServerSettingsRequest,
    zAdminScheduleShutdownRequest,
    zLobbyVisibility,
    zSandboxPositionId,
    zUpdateAccountPreferencesRequest,
    zUpdateAccountProfileRequest,
} from '@ih3t/shared';
import { ServerSettingsService } from '../../admin/serverSettingsService';
import { ServerShutdownService } from '../../admin/serverShutdownService';
import { AdminStatsService } from '../../admin/adminStatsService';
import { AuthRepository, type AccountUserProfile } from '../../auth/authRepository';
import { AuthService } from '../../auth/authService';
import { EloRepository } from '../../elo/eloRepository';
import { LeaderboardService } from '../../leaderboard/leaderboardService';
import { getRequestClientInfo } from '../clientInfo';
import { SocketServerGateway } from '../createSocketServer';
import { GameHistoryRepository } from '../../persistence/gameHistoryRepository';
import { SandboxPositionService } from '../../sandbox/sandboxPositionService';
import { SessionError, SessionManager } from '../../session/sessionManager';

const zPositiveInteger = z.coerce.number().int().positive();
const zPositiveIntegerQueryValue = z.preprocess((value) => Array.isArray(value) ? value[0] : value, zPositiveInteger);
const zFinishedGamesView = z.enum(['all', 'mine']);
const zFinishedGamesQuery = z.object({
    page: zPositiveIntegerQueryValue.optional(),
    pageSize: zPositiveIntegerQueryValue.optional(),
    baseTimestamp: zPositiveIntegerQueryValue.optional(),
    view: z.preprocess((value) => Array.isArray(value) ? value[0] : value, zFinishedGamesView).optional()
});
const zAdminStatsQuery = z.object({
    tzOffsetMinutes: z.preprocess(
        (value) => Array.isArray(value) ? value[0] : value,
        z.coerce.number().int().min(-840).max(840)
    ).optional()
});
const zGameTimeControlInput = z.union([
    z.object({
        mode: z.literal('turn'),
        turnTimeMs: z.coerce.number().int().min(5_000).max(120_000)
    }),
    z.object({
        mode: z.literal('match'),
        mainTimeMs: z.coerce.number().int().min(60_000).max(3_600_000),
        incrementMs: z.coerce.number().int().min(0).max(300_000)
    }),
    z.object({
        mode: z.literal('unlimited')
    })
]);
const zCreateSessionRequestInput = z.object({
    lobbyOptions: z.object({
        visibility: zLobbyVisibility.optional(),
        timeControl: zGameTimeControlInput.optional(),
        rated: z.coerce.boolean().optional()
    }).optional()
});

@injectable()
export class ApiRouter {
    readonly router: express.Router;

    constructor(
        @inject(AuthService) private readonly authService: AuthService,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(EloRepository) private readonly eloRepository: EloRepository,
        @inject(ServerSettingsService) private readonly serverSettingsService: ServerSettingsService,
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(AdminStatsService) private readonly adminStatsService: AdminStatsService,
        @inject(LeaderboardService) private readonly leaderboardService: LeaderboardService,
        @inject(SocketServerGateway) private readonly socketServerGateway: SocketServerGateway,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(SandboxPositionService) private readonly sandboxPositionService: SandboxPositionService
    ) {
        const router = express.Router();

        router.get('/account', async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            const response: AccountResponse = { user };
            res.json(response);
        });

        router.get('/account/statistics', async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            if (!user) {
                res.status(401).json({ error: 'Sign in with Discord to view your statistics.' });
                return;
            }

            const response: AccountStatisticsResponse = {
                statistics: await this.buildAccountStatistics(user.id)
            };
            res.json(response);
        });

        router.get('/profiles/:profileId', async (req, res) => {
            const user = await this.authRepository.getUserProfileById(req.params.profileId);
            if (!user) {
                res.status(404).json({ error: 'Profile not found.' });
                return;
            }

            const response: PublicAccountResponse = {
                user: this.toPublicAccountProfile(user)
            };
            res.json(response);
        });

        router.get('/profiles/:profileId/statistics', async (req, res) => {
            const user = await this.authRepository.getUserProfileById(req.params.profileId);
            if (!user) {
                res.status(404).json({ error: 'Profile not found.' });
                return;
            }

            const response: AccountStatisticsResponse = {
                statistics: await this.buildAccountStatistics(user.id)
            };
            res.json(response);
        });

        router.get('/account/preferences', async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            if (!user) {
                res.status(401).json({ error: 'Sign in with Discord to view your account preferences.' });
                return;
            }

            const preferences = await this.authRepository.getAccountPreferences(user.id);
            if (!preferences) {
                res.status(404).json({ error: 'Account not found.' });
                return;
            }

            const response: AccountPreferencesResponse = { preferences };
            res.json(response);
        });

        router.patch('/account', express.json(), async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            if (!user) {
                res.status(401).json({ error: 'Sign in with Discord to update your account.' });
                return;
            }

            try {
                const username = this.parseAccountProfileUpdate(req.body);
                const updatedUser = await this.authRepository.updateUsername(user.id, username);
                if (!updatedUser) {
                    res.status(404).json({ error: 'Account not found.' });
                    return;
                }

                const response: AccountResponse = {
                    user: updatedUser
                };
                res.json(response);
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(400).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.patch('/account/preferences', express.json(), async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            if (!user) {
                res.status(401).json({ error: 'Sign in with Discord to update your account preferences.' });
                return;
            }

            const preferences = this.parseAccountPreferencesUpdate(req.body);
            const updatedPreferences = await this.authRepository.updateAccountPreferences(user.id, preferences);
            if (!updatedPreferences) {
                res.status(404).json({ error: 'Account not found.' });
                return;
            }

            const response: AccountPreferencesResponse = {
                preferences: updatedPreferences
            };
            res.json(response);
        });

        router.get('/sessions', (_req, res) => {
            res.json(this.sessionManager.listLobbyInfo());
        });

        router.get('/finished-games', async (req, res) => {
            const query = zFinishedGamesQuery.parse(req.query);
            const view = query.view ?? 'all';
            const currentUser = view === 'mine'
                ? await this.authService.getCurrentUser(req)
                : null;

            if (view === 'mine' && !currentUser) {
                res.status(401).json({ error: 'Sign in to view your own match history.' });
                return;
            }

            const archivePage = await this.gameHistoryRepository.listFinishedGames({
                page: query.page ?? 1,
                pageSize: query.pageSize ?? 20,
                baseTimestamp: query.baseTimestamp ?? Date.now(),
                playerProfileId: currentUser?.id
            });
            res.json(archivePage);
        });

        router.get('/finished-games/:id', async (req, res) => {
            const game = await this.gameHistoryRepository.getFinishedGame(req.params.id);
            if (!game) {
                res.status(404).json({ error: 'Finished game not found' });
                return;
            }

            res.json(game);
        });

        router.get('/leaderboard', async (req, res) => {
            const currentUser = await this.authService.getCurrentUser(req);
            const response: Leaderboard = await this.leaderboardService.getLeaderboardSnapshot(currentUser?.id ?? null);
            res.json(response);
        });

        router.post('/sandbox-positions', express.json(), async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            if (!user) {
                res.status(401).json({ error: 'Sign in with Discord to share sandbox positions.' });
                return;
            }

            const request = zCreateSandboxPositionRequest.parse(req.body ?? {});
            const id = await this.sandboxPositionService.createPosition(request.gamePosition, request.name, user.id);
            const response: CreateSandboxPositionResponse = {
                id,
                name: request.name
            };
            res.json(response);
        });

        router.get('/sandbox-positions/:id', async (req, res) => {
            const id = zSandboxPositionId.parse(String(req.params.id ?? '').trim().toLowerCase());
            const sandboxPosition = await this.sandboxPositionService.loadPosition(id);
            if (!sandboxPosition) {
                res.status(404).json({ error: 'Sandbox position not found.' });
                return;
            }

            const response: SandboxPositionResponse = {
                id,
                name: sandboxPosition.name,
                gamePosition: sandboxPosition.gamePosition
            };
            res.json(response);
        });

        router.get('/admin/stats', async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const query = zAdminStatsQuery.parse(req.query);
            const response: AdminStatsResponse = await this.adminStatsService.getStats(new Date(), query.tzOffsetMinutes);
            res.json(response);
        });

        router.get('/admin/server-settings', async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            res.json(this.buildAdminServerSettingsResponse());
        });

        router.put('/admin/server-settings', express.json(), async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const settings = this.parseAdminServerSettingsUpdate(req.body);
            await this.serverSettingsService.updateSettings(settings, user);
            res.json(this.buildAdminServerSettingsResponse());
        });

        router.post('/admin/shutdown', express.json(), async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const request = zAdminScheduleShutdownRequest.parse(req.body ?? {});
            const shutdown = this.serverShutdownService.requestShutdown(request.delayMinutes * 60 * 1000);
            const response: AdminShutdownControlResponse = { shutdown };
            res.json(response);
        });

        router.delete('/admin/shutdown', async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            this.serverShutdownService.cancelShutdown();
            const response: AdminShutdownControlResponse = {
                shutdown: this.serverShutdownService.getShutdownState()
            };
            res.json(response);
        });

        router.post('/admin/broadcast', express.json(), async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const request = zAdminBroadcastMessageRequest.parse(req.body ?? {});
            const broadcast = this.socketServerGateway.broadcastAdminMessage(request.message);
            const response: AdminBroadcastMessageResponse = { broadcast };
            res.json(response);
        });

        router.post('/sessions/:sessionId/terminate', async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            try {
                const sessionId = String(req.params.sessionId ?? '').trim();
                if (!sessionId) {
                    res.status(400).json({ error: 'Session id is required.' });
                    return;
                }

                const session = await this.sessionManager.terminateActiveSession(sessionId);
                const response: AdminTerminateSessionResponse = { session };
                res.json(response);
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post('/sessions', express.json(), async (req, res) => {
            try {
                const lobbyOptions = this.parseLobbyOptions(req.body);
                const currentUser = lobbyOptions.rated
                    ? await this.authService.getCurrentUser(req)
                    : null;

                if (lobbyOptions.rated && !currentUser) {
                    res.status(401).json({ error: 'Sign in with Discord to create rated lobbies.' });
                    return;
                }

                const response: CreateSessionResponse = this.sessionManager.createSession({
                    client: getRequestClientInfo(req),
                    lobbyOptions
                });

                res.json(response);
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        this.router = router;
    }

    private parseLobbyOptions(body: unknown): LobbyOptions {
        const request = zCreateSessionRequestInput.parse(body ?? {});

        const visibility = request.lobbyOptions?.visibility;
        const timeControl = request.lobbyOptions?.timeControl ?? { ...DEFAULT_LOBBY_OPTIONS.timeControl };
        const rated = request.lobbyOptions?.rated ?? DEFAULT_LOBBY_OPTIONS.rated;

        return {
            visibility: visibility ?? DEFAULT_LOBBY_OPTIONS.visibility,
            timeControl,
            rated
        };
    }

    private parseAccountProfileUpdate(body: unknown): string {
        return zUpdateAccountProfileRequest.parse(body ?? {}).username;
    }

    private parseAccountPreferencesUpdate(body: unknown): AccountPreferencesResponse['preferences'] {
        return zUpdateAccountPreferencesRequest.parse(body ?? {}).preferences;
    }

    private parseAdminServerSettingsUpdate(body: unknown): ServerSettings {
        return zAdminUpdateServerSettingsRequest.parse(body ?? {}).settings;
    }

    private async buildAccountStatistics(profileId: string): Promise<AccountStatisticsResponse['statistics']> {
        const [gameStats, playerRating, leaderboardPlacement] = await Promise.all([
            this.gameHistoryRepository.getPlayerProfileStatistics(profileId),
            this.eloRepository.getPlayerRating(profileId),
            this.eloRepository.getLeaderboardPlacement(profileId)
        ]);

        return {
            totalGames: {
                played: gameStats.totalGamesPlayed,
                won: gameStats.totalGamesWon
            },
            rankedGames: {
                played: gameStats.rankedGamesPlayed,
                won: gameStats.rankedGamesWon,
                currentWinStreak: gameStats.currentRankedWinStreak,
                longestWinStreak: gameStats.longestRankedWinStreak
            },
            longestGamePlayedMs: gameStats.longestGamePlayedMs,
            longestGameByMoves: gameStats.longestGameByMoves,
            totalMovesMade: gameStats.totalMovesMade,
            elo: leaderboardPlacement?.elo ?? playerRating?.elo ?? 1000,
            worldRank: leaderboardPlacement?.rank ?? null
        };
    }

    private toPublicAccountProfile(user: AccountUserProfile): PublicAccountResponse['user'] {
        const { email: _email, ...publicProfile } = user;
        return publicProfile;
    }

    private buildAdminServerSettingsResponse(): AdminServerSettingsResponse {
        return {
            settings: this.serverSettingsService.getSettings(),
            currentConcurrentGames: this.sessionManager.getActiveSessionCounts().total
        };
    }

    private async requireAdminUser(req: express.Request, res: express.Response): Promise<AccountUserProfile | null> {
        const user = await this.authService.getCurrentUser(req);
        if (!user) {
            res.status(401).json({ error: 'Sign in as an admin to view this page.' });
            return null;
        }

        if (user.role !== 'admin') {
            res.status(403).json({ error: 'Admin access is required.' });
            return null;
        }

        return user;
    }
}
