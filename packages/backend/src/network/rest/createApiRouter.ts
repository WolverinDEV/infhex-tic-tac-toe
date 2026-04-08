import {
    type AccountPreferencesResponse,
    type AccountResponse,
    type AdminBroadcastMessageResponse,
    type AdminServerSettingsResponse,
    type AdminShutdownControlResponse,
    type AdminStatsResponse,
    type AdminTerminateSessionResponse,
    type AdminUpdateUserPermissionsResponse,
    type AdminUserSearchResponse,
    type CreateSandboxPositionResponse,
    type CreateSessionResponse,
    DEFAULT_LOBBY_OPTIONS,
    zLobbyFirstPlayer,
    type LobbyOptions,
    type ServerSettings,
    type UserSearchResponse,
    zAdminBroadcastMessageRequest,
    zAdminScheduleShutdownRequest,
    zAdminUpdateServerSettingsRequest,
    zAdminUpdateUserPermissionsRequest,
    zCreateSandboxPositionRequest,
    zCreateTournamentRequest,
    zLobbyVisibility,
    zRequestMatchExtensionRequest,
    zResolveExtensionRequest,
    zSandboxPositionId,
    zTournamentMatchResolutionRequest,
    zTournamentOrganizerGrantRequest,
    zTournamentParticipantMutationRequest,
    zTournamentParticipantSwapRequest,
    zUpdateAccountPreferencesRequest,
    zUpdateAccountProfileRequest,
    zReorderSeedsRequest,
    zUpdateTournamentRequest,
} from '@ih3t/shared';
import express from 'express';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { AdminStatsService } from '../../admin/adminStatsService';
import { ServerSettingsService } from '../../admin/serverSettingsService';
import { ServerShutdownService } from '../../admin/serverShutdownService';
import { type AccountUserProfile, AuthRepository } from '../../auth/authRepository';
import { AuthService } from '../../auth/authService';
import { DevSupportService } from '../../dev/devSupportService';
import { SandboxPositionService } from '../../sandbox/sandboxPositionService';
import { SessionError, SessionManager } from '../../session/sessionManager';
import { TournamentService } from '../../tournament/tournamentService';
import { getCookieValue, getRequestClientInfo } from '../clientInfo';
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
const zAdminUserSearchQuery = z.object({
    q: z.preprocess((value): unknown => Array.isArray(value) ? value[0] : value, z.string().trim()
        .min(1)
        .max(80)),
});
const zDevAuthLoginRequest = z.object({
    userId: z.string().trim()
        .min(1),
});
const zDevTournamentSeedRequest = z.object({
    count: z.coerce.number().int()
        .min(1)
        .max(256)
        .default(8),
    state: z.enum([
        `registered`,
        `checked-in`,
    ]).default(`checked-in`),
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
        firstPlayer: zLobbyFirstPlayer.optional(),
    }).optional(),
});

@injectable()
export class ApiRouter {
    readonly router: express.Router;

