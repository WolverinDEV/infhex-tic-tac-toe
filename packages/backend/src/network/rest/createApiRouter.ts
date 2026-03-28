import {
    type AccountPreferencesResponse,
    type AccountResponse,
    type AdminBroadcastMessageResponse,
    type AdminServerSettingsResponse,
    type AdminShutdownControlResponse,
    type AdminStatsResponse,
    type AdminTerminateSessionResponse,
    type CreateSandboxPositionResponse,
    type CreateSessionResponse,
    DEFAULT_LOBBY_OPTIONS,
    type LobbyOptions,
    zRegisterCredentialsRequest,
    type ServerSettings,
    zAdminBroadcastMessageRequest,
    zAdminScheduleShutdownRequest,
    zAdminUpdateServerSettingsRequest,
    zCreateSandboxPositionRequest,
    zLobbyVisibility,
    zSandboxPositionId,
    zUpdateAccountPreferencesRequest,
    zUpdateAccountProfileRequest,
} from '@ih3t/shared';
import { hash } from 'bcryptjs';
import express from 'express';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { AdminStatsService } from '../../admin/adminStatsService';
import { ServerSettingsService } from '../../admin/serverSettingsService';
import { ServerShutdownService } from '../../admin/serverShutdownService';
import { type AccountUserProfile, AuthRepository, AuthRepositoryError } from '../../auth/authRepository';
import { AuthService } from '../../auth/authService';
import { SandboxPositionService } from '../../sandbox/sandboxPositionService';
import { SessionError, SessionManager } from '../../session/sessionManager';
import { getRequestClientInfo } from '../clientInfo';
import { SocketServerGateway } from '../createSocketServer';
import { ApiQueryService, ApiRequestError } from './apiQueryService';

const zPositiveInteger = z.coerce.number().int()
    .positive();
const zPositiveIntegerQueryValue = z.preprocess((value): unknown => Array.isArray(value) ? value[0] : value, zPositiveInteger);
const zFinishedGamesView = z.enum([`all`, `mine`]);
const zFinishedGamesQuery = z.object({
    page: zPositiveIntegerQueryValue.optional(),
    pageSize: zPositiveIntegerQueryValue.optional(),
    baseTimestamp: zPositiveIntegerQueryValue.optional(),
    view: z.preprocess((value): unknown => Array.isArray(value) ? value[0] : value, zFinishedGamesView).optional(),
});
const zAdminStatsQuery = z.object({
    tzOffsetMinutes: z.preprocess(
        (value): unknown => Array.isArray(value) ? value[0] : value,
        z.coerce.number().int()
            .min(-840)
            .max(840),
    ).optional(),
});
const zGameTimeControlInput = z.union([
    z.object({
        mode: z.literal(`turn`),
        turnTimeMs: z.coerce.number().int()
            .min(5_000)
            .max(120_000),
    }),
    z.object({
        mode: z.literal(`match`),
        mainTimeMs: z.coerce.number().int()
            .min(60_000)
            .max(3_600_000),
        incrementMs: z.coerce.number().int()
            .min(0)
            .max(300_000),
    }),
    z.object({
        mode: z.literal(`unlimited`),
    }),
]);
const zCreateSessionRequestInput = z.object({
    lobbyOptions: z.object({
        visibility: zLobbyVisibility.optional(),
        timeControl: zGameTimeControlInput.optional(),
        rated: z.coerce.boolean().optional(),
    }).optional(),
});

@injectable()
export class ApiRouter {
    readonly router: express.Router;

