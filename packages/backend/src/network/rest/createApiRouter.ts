import express from 'express';
import { inject, injectable } from 'tsyringe';
import type { CreateSessionResponse } from '@ih3t/shared';
import { getRequestClientInfo } from '../clientInfo';
import { GameHistoryRepository } from '../../persistence/gameHistoryRepository';
import { SessionManager } from '../../session/sessionManager';

@injectable()
export class ApiRouter {
    readonly router: express.Router;

    constructor(
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository
    ) {
        const router = express.Router();

        router.get('/sessions', (_req, res) => {
            res.json(this.sessionManager.listSessions());
        });

        router.get('/finished-games', async (_req, res) => {
            const games = await this.gameHistoryRepository.listFinishedGames();
            res.json({ games });
        });

        router.get('/finished-games/:id', async (req, res) => {
            const game = await this.gameHistoryRepository.getFinishedGame(req.params.id);
            if (!game) {
                res.status(404).json({ error: 'Finished game not found' });
                return;
            }

            res.json(game);
        });

        router.post('/sessions', express.json(), (req, res) => {
            const response: CreateSessionResponse = this.sessionManager.createSession({
                client: getRequestClientInfo(req)
            });

            res.json(response);
        });

        this.router = router;
    }
}
