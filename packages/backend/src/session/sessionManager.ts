import type { CreateSessionResponse, SessionFinishReason, SessionInfo, ShutdownState } from '@ih3t/shared';
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

export interface TerminalSessionStatus {
    sessionId: string;
    state: 'lobby' | 'ingame' | 'finished';
    playerCount: number;
    spectatorCount: number;
    moveCount: number;
    createdAt: number;
    startedAt: number | null;
    gameDurationMs: number | null;
    totalLifetimeMs: number;
    currentTurnPlayerId: string | null;
    placementsRemaining: number;
}

const DEFAULT_SHUTDOWN_DELAY_MS = 10 * 60 * 1000;
type ShutdownTrigger = 'all-sessions-finished' | 'deadline-reached';

@injectable()
export class SessionManager {
    private eventHandlers: SessionManagerEventHandlers = {};
    private readonly logger: Logger;
    private scheduledShutdown: ShutdownState | null = null;
    private scheduledShutdownTimer: ReturnType<typeof setTimeout> | null = null;
    private shutdownRequested = false;
    private shutdownHandler: (() => void) | null = null;

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

    setShutdownHandler(handler: () => void): void {
        this.shutdownHandler = handler;
    }

    listSessions(): SessionInfo[] {
        return this.store.listSessionInfos();
    }

    getTerminalSessionStatuses(now = Date.now()): TerminalSessionStatus[] {
        return this.store.listSessions().map((session) => ({
            sessionId: session.id,
            state: session.state,
            playerCount: session.players.length,
            spectatorCount: session.spectators.length,
            moveCount: session.moveHistory.length,
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            gameDurationMs: session.startedAt === null ? null : Math.max(0, now - session.startedAt),
            totalLifetimeMs: Math.max(0, now - session.createdAt),
            currentTurnPlayerId: session.gameState.currentTurnPlayerId,
            placementsRemaining: session.gameState.placementsRemaining
        }));
    }

    getShutdownState(): ShutdownState | null {
        if (!this.scheduledShutdown) {
            return null;
        }

        return { ...this.scheduledShutdown };
    }

    scheduleShutdown(delayMs = DEFAULT_SHUTDOWN_DELAY_MS): ShutdownState {
        if (this.scheduledShutdown) {
            return { ...this.scheduledShutdown };
        }

        const scheduledAt = Date.now();
        this.scheduledShutdown = {
            scheduledAt,
            shutdownAt: scheduledAt + delayMs
        };
        this.shutdownRequested = false;

        this.clearScheduledShutdownTimer();
        this.scheduledShutdownTimer = setTimeout(() => {
            this.handleScheduledShutdownDeadline();
        }, delayMs);

        for (const rematch of this.store.listPendingRematches()) {
            this.cancelPendingRematch(rematch.finishedSessionId);
        }

        this.emitShutdownUpdated();
        this.logger.info({
            event: 'shutdown.scheduled',
            scheduledAt,
            shutdownAt: this.scheduledShutdown.shutdownAt,
            activeSessionCount: this.store.listSessions().length
        }, 'Scheduled server shutdown');

        if (this.store.listSessions().length === 0) {
            setTimeout(() => {
                this.requestApplicationShutdown('all-sessions-finished');
            }, 0);
        }

        return { ...this.scheduledShutdown };
    }

    createSession(params: CreateSessionParams): CreateSessionResponse {
        if (this.scheduledShutdown) {
            throw new SessionError('Server shutdown is scheduled. New games cannot be created.');
        }

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

        void this.gameHistoryRepository.appendMove(session.historyId, moveResult.move);

        if (moveResult.winningPlayerId) {
            this.emitGameState(session);
            this.finishSession(session, 'six-in-a-row', moveResult.winningPlayerId);
            return;
        }

        this.simulation.syncTurnTimeout(session, this.handleTurnExpired);
        this.emitGameState(session);
    }

    requestRematch(finishedSessionId: string, participantId: string): RematchRequestResult {
        if (this.scheduledShutdown) {
            throw new SessionError('Server shutdown is scheduled. Rematches are unavailable.');
        }

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
        if (this.scheduledShutdown) {
            throw new SessionError('Server shutdown is scheduled. Rematches are unavailable.');
        }

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

    private handleScheduledShutdownDeadline(): void {
        const shutdown = this.scheduledShutdown;
        if (!shutdown) {
            return;
        }

        this.clearScheduledShutdownTimer();
        this.logger.info({
            event: 'shutdown.deadline-reached',
            shutdownAt: shutdown.shutdownAt,
            activeSessionCount: this.store.listSessions().length
        }, 'Shutdown deadline reached; closing remaining sessions');

        for (const session of [...this.store.listSessions()]) {
            this.finishSession(session, 'terminated', null);
        }

        this.requestApplicationShutdown('deadline-reached');
    }

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
        void this.gameHistoryRepository.markStarted(session.historyId, session.players);

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
        const canRematch = winningPlayerId !== null && session.players.length === session.maxPlayers && !this.scheduledShutdown;

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

        void this.gameHistoryRepository.finalizeHistory({
            id: session.historyId,
            startedAt: session.startedAt!,
            winningPlayerId,
            reason,
        });

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
        this.maybeShutdownAfterSessionFinished();
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

    private emitShutdownUpdated(): void {
        this.eventHandlers.shutdownUpdated?.(this.getShutdownState());
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

    private maybeShutdownAfterSessionFinished(): void {
        if (!this.scheduledShutdown || this.shutdownRequested || this.store.listSessions().length > 0) {
            return;
        }

        this.requestApplicationShutdown('all-sessions-finished');
    }

    private requestApplicationShutdown(trigger: ShutdownTrigger): void {
        if (this.shutdownRequested) {
            return;
        }

        this.shutdownRequested = true;
        this.clearScheduledShutdownTimer();
        this.logger.info({
            event: 'shutdown.requested',
            trigger,
            shutdownAt: this.scheduledShutdown?.shutdownAt ?? null
        }, 'Requesting application shutdown');

        this.shutdownHandler?.();
    }

    private clearScheduledShutdownTimer(): void {
        if (!this.scheduledShutdownTimer) {
            return;
        }

        clearTimeout(this.scheduledShutdownTimer);
        this.scheduledShutdownTimer = null;
    }
}
