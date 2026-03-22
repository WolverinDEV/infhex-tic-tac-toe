import { injectable } from 'tsyringe';
import type { GameTimeControl } from '@ih3t/shared';
import type { ServerGameSession } from '../session/types';

type TurnExpiredHandler = (sessionId: string) => void;

interface HandleMoveParams {
    playerId: string;
    timestamp: number;
    turnCompleted: boolean;
    turnExpiresAt: number | null;
}

export class GameTimeControlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GameTimeControlError';
    }
}

@injectable()
export class GameTimeControlManager {
    private readonly turnTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    startSession(session: ServerGameSession, onTurnExpired: TurnExpiredHandler, startedAt = Date.now()): void {
        this.initializePlayerClocks(session);
        this.syncActiveTurnClock(session, startedAt);
        this.syncTurnTimeout(session, onTurnExpired);
    }

    ensureTurnHasTimeRemaining(session: ServerGameSession, timestamp: number): void {
        const expiresAt = session.boardState.currentTurnExpiresAt;
        if (expiresAt !== null && timestamp > expiresAt) {
            throw new GameTimeControlError('Your time has expired');
        }
    }

    handleMoveApplied(session: ServerGameSession, params: HandleMoveParams): void {
        const { playerId, timestamp, turnCompleted, turnExpiresAt } = params;
        const timeControl = this.getTimeControl(session);

        if (timeControl.mode === 'match') {
            const fallbackTimeMs = this.getPlayerRemainingTime(session, playerId, timeControl.mainTimeMs);
            session.boardState.playerTimeRemainingMs[playerId] = this.getRemainingTimeFromDeadline(
                turnExpiresAt,
                timestamp,
                fallbackTimeMs
            );

            if (turnCompleted) {
                session.boardState.playerTimeRemainingMs[playerId] += timeControl.incrementMs;
            }
        }

        if (turnCompleted && session.boardState.currentTurnPlayerId !== playerId) {
            this.syncActiveTurnClock(session, timestamp);
        }
    }

    freezeActiveTurnState(session: ServerGameSession, timestamp: number): void {
        const playerId = session.boardState.currentTurnPlayerId;
        if (!playerId || session.boardState.placementsRemaining === 0) {
            return;
        }

        const timeControl = this.getTimeControl(session);
        if (timeControl.mode !== 'match') {
            return;
        }

        const fallbackTimeMs = this.getPlayerRemainingTime(session, playerId, timeControl.mainTimeMs);
        session.boardState.playerTimeRemainingMs[playerId] = this.getRemainingTimeFromDeadline(
            session.boardState.currentTurnExpiresAt,
            timestamp,
            fallbackTimeMs
        );
    }

    syncTurnTimeout(session: ServerGameSession, onTurnExpired: TurnExpiredHandler): void {
        this.clearSession(session.id);

        if (session.state !== 'in-game' || !session.boardState.currentTurnPlayerId || !session.boardState.currentTurnExpiresAt) {
            return;
        }

        const delay = Math.max(0, session.boardState.currentTurnExpiresAt - Date.now());
        const timeout = setTimeout(() => {
            onTurnExpired(session.id);
        }, delay);

        this.turnTimeouts.set(session.id, timeout);
    }

    clearSession(sessionId: string): void {
        const timeout = this.turnTimeouts.get(sessionId);
        if (!timeout) {
            return;
        }

        clearTimeout(timeout);
        this.turnTimeouts.delete(sessionId);
    }

    dispose(): void {
        for (const sessionId of this.turnTimeouts.keys()) {
            this.clearSession(sessionId);
        }
    }

    private initializePlayerClocks(session: ServerGameSession): void {
        const timeControl = this.getTimeControl(session);
        if (timeControl.mode !== 'match') {
            session.boardState.playerTimeRemainingMs = {};
            return;
        }

        session.boardState.playerTimeRemainingMs = Object.fromEntries(
            session.players.map((player) => [player.id, timeControl.mainTimeMs])
        );
    }

    private syncActiveTurnClock(session: ServerGameSession, timestamp: number): void {
        const currentPlayerId = session.boardState.currentTurnPlayerId;
        if (!currentPlayerId) {
            session.boardState.currentTurnExpiresAt = null;
            return;
        }

        const timeControl = this.getTimeControl(session);
        switch (timeControl.mode) {
            case 'unlimited':
                session.boardState.currentTurnExpiresAt = null;
                break;

            case 'match':
                session.boardState.currentTurnExpiresAt = timestamp + this.getPlayerRemainingTime(
                    session,
                    currentPlayerId,
                    timeControl.mainTimeMs
                );
                break;

            case 'turn':
                session.boardState.currentTurnExpiresAt = timestamp + timeControl.turnTimeMs;
                break;
        }
    }

    private getRemainingTimeFromDeadline(expiresAt: number | null, timestamp: number, fallbackTimeMs: number): number {
        if (expiresAt === null) {
            return fallbackTimeMs;
        }

        return Math.max(0, expiresAt - timestamp);
    }

    private getPlayerRemainingTime(session: ServerGameSession, playerId: string, fallbackTimeMs: number): number {
        return session.boardState.playerTimeRemainingMs[playerId] ?? fallbackTimeMs;
    }

    private getTimeControl(session: ServerGameSession): GameTimeControl {
        return session.gameOptions.timeControl;
    }
}
