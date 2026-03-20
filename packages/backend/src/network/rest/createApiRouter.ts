import express from 'express';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
    type AccountResponse,
    DEFAULT_LOBBY_OPTIONS,
    type CreateSessionResponse,
    type LobbyOptions,
    zLobbyVisibility,
    zUpdateAccountProfileRequest,
} from '@ih3t/shared';
import { AuthRepository } from '../../auth/authRepository';
import { AuthService } from '../../auth/authService';
import { getRequestClientInfo } from '../clientInfo';
import { GameHistoryRepository } from '../../persistence/gameHistoryRepository';
import { SessionError, SessionManager } from '../../session/sessionManager';

const zPositiveInteger = z.coerce.number().int().positive();
const zPositiveIntegerQueryValue = z.preprocess((value) => Array.isArray(value) ? value[0] : value, zPositiveInteger);
const zFinishedGamesQuery = z.object({
    page: zPositiveIntegerQueryValue.optional(),
    pageSize: zPositiveIntegerQueryValue.optional(),
    baseTimestamp: zPositiveIntegerQueryValue.optional()
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
        timeControl: zGameTimeControlInput.optional()
    }).optional()
});

@injectable()
export class ApiRouter {
    readonly router: express.Router;

    constructor(
        @inject(AuthService) private readonly authService: AuthService,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository
    ) {
        const router = express.Router();

        router.get('/account', async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            const response: AccountResponse = { user };
            res.json(response);
        });

        router.patch('/account', express.json(), async (req, res) => {
            const user = await this.authService.getCurrentUser(req);
            if (!user) {
                res.status(401).json({ error: 'Sign in with Discord to update your username.' });
                return;
            }

            try {
                const username = this.parseUsername(req.body);
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

        router.get('/sessions', (_req, res) => {
            res.json(this.sessionManager.listSessions());
        });

        router.get('/finished-games', async (req, res) => {
            const query = zFinishedGamesQuery.parse(req.query);
            const archivePage = await this.gameHistoryRepository.listFinishedGames({
                page: query.page ?? 1,
                pageSize: query.pageSize ?? 20,
                baseTimestamp: query.baseTimestamp ?? Date.now()
            });
            res.json(archivePage);
        });

        router.get('/finished-games/:id', async (req, res) => {
            const game = await this.gameHistoryRepository.getFinishedGame(req.params.id);
            if (!game) {
                res.status(404).json({ error: 'Finished game not found' });
                return;
            }

            if (game.players.length <= 1) {
                /* Fix for #13 where the second player is missing in the players array. */
                game.players = [...new Set(game.moves.map(move => move.playerId))];
            }

            res.json(game);
        });

        router.post('/sessions', express.json(), async (req, res) => {
            try {
                const lobbyOptions = this.parseLobbyOptions(req.body);
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

        return {
            visibility: visibility ?? DEFAULT_LOBBY_OPTIONS.visibility,
            timeControl
        };
    }

    private parseUsername(body: unknown): string {
        return zUpdateAccountProfileRequest.parse(body ?? {}).username;
    }
}