    constructor(
        @inject(ApiQueryService) private readonly apiQueryService: ApiQueryService,
        @inject(AuthService) private readonly authService: AuthService,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(DevSupportService) private readonly devSupportService: DevSupportService,
        @inject(ServerSettingsService) private readonly serverSettingsService: ServerSettingsService,
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(AdminStatsService) private readonly adminStatsService: AdminStatsService,
        @inject(SocketServerGateway) private readonly socketServerGateway: SocketServerGateway,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(SandboxPositionService) private readonly sandboxPositionService: SandboxPositionService,
        @inject(TournamentService) private readonly tournamentService: TournamentService,
    ) {
        const router = express.Router();

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
                res.status(401).json({ error: `Sign in with Discord to update your account.` });
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
                res.status(401).json({ error: `Sign in with Discord to update your account preferences.` });
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

        router.get(`/tournaments`, async (req, res) => {
            res.json(await this.apiQueryService.getTournaments(req));
        });

        router.get(`/tournaments/:tournamentId`, async (req, res) => {
            const tournament = await this.apiQueryService.getTournament(req, req.params.tournamentId);
            if (!tournament) {
                res.status(404).json({ error: `Tournament not found.` });
                return;
            }

            res.json(tournament);
        });

        router.get(`/users/search`, async (req, res) => {
            try {
                const query = zAdminUserSearchQuery.parse(req.query);
                const response: UserSearchResponse = await this.apiQueryService.searchUsers(req, query.q);
                res.json(response);
            } catch (error: unknown) {
                if (error instanceof ApiRequestError) {
                    res.status(error.statusCode).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        if (this.devSupportService.isEnabled()) {
            router.get(`/dev-auth/users`, async (_req, res) => {
                res.json({
                    users: await this.devSupportService.listDevUsers(),
                });
            });

            router.post(`/dev-auth/login`, express.json(), async (req, res) => {
                const previousSessionToken = getCookieValue(req.get(`cookie`), this.authService.sessionCookieName);
                if (previousSessionToken) {
                    await this.authRepository.deleteSession(previousSessionToken);
                }

                const request = zDevAuthLoginRequest.parse(req.body ?? {});
                const { user, sessionToken, expires } = await this.devSupportService.loginDevUser(request.userId);
                res.cookie(this.authService.sessionCookieName, sessionToken, {
                    httpOnly: true,
                    sameSite: `lax`,
                    path: `/`,
                    secure: false,
                    expires,
                });
                res.json({ user });
            });

            router.post(`/dev-auth/logout`, async (req, res) => {
                const sessionToken = getCookieValue(req.get(`cookie`), this.authService.sessionCookieName);
                if (sessionToken) {
                    await this.authRepository.deleteSession(sessionToken);
                }

                res.clearCookie(this.authService.sessionCookieName, {
                    path: `/`,
                    sameSite: `lax`,
                    secure: false,
                });
                res.json({ ok: true });
            });

            // Dev: resolve current round
            router.post(`/dev/tournaments/:tournamentId/resolve-round`, async (req, res) => {
                const user = await this.authService.getUserFromRequest(req);
                if (!user) { res.status(401).json({ error: `Sign in.` }); return; }
                try {
                    res.json(await this.devSupportService.resolveCurrentRound(req.params.tournamentId, user));
                } catch (error: unknown) {
                    if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                    throw error;
                }
            });

            // Dev: resolve all remaining matches
            router.post(`/dev/tournaments/:tournamentId/resolve-all`, async (req, res) => {
                const user = await this.authService.getUserFromRequest(req);
                if (!user) { res.status(401).json({ error: `Sign in.` }); return; }
                try {
                    res.json(await this.devSupportService.resolveAll(req.params.tournamentId, user));
                } catch (error: unknown) {
                    if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                    throw error;
                }
            });

            // Dev: resolve N matches from current round
            router.post(`/dev/tournaments/:tournamentId/resolve-n`, express.json(), async (req, res) => {
                const user = await this.authService.getUserFromRequest(req);
                if (!user) { res.status(401).json({ error: `Sign in.` }); return; }
                try {
                    const count = z.coerce.number().int().min(1).max(500).parse((req.body as { count?: unknown })?.count ?? 1);
                    res.json(await this.devSupportService.resolveN(req.params.tournamentId, user, count));
                } catch (error: unknown) {
                    if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                    throw error;
                }
            });

            router.post(`/dev/tournaments/:tournamentId/seed`, express.json(), async (req, res) => {
                const user = await this.authService.getUserFromRequest(req);
                if (!user) {
                    res.status(401).json({ error: `Sign in before using development tournament helpers.` });
                    return;
                }

                try {
                    const request = zDevTournamentSeedRequest.parse(req.body ?? {});
                    const response = await this.devSupportService.seedTournament(req.params.tournamentId, user, request);
                    res.json({
                        addedCount: response.addedCount,
                    });
                } catch (error: unknown) {
                    if (error instanceof SessionError) {
                        res.status(409).json({ error: error.message });
                        return;
                    }

                    throw error;
                }
            });

            router.post(`/dev/tournaments/quick-seal-bot`, async (req, res) => {
                const user = await this.authService.getUserFromRequest(req);
                if (!user) {
                    res.status(401).json({ error: `Sign in before using development tournament helpers.` });
                    return;
                }

                try {
                    const tournament = await this.devSupportService.createQuickSealBotTournament(user);
                    res.json({ tournament });
                } catch (error: unknown) {
                    if (error instanceof SessionError) {
                        res.status(409).json({ error: error.message });
                        return;
                    }

                    throw error;
                }
            });
        }

        router.post(`/tournaments`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to create tournaments.` });
                return;
            }

            try {
                const request = zCreateTournamentRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.createTournament(user, request));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.patch(`/tournaments/:tournamentId`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to edit tournaments.` });
                return;
            }

            try {
                const request = zUpdateTournamentRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.updateTournament(req.params.tournamentId, user, request));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/register`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to register for tournaments.` });
                return;
            }

