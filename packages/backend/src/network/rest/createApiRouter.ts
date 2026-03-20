import express from 'express';
import { inject, injectable } from 'tsyringe';
import {
    type AccountResponse,
    DEFAULT_LOBBY_OPTIONS,
    type CreateSessionRequest,
    type CreateSessionResponse,
    type GameTimeControl,
    type LobbyOptions,
    type UpdateAccountProfileRequest,
} from '@ih3t/shared';
import { AuthRepository } from '../../auth/authRepository';
import { AuthService } from '../../auth/authService';
import { getRequestClientInfo } from '../clientInfo';
import { GameHistoryRepository } from '../../persistence/gameHistoryRepository';
import { SessionError, SessionManager } from '../../session/sessionManager';

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
            const archivePage = await this.gameHistoryRepository.listFinishedGames({
                page: this.parsePositiveInteger(req.query.page, 1),
                pageSize: this.parsePositiveInteger(req.query.pageSize, 20),
                baseTimestamp: this.parsePositiveInteger(req.query.baseTimestamp, Date.now())
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
        const request = (body ?? {}) as CreateSessionRequest;
        const visibility = request.lobbyOptions?.visibility;
        const timeControl = this.parseGameTimeControl(request.lobbyOptions?.timeControl);

        return {
            visibility: visibility === 'private' || visibility === 'public'
                ? visibility
                : DEFAULT_LOBBY_OPTIONS.visibility,
            timeControl
        };
    }

    private parseGameTimeControl(value: unknown): GameTimeControl {
        if (!value || typeof value !== 'object') {
            return { ...DEFAULT_LOBBY_OPTIONS.timeControl };
        }

        const candidate = value as Partial<GameTimeControl> & Record<string, unknown>;
        if (candidate.mode === 'turn') {
            return {
                mode: 'turn',
                turnTimeMs: this.clampMilliseconds(candidate.turnTimeMs, 5_000, 120_000)
            };
        }

        if (candidate.mode === 'match') {
            return {
                mode: 'match',
                mainTimeMs: this.clampMilliseconds(candidate.mainTimeMs, 60_000, 3_600_000),
                incrementMs: this.clampMilliseconds(candidate.incrementMs, 0, 300_000)
            };
        }

        return { mode: 'unlimited' };
    }

    private parsePositiveInteger(value: unknown, fallback: number): number {
        const candidate = Array.isArray(value) ? value[0] : value;
        const parsedValue = Number.parseInt(String(candidate ?? ''), 10);

        if (!Number.isFinite(parsedValue) || parsedValue < 1) {
            return fallback;
        }

        return parsedValue;
    }

    private clampMilliseconds(value: unknown, minimum: number, maximum: number): number {
        const parsedValue = Number.parseInt(String(value ?? ''), 10);
        if (!Number.isFinite(parsedValue)) {
            return minimum;
        }

        return Math.min(maximum, Math.max(minimum, parsedValue));
    }

    private parseUsername(body: unknown): string {
        const request = (body ?? {}) as Partial<UpdateAccountProfileRequest>;
        const username = typeof request.username === 'string'
            ? request.username.trim().replace(/\s+/g, ' ')
            : '';

        if (username.length < 2 || username.length > 32) {
            throw new SessionError('Your username must be between 2 and 32 characters long.');
        }

        if (/[\p{C}]/u.test(username)) {
            throw new SessionError('Your username contains unsupported characters.');
        }

        return username;
    }
}