    constructor(
        @inject(ApiQueryService) private readonly apiQueryService: ApiQueryService,
        @inject(AuthService) private readonly authService: AuthService,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(ServerSettingsService) private readonly serverSettingsService: ServerSettingsService,
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(AdminStatsService) private readonly adminStatsService: AdminStatsService,
        @inject(SocketServerGateway) private readonly socketServerGateway: SocketServerGateway,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(SandboxPositionService) private readonly sandboxPositionService: SandboxPositionService,
    ) {
        const router = express.Router();

        router.post(`/auth/register`, express.json(), async (req, res) => {
            try {
                const registration = zRegisterCredentialsRequest.parse(req.body ?? {});
                const passwordHash = await hash(registration.password, 12);
                const user = await this.authRepository.createCredentialsUser(registration, passwordHash);
                const response: AccountResponse = { user };
                res.status(201).json(response);
            } catch (error: unknown) {
                if (error instanceof AuthRepositoryError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                if (error instanceof z.ZodError) {
                    res.status(400).json({ error: error.issues[0]?.message ?? `Invalid registration request.` });
                    return;
                }

                throw error;
            }
        });

        router.get(`/account`, async (req, res) => {
            res.json(await this.apiQueryService.getAccount(req));
        });

        router.get(`/account/preferences`, async (req, res) => {
            try {
                res.json(await this.apiQueryService.getAccountPreferences(req));
            } catch (error: unknown) {
                if (error instanceof ApiRequestError) {
                    res.status(error.statusCode).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.patch(`/account`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to update your account.` });
                return;
            }

            try {
                const username = this.parseAccountProfileUpdate(req.body);
                const updatedUser = await this.authRepository.updateUsername(user.id, username);
                if (!updatedUser) {
                    res.status(404).json({ error: `Account not found.` });
                    return;
                }

                const response: AccountResponse = {
                    user: updatedUser,
                };
                res.json(response);
            } catch (error: unknown) {
                if (error instanceof AuthRepositoryError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                if (error instanceof SessionError) {
                    res.status(400).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.patch(`/account/preferences`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to update your account preferences.` });
                return;
            }

            const preferences = this.parseAccountPreferencesUpdate(req.body);
            const updatedPreferences = await this.authRepository.updateAccountPreferences(user.id, preferences);
            if (!updatedPreferences) {
                res.status(404).json({ error: `Account not found.` });
                return;
            }

            const response: AccountPreferencesResponse = {
                preferences: updatedPreferences,
            };
            res.json(response);
        });

        router.get(`/profiles/:profileId`, async (req, res) => {
            const response = await this.apiQueryService.getProfile(req.params.profileId);
            if (!response) {
                res.status(404).json({ error: `Profile not found.` });
                return;
            }

            res.json(response);
        });

        router.get(`/profiles/:profileId/statistics`, async (req, res) => {
            const response = await this.apiQueryService.getProfileStatistics(req.params.profileId);
            if (!response) {
                res.status(404).json({ error: `Profile not found.` });
                return;
            }

            res.json(response);
        });

        router.get(`/profiles/:profileId/games`, async (req, res) => {
            const response = await this.apiQueryService.getProfileGames(req.params.profileId);
            if (!response) {
                res.status(404).json({ error: `Profile not found.` });
                return;
            }

            res.json(response);
        });

        router.get(`/session/:sessionId`, (req, res) => {
            const session = this.apiQueryService.getSession(String(req.params.sessionId ?? ``).trim());
            if (!session) {
                res.status(404).json({ error: `Session not found.` });
                return;
            }

            res.json(session);
        });

        router.get(`/sessions`, (_req, res) => {
            res.json(this.apiQueryService.listSessions());
        });

        router.get(`/finished-games`, async (req, res) => {
            const query = zFinishedGamesQuery.parse(req.query);
            try {
                res.json(await this.apiQueryService.getFinishedGames(req, {
                    view: query.view ?? `all`,
                    page: query.page ?? 1,
                    pageSize: query.pageSize ?? 20,
                    baseTimestamp: query.baseTimestamp ?? Date.now(),
                }));
            } catch (error: unknown) {
                if (error instanceof ApiRequestError) {
                    res.status(error.statusCode).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.get(`/finished-games/:id`, async (req, res) => {
            const game = await this.apiQueryService.getFinishedGame(req.params.id);
            if (!game) {
                res.status(404).json({ error: `Finished game not found` });
                return;
            }

            res.json(game);
        });

        router.get(`/leaderboard`, async (req, res) => {
            res.json(await this.apiQueryService.getLeaderboard(req));
        });

        router.post(`/sandbox-positions`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to share sandbox positions.` });
                return;
            }

            const request = zCreateSandboxPositionRequest.parse(req.body ?? {});
            const id = await this.sandboxPositionService.createPosition(request.gamePosition, request.name, user.id);
            const response: CreateSandboxPositionResponse = {
                id,
                name: request.name,
            };
            res.json(response);
        });

        router.get(`/sandbox-positions/:id`, async (req, res) => {
            const id = zSandboxPositionId.parse(String(req.params.id ?? ``).trim()
                .toLowerCase());
            const sandboxPosition = await this.apiQueryService.getSandboxPosition(id);
            if (!sandboxPosition) {
                res.status(404).json({ error: `Sandbox position not found.` });
                return;
            }

            res.json(sandboxPosition);
        });

        router.get(`/admin/stats`, async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const query = zAdminStatsQuery.parse(req.query);
            const response: AdminStatsResponse = await this.adminStatsService.getStats(new Date(), query.tzOffsetMinutes);
            res.json(response);
        });

        router.get(`/admin/server-settings`, async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            res.json(this.buildAdminServerSettingsResponse());
        });

        router.put(`/admin/server-settings`, express.json(), async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const settings = this.parseAdminServerSettingsUpdate(req.body);
            await this.serverSettingsService.updateSettings(settings, user);
            res.json(this.buildAdminServerSettingsResponse());
        });

        router.post(`/admin/shutdown`, express.json(), async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const request = zAdminScheduleShutdownRequest.parse(req.body ?? {});
            const shutdown = this.serverShutdownService.requestShutdown(request.delayMinutes * 60 * 1000);
            const response: AdminShutdownControlResponse = { shutdown };
            res.json(response);
        });

        router.delete(`/admin/shutdown`, async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            this.serverShutdownService.cancelShutdown();
            const response: AdminShutdownControlResponse = {
                shutdown: this.serverShutdownService.getShutdownState(),
            };
            res.json(response);
        });

        router.post(`/admin/broadcast`, express.json(), async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const request = zAdminBroadcastMessageRequest.parse(req.body ?? {});
            const broadcast = this.socketServerGateway.broadcastAdminMessage(request.message);
            const response: AdminBroadcastMessageResponse = { broadcast };
            res.json(response);
        });

        router.get(`/server/shutdown`, express.json(), async (_req, res) => {
            res.json(this.serverShutdownService.getShutdownState());
        });

        router.post(`/sessions/:sessionId/terminate`, async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            try {
                const sessionId = String(req.params.sessionId ?? ``).trim();
                if (!sessionId) {
                    res.status(400).json({ error: `Session id is required.` });
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

        router.post(`/sessions`, express.json(), async (req, res) => {
            try {
                const lobbyOptions = this.parseLobbyOptions(req.body);
                const currentUser = lobbyOptions.rated
                    ? await this.authService.getUserFromRequest(req)
                    : null;

                if (lobbyOptions.rated && !currentUser) {
                    res.status(401).json({ error: `Sign in to create rated lobbies.` });
                    return;
                }

                const response: CreateSessionResponse = this.sessionManager.createSession({
                    client: getRequestClientInfo(req),
                    lobbyOptions,
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
            rated,
        };
    }

    private parseAccountProfileUpdate(body: unknown): string {
        return zUpdateAccountProfileRequest.parse(body ?? {}).username;
    }

    private parseAccountPreferencesUpdate(body: unknown): AccountPreferencesResponse[`preferences`] {
        return zUpdateAccountPreferencesRequest.parse(body ?? {}).preferences;
    }

    private parseAdminServerSettingsUpdate(body: unknown): ServerSettings {
        return zAdminUpdateServerSettingsRequest.parse(body ?? {}).settings;
    }

    private buildAdminServerSettingsResponse(): AdminServerSettingsResponse {
        return {
            settings: this.serverSettingsService.getSettings(),
            currentConcurrentGames: this.sessionManager.getActiveSessionCounts().total,
        };
    }

    private async requireAdminUser(req: express.Request, res: express.Response): Promise<AccountUserProfile | null> {
        const user = await this.authService.getUserFromRequest(req);
        if (!user) {
            res.status(401).json({ error: `Sign in as an admin to view this page.` });
            return null;
        }

        if (user.role !== `admin`) {
            res.status(403).json({ error: `Admin access is required.` });
            return null;
        }

        return user;
    }
}
