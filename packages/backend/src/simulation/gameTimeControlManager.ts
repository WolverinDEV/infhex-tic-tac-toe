import type { GameTimeControl } from '@ih3t/shared';
import { injectable } from 'tsyringe';

import type { ServerGameSession } from '../session/types';

type TurnExpiredHandler = (sessionId: string) => void;

type HandleMoveParams = {
    playerId: string;
    timestamp: number;
    turnCompleted: boolean;
    turnExpiresAt: number | null;
};

export class GameTimeControlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = `GameTimeControlError`;
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
        const expiresAt = session.currentTurnExpiresAt;
        if (expiresAt !== null && timestamp > expiresAt) {
            throw new GameTimeControlError(`Your time has expired`);
        }
    }

    handleMoveApplied(session: ServerGameSession, params: HandleMoveParams): void {
        const { playerId, timestamp, turnCompleted, turnExpiresAt } = params;
        const timeControl = this.getTimeControl(session);

        if (timeControl.mode === `match`) {
            const fallbackTimeMs = this.getPlayerRemainingTime(session, playerId, timeControl.mainTimeMs);
            session.gameState.playerTimeRemainingMs[playerId] = this.getRemainingTimeFromDeadline(
                turnExpiresAt,
                timestamp,
                fallbackTimeMs,
            );

            if (turnCompleted) {
                session.gameState.playerTimeRemainingMs[playerId] += timeControl.incrementMs;
            }
        }

        if (turnCompleted && session.gameState.currentTurnPlayerId !== playerId) {
            this.syncActiveTurnClock(session, timestamp);
        }
    }

    freezeActiveTurnState(session: ServerGameSession, timestamp: number): void {
        const playerId = session.gameState.currentTurnPlayerId;
        if (!playerId || session.gameState.placementsRemaining === 0) {
            return;
        }

        const timeControl = this.getTimeControl(session);
        if (timeControl.mode !== `match`) {
            return;
        }

        const fallbackTimeMs = this.getPlayerRemainingTime(session, playerId, timeControl.mainTimeMs);
        session.gameState.playerTimeRemainingMs[playerId] = this.getRemainingTimeFromDeadline(
            session.currentTurnExpiresAt,
            timestamp,
            fallbackTimeMs,
        );
    }

    syncTurnTimeout(session: ServerGameSession, onTurnExpired: TurnExpiredHandler): void {
        this.clearSession(session.id);

        if (
            session.state !== `in-game`
            || session.gameState.winner !== null
            || !session.gameState.currentTurnPlayerId
            || session.currentTurnExpiresAt === null
        ) {
            return;
        }

        const delay = Math.max(0, session.currentTurnExpiresAt - Date.now());
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

    getCurrentTurnExpiresInMs(session: ServerGameSession, timestamp = Date.now()): number | null {
        if (
            session.state !== `in-game`
            || session.gameState.winner !== null
            || !session.gameState.currentTurnPlayerId
            || session.currentTurnExpiresAt === null
        ) {
            return null;
        }

        return Math.max(0, session.currentTurnExpiresAt - timestamp);
    }

    private initializePlayerClocks(session: ServerGameSession): void {
        const timeControl = this.getTimeControl(session);
        if (timeControl.mode !== `match`) {
            session.gameState.playerTimeRemainingMs = {};
            return;
        }

        session.gameState.playerTimeRemainingMs = Object.fromEntries(session.players.map((player) => [player.id, timeControl.mainTimeMs]));
    }

    private syncActiveTurnClock(session: ServerGameSession, timestamp: number): void {
        const currentPlayerId = session.gameState.currentTurnPlayerId;
        if (!currentPlayerId) {
            session.currentTurnExpiresAt = null;
            session.gameState.currentTurnExpiresInMs = null;
            return;
        }

        const timeControl = this.getTimeControl(session);
        switch (timeControl.mode) {
            case `unlimited`:
                session.currentTurnExpiresAt = null;
                session.gameState.currentTurnExpiresInMs = null;
                break;

            case `match`: {
                const remainingTimeMs = this.getPlayerRemainingTime(
                    session,
                    currentPlayerId,
                    timeControl.mainTimeMs,
                );
                session.currentTurnExpiresAt = timestamp + remainingTimeMs;
                session.gameState.currentTurnExpiresInMs = remainingTimeMs;
                break;
            }

            case `turn`:
                session.currentTurnExpiresAt = timestamp + timeControl.turnTimeMs;
                session.gameState.currentTurnExpiresInMs = timeControl.turnTimeMs;
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
        return session.gameState.playerTimeRemainingMs[playerId] ?? fallbackTimeMs;
    }

    private getTimeControl(session: ServerGameSession): GameTimeControl {
        return session.gameOptions.timeControl;
    }
}
