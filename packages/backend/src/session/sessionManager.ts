import type { CreateSessionResponse, SessionFinishReason, SessionInfo } from '@ih3t/shared';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { BackgroundWorkerHub } from '../background/backgroundWorkers';
import { ROOT_LOGGER } from '../logger';
import {
    GameHistoryRepository,
    type CreateGameHistoryPayload,
    type StartedGameHistoryPayload,
} from '../persistence/gameHistoryRepository';
import { GameSimulation, SimulationError } from '../simulation/gameSimulation';
import { createStoredGameSession, SessionStore } from './sessionStore';
import type {
    CreateSessionParams,
    JoinSessionParams,
    JoinSessionResult,
    PendingRematch,
    PlayerLeaveSource,
    RematchRequestResult,
    RematchSessionResult,
    SessionFinishedDomainEvent,
    SessionManagerEventHandlers,
    StoredGameSession,
} from './types';

export class SessionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SessionError';
    }
}

@injectable()
export class SessionManager {
    private eventHandlers: SessionManagerEventHandlers = {};
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(SessionStore) private readonly store: SessionStore,
        @inject(GameSimulation) private readonly simulation: GameSimulation,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(BackgroundWorkerHub) private readonly backgroundWorkers: BackgroundWorkerHub
    ) {
        this.logger = rootLogger.child({ component: 'session-manager' });
    }

    setEventHandlers(eventHandlers: SessionManagerEventHandlers): void {
        this.eventHandlers = eventHandlers;
    }

    listSessions(): SessionInfo[] {
        return this.store.listSessionInfos();
    }

    createSession(params: CreateSessionParams): CreateSessionResponse {
        const sessionId = this.createSessionId();
        const session = createStoredGameSession(sessionId);

        this.store.saveSession(session);
        this.emitSessionsUpdated();
        void this.gameHistoryRepository.createHistory(this.getCreateHistoryPayload(session));

        this.backgroundWorkers.track('game-created', {
            sessionId,
            createdAt: new Date(session.createdAt).toISOString(),
            client: params.client
        });

        return { sessionId };
    }

    joinSession(params: JoinSessionParams): JoinSessionResult {
        const session = this.requireSession(params.sessionId);
        const existingRole = this.getExistingParticipantRole(session, params.participantId);
        if (existingRole) {
            return {
                sessionId: session.id,
                state: session.state,
                role: existingRole,
                players: [...session.players],
                isNewParticipant: false,
                gameState: session.state === 'ingame' ? this.simulation.getPublicGameState(session) : undefined
            };
        }

        let role: JoinSessionResult['role'];
        if (session.state === 'lobby') {
            if (session.players.length >= session.maxPlayers) {
                throw new SessionError('Session is full');
            }

            session.players.push(params.participantId);
            role = 'player';
        } else if (session.state === 'ingame') {
            session.spectators.push(params.participantId);
            role = 'spectator';
        } else {
            throw new SessionError('Session has already finished');
        }

        this.emitSessionsUpdated();
        this.backgroundWorkers.track(role === 'player' ? 'game-joined' : 'spectator-joined', {
            sessionId: session.id,
            [`${role}Id`]: params.participantId,
            players: [...session.players],
            spectators: [...session.spectators],
            client: params.client
        });

        if (role === 'player') {
            this.eventHandlers.playerJoined?.({
                sessionId: session.id,
                playerId: params.participantId,
                players: [...session.players],
                state: session.state
            });
        }

        return {
            sessionId: session.id,
            state: session.state,
            role,
            players: [...session.players],
            isNewParticipant: true,
            gameState: role === 'spectator' ? this.simulation.getPublicGameState(session) : undefined
        };
    }

    activateSession(sessionId: string): void {
        const session = this.store.getSession(sessionId);
        if (!session) {
            return;
        }

        this.reconcileLobbyState(session);
    }

    leaveSession(sessionId: string, participantId: string, source: PlayerLeaveSource): void {
        const session = this.store.getSession(sessionId);
        if (!session) {
            return;
        }

        if (session.players.includes(participantId)) {
            this.removePlayerFromSession(session, participantId, source);
            return;
        }

        if (session.spectators.includes(participantId)) {
            this.removeSpectatorFromSession(session, participantId, source);
        }
    }

    handleDisconnect(participantId: string, terminal: boolean): void {
        this.removePendingRematchesForPlayer(participantId);

        for (const session of this.store.findSessionsByParticipant(participantId)) {
            if (session.state === "ingame" && !terminal) {
                /* player may reconnect */
                continue
            }

            if (session.players.includes(participantId)) {
                this.removePlayerFromSession(session, participantId, 'disconnect');
                continue;
            }

            if (session.spectators.includes(participantId)) {
                this.removeSpectatorFromSession(session, participantId, 'disconnect');
            }
        }
    }

    placeCell(sessionId: string, participantId: string, x: number, y: number): void {
        const session = this.requireSession(sessionId);
        if (session.state !== 'ingame') {
            throw new SessionError('Game is not currently active');
        }

        if (!session.players.includes(participantId)) {
            throw new SessionError('You are not part of this session');
        }

        let moveResult;
        try {
            moveResult = this.simulation.applyMove(session, {
                playerId: participantId,
                x,
                y
            });
        } catch (error: unknown) {
            if (error instanceof SimulationError) {
                throw new SessionError(error.message);
            }

            throw error;
        }

        const historyPayload = this.getStartedHistoryPayload(session);
        if (historyPayload) {
            void this.gameHistoryRepository.appendMove(historyPayload, moveResult.move);
        }

        if (moveResult.winningPlayerId) {
            this.emitGameState(session);
            this.finishSession(session, 'six-in-a-row', moveResult.winningPlayerId);
            return;
        }

        this.simulation.syncTurnTimeout(session, this.handleTurnExpired);
        this.emitGameState(session);
    }

    requestRematch(finishedSessionId: string, participantId: string): RematchRequestResult {
        const rematch = this.store.getPendingRematch(finishedSessionId);
        if (!rematch || !rematch.players.includes(participantId)) {
            throw new SessionError('Rematch is not available for this match.');
        }

        if (rematch.availablePlayerIds.size !== rematch.players.length || !rematch.availablePlayerIds.has(participantId)) {
            throw new SessionError('Your opponent is no longer available for a rematch.');
        }

        rematch.requestedPlayerIds.add(participantId);
        this.emitRematchUpdated(rematch);

        return {
            status: rematch.requestedPlayerIds.size === rematch.players.length ? 'ready' : 'pending',
            players: [...rematch.players]
        };
    }

    createRematchSession(finishedSessionId: string): RematchSessionResult {
        const rematch = this.store.getPendingRematch(finishedSessionId);
        if (!rematch) {
            throw new SessionError('Rematch is not available for this match.');
        }

        if (rematch.requestedPlayerIds.size < rematch.players.length) {
            throw new SessionError('Waiting for both players to request the rematch.');
        }

        this.store.deletePendingRematch(finishedSessionId);

        const nextSessionId = this.createSessionId();
        const nextSession = createStoredGameSession(nextSessionId);
        nextSession.players = [...rematch.players];

        this.store.saveSession(nextSession);
        this.emitSessionsUpdated();
        void this.gameHistoryRepository.createHistory(this.getCreateHistoryPayload(nextSession));

        return {
            sessionId: nextSession.id,
            state: nextSession.state,
            players: [...nextSession.players]
        };
    }

    cancelRematch(finishedSessionId: string, participantId?: string): void {
        this.cancelPendingRematch(finishedSessionId, participantId);
    }

    expireStaleRematches(maxAgeMs: number): void {
        if (maxAgeMs <= 0) {
            return;
        }

        const threshold = Date.now() - maxAgeMs;
        for (const rematch of this.store.listPendingRematches()) {
            if (rematch.createdAt > threshold) {
                continue;
            }

            this.cancelPendingRematch(rematch.finishedSessionId);
        }
    }

    private readonly handleTurnExpired = (sessionId: string): void => {
        const session = this.store.getSession(sessionId);
        if (!session || session.state !== 'ingame' || session.players.length < 2) {
            this.simulation.clearSession(sessionId);
            return;
        }

        const timedOutPlayerId = session.gameState.currentTurnPlayerId;
        if (!timedOutPlayerId) {
            this.simulation.clearSession(sessionId);
            return;
        }

        const winningPlayerId = session.players.find((playerId) => playerId !== timedOutPlayerId) ?? null;
        this.finishSession(session, 'timeout', winningPlayerId);
    };

    private reconcileLobbyState(session: StoredGameSession): void {
        if (session.players.length === 0) {
            this.logger.info({
                event: 'session.terminated-empty',
                sessionId: session.id
            }, 'Terminating empty session');
            this.finishSession(session, 'terminated', null);
            return;
        }

        if (session.state !== 'lobby' || session.players.length < session.maxPlayers) {
            return;
        }

        session.state = 'ingame';
        session.startedAt = Date.now();
        this.simulation.startSession(session, this.handleTurnExpired, session.startedAt);
        void this.gameHistoryRepository.markStarted(this.getStartedHistoryPayload(session)!);

        this.emitGameState(session);
        this.emitSessionsUpdated();
        this.logger.info({
            event: 'session.started',
            sessionId: session.id,
            players: [...session.players],
            startedAt: session.startedAt
        }, 'Session started');
    }

    private finishSession(session: StoredGameSession, reason: SessionFinishReason, winningPlayerId: string | null): void {
        const finishedAt = Date.now();
        const finalBoardState = this.simulation.getPublicGameState(session).gameState;
        const gameDurationMs = session.startedAt === null ? null : finishedAt - session.startedAt;
        const historyPayload = this.getStartedHistoryPayload(session);
        const canRematch = winningPlayerId !== null && session.players.length === session.maxPlayers;

        if (session.state !== 'finished') {
            session.state = 'finished';
            if (canRematch) {
                this.store.savePendingRematch({
                    finishedSessionId: session.id,
                    players: [...session.players],
                    availablePlayerIds: new Set<string>(session.players),
                    requestedPlayerIds: new Set<string>(),
                    createdAt: finishedAt
                });
            }

            const event: SessionFinishedDomainEvent = {
                sessionId: session.id,
                finishedGameId: session.historyId,
                reason,
                winningPlayerId,
                canRematch
            };
            this.eventHandlers.sessionFinished?.(event);
        }

        if (historyPayload) {
            void this.gameHistoryRepository.finalizeHistory({
                ...historyPayload,
                finishedAt,
                winningPlayerId,
                reason,
                moves: [...session.moveHistory]
            });
        }

        this.backgroundWorkers.track('game-finished', {
            sessionId: session.id,
            reason,
            winningPlayerId,
            players: [...session.players],
            spectators: [...session.spectators],
            boardState: finalBoardState,
            createdAt: new Date(session.createdAt).toISOString(),
            startedAt: session.startedAt === null ? null : new Date(session.startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            gameDurationMs,
            totalLifetimeMs: finishedAt - session.createdAt
        });

        this.simulation.clearSession(session.id);
        this.store.deleteSession(session.id);
        this.emitSessionsUpdated();
        this.logger.info({
            event: 'session.finished',
            sessionId: session.id,
            reason,
            winningPlayerId,
            players: [...session.players],
            finishedAt
        }, 'Session finished');
    }

    private removePlayerFromSession(session: StoredGameSession, participantId: string, source: PlayerLeaveSource): void {
        session.players = session.players.filter((playerId) => playerId !== participantId);

        this.backgroundWorkers.track('game-left', {
            sessionId: session.id,
            playerId: participantId,
            source,
            sessionState: session.state,
            remainingPlayers: [...session.players]
        });

        if (session.state === 'ingame') {
            const [winningPlayerId] = session.players;
            this.finishSession(session, 'disconnect', winningPlayerId ?? null);
            return;
        }

        this.eventHandlers.playerLeft?.({
            sessionId: session.id,
            playerId: participantId,
            players: [...session.players],
            state: session.state
        });
        this.emitSessionsUpdated();
        this.reconcileLobbyState(session);
    }

    private removeSpectatorFromSession(session: StoredGameSession, participantId: string, source: PlayerLeaveSource): void {
        session.spectators = session.spectators.filter((spectatorId) => spectatorId !== participantId);

        this.backgroundWorkers.track('spectator-left', {
            sessionId: session.id,
            spectatorId: participantId,
            source,
            sessionState: session.state,
            remainingSpectators: [...session.spectators]
        });
    }

    private removePendingRematchesForPlayer(participantId: string): void {
        for (const rematch of this.store.listPendingRematches()) {
            if (!rematch.players.includes(participantId)) {
                continue;
            }

            rematch.availablePlayerIds.delete(participantId);
            rematch.requestedPlayerIds.clear();
            this.emitRematchUpdated(rematch);
            this.store.deletePendingRematch(rematch.finishedSessionId);
        }
    }

    private cancelPendingRematch(finishedSessionId: string, participantId?: string): void {
        const rematch = this.store.getPendingRematch(finishedSessionId);
        if (!rematch) {
            return;
        }

        if (participantId) {
            const wasAvailable = rematch.availablePlayerIds.delete(participantId);
            rematch.requestedPlayerIds.delete(participantId);
            if (!wasAvailable) {
                return;
            }

            rematch.requestedPlayerIds.clear();
            this.emitRematchUpdated(rematch);
            this.store.deletePendingRematch(finishedSessionId);
            return;
        }

        rematch.availablePlayerIds.clear();
        rematch.requestedPlayerIds.clear();
        this.emitRematchUpdated(rematch);
        this.store.deletePendingRematch(finishedSessionId);
    }

    private emitSessionsUpdated(): void {
        this.eventHandlers.sessionsUpdated?.(this.listSessions());
    }

    private emitGameState(session: StoredGameSession): void {
        this.eventHandlers.gameStateUpdated?.(this.simulation.getPublicGameState(session));
    }

    private emitRematchUpdated(rematch: PendingRematch): void {
        this.eventHandlers.rematchUpdated?.({
            sessionId: rematch.finishedSessionId,
            playerIds: [...rematch.players],
            canRematch: rematch.availablePlayerIds.size === rematch.players.length,
            requestedPlayerIds: [...rematch.requestedPlayerIds]
        });
    }

    private requireSession(sessionId: string): StoredGameSession {
        const session = this.store.getSession(sessionId);
        if (!session) {
            throw new SessionError('Session not found');
        }

        return session;
    }

    private getExistingParticipantRole(session: StoredGameSession, participantId: string): JoinSessionResult['role'] | null {
        if (session.players.includes(participantId)) {
            return 'player';
        }

        if (session.spectators.includes(participantId)) {
            return 'spectator';
        }

        return null;
    }

    private createSessionId(): string {
        let sessionId = Math.random().toString(36).substring(2, 8);
        while (this.store.getSession(sessionId)) {
            sessionId = Math.random().toString(36).substring(2, 8);
        }

        return sessionId;
    }

    private getCreateHistoryPayload(session: StoredGameSession): CreateGameHistoryPayload {
        return {
            id: session.historyId,
            sessionId: session.id,
            createdAt: session.createdAt
        };
    }

    private getStartedHistoryPayload(session: StoredGameSession): StartedGameHistoryPayload | null {
        if (session.startedAt === null) {
            return null;
        }

        return {
            id: session.historyId,
            sessionId: session.id,
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            players: [...session.players]
        };
    }
}