            try {
                res.json(await this.tournamentService.registerCurrentUser(req.params.tournamentId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.delete(`/tournaments/:tournamentId/register`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to withdraw from tournaments.` });
                return;
            }

            try {
                res.json(await this.tournamentService.withdrawCurrentUser(req.params.tournamentId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/check-in`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to check in.` });
                return;
            }

            try {
                res.json(await this.tournamentService.checkInCurrentUser(req.params.tournamentId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/participants`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to manage tournament participants.` });
                return;
            }

            try {
                const request = zTournamentParticipantMutationRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.addParticipant(req.params.tournamentId, user, request.profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.delete(`/tournaments/:tournamentId/participants/:profileId`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to manage tournament participants.` });
                return;
            }

            try {
                res.json(await this.tournamentService.removeParticipant(req.params.tournamentId, user, req.params.profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/participants/swap`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to manage tournament participants.` });
                return;
            }

            try {
                const request = zTournamentParticipantSwapRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.swapParticipant(req.params.tournamentId, user, request));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/start`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to start tournaments.` });
                return;
            }

            try {
                res.json(await this.tournamentService.startTournament(req.params.tournamentId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.patch(`/tournaments/:tournamentId/seeds`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to manage seeds.` });
                return;
            }

            try {
                const request = zReorderSeedsRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.reorderSeeds(req.params.tournamentId, request.orderedProfileIds, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/matches/:matchId/walkover`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to resolve tournament matches.` });
                return;
            }

            try {
                const request = zTournamentMatchResolutionRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.awardWalkover(req.params.tournamentId, req.params.matchId, request.winnerProfileId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/matches/:matchId/reopen`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to manage tournament matches.` });
                return;
            }

            try {
                res.json(await this.tournamentService.reopenMatch(req.params.tournamentId, req.params.matchId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/matches/:matchId/claim-win`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to claim a match win.` });
                return;
            }

            try {
                const claimState = await this.tournamentService.claimWin(req.params.tournamentId, req.params.matchId, user);
                res.json(claimState);
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/cancel`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to cancel tournaments.` });
                return;
            }

            try {
                res.json(await this.tournamentService.cancelTournament(req.params.tournamentId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/matches/:matchId/extension`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to request a match extension.` });
                return;
            }

            try {
                zRequestMatchExtensionRequest.parse({ matchId: req.params.matchId });
                res.json(await this.tournamentService.requestExtension(req.params.tournamentId, req.params.matchId, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/extensions/:extensionId/resolve`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to resolve extension requests.` });
                return;
            }

            try {
                const request = zResolveExtensionRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.resolveExtension(req.params.tournamentId, req.params.extensionId, request.approve, user));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/unsubscribe`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to unsubscribe.` });
                return;
            }

            try {
                const body = req.body as Record<string, unknown> | undefined;
                const transferTo = typeof body?.transferTo === `string` ? body.transferTo : undefined;
                await this.tournamentService.unsubscribeFromTournament(req.params.tournamentId, user, transferTo);
                res.json({ success: true });
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/organizers`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to manage organizers.` });
                return;
            }

            try {
                const request = zTournamentOrganizerGrantRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.grantTournamentOrganizer(req.params.tournamentId, user, request.profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.delete(`/tournaments/:tournamentId/organizers/:profileId`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in to manage organizers.` });
                return;
            }

            try {
                res.json(await this.tournamentService.revokeTournamentOrganizer(req.params.tournamentId, user, req.params.profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) {
                    res.status(409).json({ error: error.message });
                    return;
                }

                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/whitelist`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) { res.status(401).json({ error: `Sign in to manage access lists.` }); return; }
            try {
                const { profileId } = zTournamentOrganizerGrantRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.addToAccessList(req.params.tournamentId, user, `whitelist`, profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                throw error;
            }
        });

        router.delete(`/tournaments/:tournamentId/whitelist/:profileId`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) { res.status(401).json({ error: `Sign in to manage access lists.` }); return; }
            try {
                res.json(await this.tournamentService.removeFromAccessList(req.params.tournamentId, user, `whitelist`, req.params.profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                throw error;
            }
        });

        router.post(`/tournaments/:tournamentId/blacklist`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) { res.status(401).json({ error: `Sign in to manage access lists.` }); return; }
            try {
                const { profileId } = zTournamentOrganizerGrantRequest.parse(req.body ?? {});
                res.json(await this.tournamentService.addToAccessList(req.params.tournamentId, user, `blacklist`, profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                throw error;
            }
        });

        router.delete(`/tournaments/:tournamentId/blacklist/:profileId`, async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) { res.status(401).json({ error: `Sign in to manage access lists.` }); return; }
            try {
                res.json(await this.tournamentService.removeFromAccessList(req.params.tournamentId, user, `blacklist`, req.params.profileId));
            } catch (error: unknown) {
                if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                throw error;
            }
        });

        for (const listName of [`whitelist`, `blacklist`] as const) {
            router.post(`/tournaments/:tournamentId/${listName}/bulk`, express.json(), async (req, res) => {
                const user = await this.authService.getUserFromRequest(req);
                if (!user) { res.status(401).json({ error: `Sign in to manage access lists.` }); return; }
                try {
                    const { names } = req.body as { names?: string[] };
                    if (!Array.isArray(names)) { res.status(400).json({ error: `names must be an array.` }); return; }
                    res.json(await this.tournamentService.bulkAddToAccessList(req.params.tournamentId, user, listName, names));
                } catch (error: unknown) {
                    if (error instanceof SessionError) { res.status(409).json({ error: error.message }); return; }
                    throw error;
                }
            });
        }

        router.post(`/sandbox-positions`, express.json(), async (req, res) => {
            const user = await this.authService.getUserFromRequest(req);
            if (!user) {
                res.status(401).json({ error: `Sign in with Discord to share sandbox positions.` });
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

        router.get(`/admin/users/search`, async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const query = zAdminUserSearchQuery.parse(req.query);
            const response: AdminUserSearchResponse = {
                users: await this.authRepository.searchUserProfiles(query.q, 10),
            };
            res.json(response);
        });

        router.put(`/admin/users/:userId/permissions`, express.json(), async (req, res) => {
            const user = await this.requireAdminUser(req, res);
            if (!user) {
                return;
            }

            const request = zAdminUpdateUserPermissionsRequest.parse(req.body ?? {});
            const updatedUser = await this.authRepository.updateUserPermissions(req.params.userId, request.permissions);
            const response: AdminUpdateUserPermissionsResponse = {
                user: updatedUser,
            };
            if (!updatedUser) {
                res.status(404).json({ error: `User not found.` });
                return;
            }

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
                    res.status(401).json({ error: `Sign in with Discord to create rated lobbies.` });
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
        const firstPlayer = request.lobbyOptions?.firstPlayer ?? DEFAULT_LOBBY_OPTIONS.firstPlayer;

        return {
            visibility: visibility ?? DEFAULT_LOBBY_OPTIONS.visibility,
            timeControl,
            rated,
            firstPlayer,
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
