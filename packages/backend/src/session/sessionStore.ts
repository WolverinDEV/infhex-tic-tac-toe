import { randomUUID } from 'node:crypto';
import { injectable } from 'tsyringe';
import type { SessionInfo } from '@ih3t/shared';
import type { PendingRematch, StoredGameSession } from './types';

@injectable()
export class SessionStore {
    private readonly sessions = new Map<string, StoredGameSession>();
    private readonly pendingRematches = new Map<string, PendingRematch>();

    listSessions(): StoredGameSession[] {
        return Array.from(this.sessions.values());
    }

    getSession(sessionId: string): StoredGameSession | undefined {
        return this.sessions.get(sessionId);
    }

    saveSession(session: StoredGameSession): void {
        this.sessions.set(session.id, session);
    }

    deleteSession(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    listSessionInfos(): SessionInfo[] {
        return this.listSessions().map((session) => ({
            id: session.id,
            playerCount: session.players.length,
            maxPlayers: session.maxPlayers,
            state: session.state,
            canJoin: session.state === 'lobby' && session.players.length < session.maxPlayers
        }));
    }

    findSessionsByParticipant(participantId: string): StoredGameSession[] {
        return this.listSessions().filter((session) =>
            session.players.includes(participantId) || session.spectators.includes(participantId)
        );
    }

    getPendingRematch(sessionId: string): PendingRematch | undefined {
        return this.pendingRematches.get(sessionId);
    }

    savePendingRematch(rematch: PendingRematch): void {
        this.pendingRematches.set(rematch.finishedSessionId, rematch);
    }

    deletePendingRematch(sessionId: string): void {
        this.pendingRematches.delete(sessionId);
    }

    listPendingRematches(): PendingRematch[] {
        return Array.from(this.pendingRematches.values());
    }
}

export function createStoredGameSession(sessionId: string, createdAt = Date.now()): StoredGameSession {
    return {
        id: sessionId,
        historyId: randomUUID(),
        players: [],
        spectators: [],
        maxPlayers: 2,
        state: 'lobby',
        createdAt,
        startedAt: null,
        moveHistory: [],
        gameState: {
            cells: [],
            currentTurnPlayerId: null,
            placementsRemaining: 0,
            currentTurnExpiresAt: null
        }
    };
}
