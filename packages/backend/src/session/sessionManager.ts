import type {
    PlayerTileConfig,
    CreateSessionResponse,
    DatabaseGameResult,
    LobbyInfo,
    SessionFinishReason,
    SessionInfo,
    SessionParticipantRole,
    ShutdownState
} from '@ih3t/shared';
import { buildPlayerTileConfigMap } from '@ih3t/shared';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { EloHandler } from '../elo/eloHandler';
import { ROOT_LOGGER } from '../logger';
import { MetricsTracker } from '../metrics/metricsTracker';
import { ServerSettingsService } from '../admin/serverSettingsService';
import {
    GameHistoryRepository,
} from '../persistence/gameHistoryRepository';
import { GameSimulation, SimulationError } from '../simulation/gameSimulation';
import { GameTimeControlError, GameTimeControlManager } from '../simulation/gameTimeControlManager';
import type {
    CreateSessionParams,
    JoinSessionParams,
    JoinSessionResult,
    ParticipantJoinedEvent,
    ParticipantLeftEvent,
    PlayerLeaveSource,
    RematchRequestResult,
    RematchSessionResult,
    SessionManagerEventHandlers,
    SessionUpdatedEvent,
    ServerGameSession,
    ServerSessionParticipant,
    ClientGameParticipation,
} from './types';
import {
    cloneGameBoard,
    cloneGameOptions,
    cloneParticipants,
    cloneStoredParticipants,
    createGameSession,
} from './types';

export class SessionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SessionError';
    }
}

export interface TerminalSessionStatus {
    sessionId: string;
    state: 'lobby' | 'in-game' | 'finished';
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

export interface ActiveSessionCounts {
    total: number;
    public: number;
    private: number;
}

const DEFAULT_SHUTDOWN_DELAY_MS = 10 * 60 * 1000;
const MAX_PLAYERS_PER_SESSION = 2;
type ShutdownTrigger = 'all-sessions-finished' | 'deadline-reached';

@injectable()
export class SessionManager {
    private eventHandlers: SessionManagerEventHandlers = {};
    private readonly logger: Logger;
    private readonly sessions = new Map<string, ServerGameSession>();
    private scheduledShutdown: ShutdownState | null = null;
    private scheduledShutdownTimer: ReturnType<typeof setTimeout> | null = null;
    private shutdownRequested = false;
    private shutdownHandler: (() => void) | null = null;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(GameSimulation) private readonly simulation: GameSimulation,
        @inject(GameTimeControlManager) private readonly timeControl: GameTimeControlManager,
        @inject(EloHandler) private readonly eloHandler: EloHandler,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(MetricsTracker) private readonly metricsTracker: MetricsTracker,
        @inject(ServerSettingsService) private readonly serverSettingsService: ServerSettingsService
    ) {
        this.logger = rootLogger.child({ component: 'session-manager' });
    }

    setEventHandlers(eventHandlers: SessionManagerEventHandlers): void {
        this.eventHandlers = eventHandlers;
    }

    setShutdownHandler(handler: () => void): void {
        this.shutdownHandler = handler;
    }

    listLobbyInfo(): LobbyInfo[] {
        return this.listStoredSessions()
            .filter((session) => {
                if (session.state === 'finished') {
                    return false;
                }

                return session.state !== 'lobby' || session.gameOptions.visibility === 'public';
            })
            .map((session) => this.toLobbyInfo(session));
    }

    getSessionInfo(sessionId: string): SessionInfo | null {
        const session = this.sessions.get(sessionId);
        return session ? this.toSessionInfo(session) : null;
    }

    async terminateActiveSession(sessionId: string): Promise<SessionInfo> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new SessionError('Session not found.');
        }

        if (session.state === 'lobby') {
            throw new SessionError('Only in-progress games can be terminated.');
        }

        if (session.state === 'finished') {
            throw new SessionError('Session has already finished.');
        }

        await this.finishSession(session, 'terminated', null);
        return this.toSessionInfo(session);
    }

    getTerminalSessionStatuses(now = Date.now()): TerminalSessionStatus[] {
        return this.listStoredSessions().map((session) => ({
            sessionId: session.id,
            state: session.state,
            playerCount: session.players.length,
            spectatorCount: session.spectators.length,
            moveCount: session.moveHistory.length,
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            gameDurationMs: session.startedAt === null ? null : Math.max(0, now - session.startedAt),
            totalLifetimeMs: Math.max(0, now - session.createdAt),
            currentTurnPlayerId: session.boardState.currentTurnPlayerId,
            placementsRemaining: session.boardState.placementsRemaining
        }));
    }

    getActiveSessionCounts(): ActiveSessionCounts {
        const counts: ActiveSessionCounts = {
            total: 0,
            public: 0,
            private: 0
        };

        for (const session of this.listStoredSessions()) {
            if (session.state === 'finished') {
                continue;
            }

            counts.total += 1;
            counts[session.gameOptions.visibility] += 1;
        }

        return counts;
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

        this.emitShutdownUpdated();
        this.logger.info({
            event: 'shutdown.scheduled',
            scheduledAt,
            shutdownAt: this.scheduledShutdown.shutdownAt,
            activeSessionCount: this.sessions.size
        }, 'Scheduled server shutdown');

        if (this.sessions.size === 0) {
            setTimeout(() => {
                this.requestApplicationShutdown('all-sessions-finished');
            }, 0);
        }

        return { ...this.scheduledShutdown };
    }

    cancelShutdown(): boolean {
        if (!this.scheduledShutdown) {
            return false;
        }

        const cancelledShutdown = { ...this.scheduledShutdown };
        this.scheduledShutdown = null;
        this.shutdownRequested = false;
        this.clearScheduledShutdownTimer();
        this.emitShutdownUpdated();
        this.logger.info({
            event: 'shutdown.cancelled',
            scheduledAt: cancelledShutdown.scheduledAt,
            shutdownAt: cancelledShutdown.shutdownAt,
            activeSessionCount: this.sessions.size
        }, 'Cancelled scheduled server shutdown');

        return true;
    }

    createSession(params: CreateSessionParams): CreateSessionResponse {
        this.assertNewGameCreationAllowed('lobby');

        const sessionId = this.createSessionId();
        const session = createGameSession(sessionId, params.lobbyOptions);

        this.sessions.set(session.id, session);

        // Do not send an update yet. 
        // An update will ether be send once a player joined that lobby anyways.
        // This reduces the total update count.
        // this.emitLobbyListUpdated();

        this.logger.info({
            event: 'session.created',
            sessionId: session.id,
            visibility: session.gameOptions.visibility,
            createdAt: session.createdAt,
            client: params.client
        }, 'Session created');

        this.metricsTracker.track('game-created', {
            sessionId,
            createdAt: new Date(session.createdAt).toISOString(),
            client: params.client
        });

        return { sessionId };
    }

    async joinSession(params: JoinSessionParams): Promise<JoinSessionResult> {
        const session = this.requireSession(params.sessionId);
        if (session.state === 'finished') {
            throw new SessionError('Session has already finished');
        }

        const existingParticipation = this.findParticipationFromSocketId(params.socketId);
        if (existingParticipation?.session === session) {
            return {
                session: this.toSessionInfo(session),

                participantId: existingParticipation.participationId,
                participantRole: existingParticipation.participationRole,

                isNewParticipant: false,

                gameState: this.simulation.getPublicGameState(session),
            }
        } else if (existingParticipation) {
            throw new SessionError('Socket already bound to a session');
        }

        const profileId = params.user.id.startsWith('guest:') ? null : params.user.id;
        if (session.gameOptions.rated && !profileId) {
            throw new SessionError('Sign in with Discord to join rated games.');
        }

        const rating = await this.eloHandler.getPlayerRating(profileId);
        const participant = {
            id: this.createParticipantId(session),
            displayName: params.user.username,
            profileId,
            elo: rating?.elo ?? null,
            eloChange: null,
            deviceId: params.client.deviceId ?? randomUUID(),
            connection: {
                status: 'connected',
                socketId: params.socketId
            }
        } satisfies ServerSessionParticipant;

        let role: JoinSessionResult['participantRole'];
        if (session.state === 'lobby') {
            if (session.players.length >= MAX_PLAYERS_PER_SESSION) {
                throw new SessionError('Session is full');
            }

            if (session.gameOptions.rated && profileId && session.players.some((player) => player.profileId === profileId)) {
                throw new SessionError('You cannot join your own rated lobby as the second player.');
            }

            session.players.push(participant);
            role = 'player';
        } else {
            session.spectators.push(participant);
            role = 'spectator';
        }

        const sessionInfo = this.toSessionInfo(session);
        this.emitLobbyListUpdated();
        this.emitSessionUpdated(session);
        this.metricsTracker.track(role === 'player' ? 'game-joined' : 'spectator-joined', {
            sessionId: session.id,
            [`${role}Id`]: participant.id,
            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id),
            client: params.client
        });

        const event: ParticipantJoinedEvent = {
            sessionId: session.id,
            participantId: participant.id,
            participantRole: role,
            session: sessionInfo
        };
        this.eventHandlers.participantJoined?.(event);

        return {
            session: sessionInfo,
            participantId: participant.id,
            participantRole: role,
            isNewParticipant: true,
            gameState: this.simulation.getPublicGameState(session)
        };
    }

    async activateSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        await this.reconcileLobbyState(session);
    }

    async reconcileLobbySessions(): Promise<void> {
        const lobbySessions = [...this.sessions.values()].filter((session) => session.state !== 'finished');
        await Promise.allSettled(lobbySessions.map((session) => this.reconcileLobbyState(session)));
    }

    leaveSession(sessionId: string, participantId: string, source: PlayerLeaveSource): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        if (session.players.some((participant) => participant.id === participantId)) {
            this.removePlayerFromSession(session, participantId, source);
            return;
        }

        if (session.spectators.some((participant) => participant.id === participantId)) {
            this.removeSpectatorFromSession(session, participantId, source);
        }
    }

    surrenderSession(sessionId: string, participantId: string): void {
        const session = this.requireSession(sessionId);
        if (session.state !== 'in-game') {
            throw new SessionError('Game is not currently active');
        }

        if (!session.players.some((participant) => participant.id === participantId)) {
            throw new SessionError('Only active players can surrender');
        }

        const winningPlayerId = session.players.find((player) => player.id !== participantId)?.id ?? null;
        void this.finishSession(session, 'surrender', winningPlayerId);
    }

    handleSocketDisconnect(socketId: string) {
        const participation = this.findParticipationFromSocketId(socketId);
        if (!participation) {
            /* socket was not connected to any game */
            return;
        }

        if (participation.session.state !== "in-game" || !participation.participation.deviceId) {
            this.removeParticipantFromSession(participation.session, participation.participationId, "disconnect")
            return;
        }

        participation.participation.connection = {
            status: "orphaned",
            timeout: setTimeout(() => {
                this.removeParticipantFromSession(participation.session, participation.participationId, "disconnect")
            }, 15_000)
        };

        this.emitSessionUpdated(participation.session);
    }

    placeCell(sessionId: string, participantId: string, x: number, y: number): void {
        const session = this.requireSession(sessionId);
        if (session.state !== 'in-game') {
            throw new SessionError('Game is not currently active');
        }

        if (!session.players.some((participant) => participant.id === participantId)) {
            throw new SessionError('You are not part of this session');
        }

        let moveResult;
        const timestamp = Date.now();
        const turnExpiresAt = session.boardState.currentTurnExpiresAt;
        try {
            this.timeControl.ensureTurnHasTimeRemaining(session, timestamp);
            moveResult = this.simulation.applyMove(session, {
                playerId: participantId,
                x,
                y,
                timestamp
            });
        } catch (error: unknown) {
            if (error instanceof SimulationError || error instanceof GameTimeControlError) {
                throw new SessionError(error.message);
            }

            throw error;
        }

        this.timeControl.handleMoveApplied(session, {
            playerId: participantId,
            timestamp,
            turnCompleted: moveResult.turnCompleted,
            turnExpiresAt
        });

        void this.gameHistoryRepository.appendMove(session.currentGameId, moveResult.move);

        if (moveResult.winningPlayerId) {
            this.emitGameState(session);
            void this.finishSession(session, 'six-in-a-row', moveResult.winningPlayerId);
            return;
        }

        this.timeControl.syncTurnTimeout(session, this.handleTurnExpired);
        this.emitGameState(session);
    }

    requestRematch(sessionId: string, participantId: string): RematchRequestResult {
        if (this.scheduledShutdown) {
            throw new SessionError('Server shutdown is scheduled. Rematches are unavailable.');
        }

        const session = this.requireSession(sessionId);
        if (session.state !== 'finished') {
            throw new SessionError('Rematch is not available for this match.');
        }

        if (!session.players.some((player) => player.id === participantId)) {
            throw new SessionError('Rematch is not available for this match.');
        }

        if (session.players.length !== MAX_PLAYERS_PER_SESSION) {
            throw new SessionError('Your opponent is no longer available for a rematch.');
        }

        if (!session.rematchAcceptedPlayerIds.includes(participantId)) {
            session.rematchAcceptedPlayerIds = [...session.rematchAcceptedPlayerIds, participantId];
        }
        this.emitSessionUpdated(session);

        return {
            status: session.rematchAcceptedPlayerIds.length === session.players.length ? 'ready' : 'pending',
            players: session.players.map(({ id }) => id)
        };
    }

    createRematchSession(finishedSessionId: string, spectatorIds: string[] = []): RematchSessionResult {
        this.assertNewGameCreationAllowed('rematch');

        const session = this.requireSession(finishedSessionId);
        if (session.state !== 'finished') {
            throw new SessionError('Rematch is not available for this match.');
        }

        if (session.rematchAcceptedPlayerIds.length < session.players.length) {
            throw new SessionError('Waiting for both players to request the rematch.');
        }

        const nextSession = createGameSession(finishedSessionId, session.gameOptions);
        nextSession.players = cloneStoredParticipants(session.players)
            .reverse()
            .map((participant) => ({
                ...participant,
                eloChange: null
            }));
        nextSession.spectators = cloneStoredParticipants(session.spectators)
            .filter((spectator) => spectatorIds.includes(spectator.id))
            .map((spectator) => ({
                ...spectator,
                eloChange: null
            }));

        this.sessions.delete(session.id);
        this.sessions.set(nextSession.id, nextSession);
        this.emitLobbyListUpdated();

        return {
            sessionId: nextSession.id,
            session: this.toSessionInfo(nextSession)
        };
    }

    cancelRematch(sessionId: string, participantId?: string): void {
        const session = this.sessions.get(sessionId);
        if (!session || session.state !== 'finished') {
            return;
        }

        if (participantId) {
            if (!session.rematchAcceptedPlayerIds.includes(participantId)) {
                return;
            }

            session.rematchAcceptedPlayerIds = [];
            this.emitSessionUpdated(session);
            return;
        }

        session.rematchAcceptedPlayerIds = [];
        this.emitSessionUpdated(session);
    }

    private readonly handleTurnExpired = (sessionId: string): void => {
        const session = this.sessions.get(sessionId);
        if (!session || session.state !== 'in-game' || session.players.length < MAX_PLAYERS_PER_SESSION) {
            this.timeControl.clearSession(sessionId);
            return;
        }

        const timedOutPlayerId = session.boardState.currentTurnPlayerId;
        if (!timedOutPlayerId) {
            this.timeControl.clearSession(sessionId);
            return;
        }

        const winningPlayerId = session.players.find((player) => player.id !== timedOutPlayerId)?.id ?? null;
        void this.finishSession(session, 'timeout', winningPlayerId);
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
            activeSessionCount: this.sessions.size
        }, 'Shutdown deadline reached; closing remaining sessions');

        for (const session of [...this.listStoredSessions()]) {
            void this.finishSession(session, 'terminated', null);
        }

        this.requestApplicationShutdown('deadline-reached');
    }

    private assertNewGameCreationAllowed(source: 'lobby' | 'rematch'): void {
        if (this.scheduledShutdown) {
            throw new SessionError(source === 'rematch'
                ? 'Server shutdown is scheduled. Rematches are unavailable.'
                : 'Server shutdown is scheduled. New games cannot be created.');
        }

        const maxConcurrentGames = this.serverSettingsService.getSettings().maxConcurrentGames;
        if (maxConcurrentGames === null) {
            return;
        }

        const currentConcurrentGames = this.getActiveSessionCounts().total;
        if (currentConcurrentGames < maxConcurrentGames) {
            return;
        }

        this.logger.warn({
            event: 'session.creation.blocked.concurrent-game-limit',
            source,
            currentConcurrentGames,
            maxConcurrentGames
        }, 'Blocked new game creation because the concurrent game limit was reached');

        throw new SessionError(
            `The server is currently at its concurrent game limit (${maxConcurrentGames}). Please wait for another game to finish before creating a new one.`
        );
    }

    private async reconcileLobbyState(session: ServerGameSession): Promise<void> {
        if (session.players.length === 0) {
            this.logger.info({
                event: 'session.terminated-empty',
                sessionId: session.id
            }, 'Removing empty session');
            this.timeControl.clearSession(session.id);
            this.sessions.delete(session.id);
            this.emitLobbyListUpdated();
            return;
        }

        if (session.state !== 'lobby' || session.players.length < MAX_PLAYERS_PER_SESSION) {
            return;
        }

        const startedAt = Date.now();
        const gameId = await this.ensureGameHistory(session);
        if (this.sessions.get(session.id) !== session || session.state !== 'lobby' || session.players.length < MAX_PLAYERS_PER_SESSION) {
            return;
        }

        session.currentGameId = gameId;
        session.state = 'in-game';
        session.startedAt = startedAt;
        session.finishReason = null;
        session.winningPlayerId = null;
        session.rematchAcceptedPlayerIds = [];
        session.gamePlayers = cloneStoredParticipants(session.players).map((participant) => ({
            ...participant,
            eloChange: null
        }));
        session.isRatedGame = this.isRatedGameEnabled(session);
        this.clearParticipantEloChanges(session.players);
        this.clearParticipantEloChanges(session.spectators);
        this.simulation.startSession(session);
        this.timeControl.startSession(session, this.handleTurnExpired, session.startedAt);

        this.emitGameState(session);
        this.emitLobbyListUpdated();
        this.emitSessionUpdated(session);
        this.logger.info({
            event: 'session.started',
            sessionId: session.id,
            players: session.players.map(({ id }) => id),
            startedAt: session.startedAt
        }, 'Session started');
    }

    private async finishSession(session: ServerGameSession, reason: SessionFinishReason, winningPlayerId: string | null): Promise<void> {
        if (session.state === 'finished') {
            return;
        }

        const finishedAt = Date.now();
        session.state = 'finished';
        this.timeControl.freezeActiveTurnState(session, finishedAt);
        session.boardState = cloneGameBoard(this.simulation.getPublicGameState(session).gameState);
        session.finishReason = reason;
        session.winningPlayerId = winningPlayerId;
        session.rematchAcceptedPlayerIds = [];

        const gameDurationMs = session.startedAt === null ? null : finishedAt - session.startedAt;
        const result: DatabaseGameResult = {
            winningPlayerId,
            durationMs: gameDurationMs,
            reason
        };

        void this.ensureGameHistory(session).then((gameId) => this.gameHistoryRepository.finishGame(gameId, result));

        this.metricsTracker.track('game-finished', {
            sessionId: session.id,
            reason,
            winningPlayerId,
            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id),
            boardState: session.boardState,
            createdAt: new Date(session.createdAt).toISOString(),
            startedAt: session.startedAt === null ? null : new Date(session.startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            gameDurationMs,
            totalLifetimeMs: finishedAt - session.createdAt
        });

        this.timeControl.clearSession(session.id);
        this.emitLobbyListUpdated();
        this.emitSessionUpdated(session);
        this.maybeShutdownAfterSessionFinished();
        await this.applyRatedGameResult(session, winningPlayerId);
        this.logger.info({
            event: 'session.finished',
            sessionId: session.id,
            reason,
            winningPlayerId,
            players: session.players.map(({ id }) => id),
            finishedAt
        }, 'Session finished');
    }

    private removeParticipantFromSession(
        session: ServerGameSession,
        participantId: string,
        source: PlayerLeaveSource
    ): void {
        if (session.players.some(player => player.id === participantId)) {
            this.removePlayerFromSession(session, participantId, source)
        } else if (session.spectators.some(spectator => spectator.id === participantId)) {
            this.removeSpectatorFromSession(session, participantId, source)
        }
    }


    private removePlayerFromSession(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        session.players = session.players.filter((player) => player.id !== participantId);

        this.metricsTracker.track('game-left', {
            sessionId: session.id,
            playerId: participantId,
            source,
            sessionState: session.state,
            remainingPlayers: session.players.map(({ id }) => id)
        });

        if (session.state === 'in-game') {
            const winningPlayerId = session.players[0]?.id ?? null;
            void this.finishSession(session, 'disconnect', winningPlayerId);
            return;
        }

        session.rematchAcceptedPlayerIds = [];
        const sessionInfo = this.toSessionInfo(session);
        const event: ParticipantLeftEvent = {
            sessionId: session.id,
            participantId,
            participantRole: 'player',
            session: sessionInfo
        };
        this.eventHandlers.participantLeft?.(event);

        if (session.players.length === 0 && session.spectators.length === 0) {
            this.sessions.delete(session.id);
        }

        this.emitLobbyListUpdated();
        if (this.sessions.has(session.id)) {
            this.emitSessionUpdated(session);
        }
        void this.reconcileLobbyState(session);
    }

    private removeSpectatorFromSession(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        session.spectators = session.spectators.filter((spectator) => spectator.id !== participantId);

        this.metricsTracker.track('spectator-left', {
            sessionId: session.id,
            spectatorId: participantId,
            source,
            sessionState: session.state,
            remainingSpectators: session.spectators.map(({ id }) => id)
        });

        const sessionInfo = this.toSessionInfo(session);
        const event: ParticipantLeftEvent = {
            sessionId: session.id,
            participantId,
            participantRole: 'spectator',
            session: sessionInfo
        };
        this.eventHandlers.participantLeft?.(event);

        if (session.players.length === 0 && session.spectators.length === 0) {
            this.sessions.delete(session.id);
            this.emitLobbyListUpdated();
            return;
        }

        this.emitSessionUpdated(session);
    }

    private emitLobbyListUpdated(): void {
        this.eventHandlers.lobbyListUpdated?.(this.listLobbyInfo());
    }

    private emitShutdownUpdated(): void {
        this.eventHandlers.shutdownUpdated?.(this.getShutdownState());
    }

    private emitSessionUpdated(session: ServerGameSession): void {
        const event: SessionUpdatedEvent = {
            sessionId: session.id,
            session: this.toSessionInfo(session)
        };
        this.eventHandlers.sessionUpdated?.(event);
    }

    private emitGameState(session: ServerGameSession): void {
        this.eventHandlers.gameStateUpdated?.(this.simulation.getPublicGameState(session));
    }

    private requireSession(sessionId: string): ServerGameSession {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new SessionError('Session not found');
        }

        return session;
    }

    findParticipationFromSocketId(socketId: string): {
        session: ServerGameSession,
        participation: ServerSessionParticipant,
        participationId: string,
        participationRole: SessionParticipantRole,
    } | null {
        for (const session of this.sessions.values()) {
            const player = session.players.find(player => player.connection.status === "connected" && player.connection.socketId === socketId);
            if (player) {
                return {
                    session,
                    participation: player,
                    participationRole: "player",
                    participationId: player.id
                };
            }

            const spectator = session.players.find(spectator => spectator.connection.status === "connected" && spectator.connection.socketId === socketId);
            if (spectator) {
                return {
                    session,
                    participation: spectator,
                    participationRole: "spectator",
                    participationId: spectator.id
                };
            }
        }

        return null;
    }



    private findOrphanedParticipation(deviceId: string): {
        session: ServerGameSession,
        participant: ServerSessionParticipant,
        participantRole: SessionParticipantRole,
        participantId: string
    } | null {
        for (const session of this.sessions.values()) {
            const player = session.players.find(player => player.connection.status === "orphaned" && player.deviceId === deviceId);
            if (player) {
                return {
                    session,
                    participant: player,
                    participantRole: "player",
                    participantId: player.id
                }
            }

            const spectator = session.spectators.find(spectator => spectator.connection.status === "orphaned" && spectator.deviceId === deviceId);
            if (spectator) {
                return {
                    session,
                    participant: spectator,
                    participantRole: "spectator",
                    participantId: spectator.id
                }
            }
        }

        return null;
    }

    transferConnection(oldSocketId: string, newSocketId: string): ClientGameParticipation | null {
        const info = this.findParticipationFromSocketId(oldSocketId);
        if (!info) {
            return null;
        }

        assert(info.participation.connection.status === "connected");
        assert(info.participation.connection.socketId === oldSocketId);
        info.participation.connection.socketId = newSocketId;

        this.logger.info({
            event: 'session.connection-transferred',
            sessionId: info.session.id,
            participantId: info.participationId,
            participantRole: info.participationRole,
            oldSocketId,
            newSocketId
        }, 'Transferred session connection to new socket');

        return {
            session: this.toSessionInfo(info.session),
            gameState: this.simulation.getPublicGameState(info.session),
            participantId: info.participationId
        }
    }

    reclaimSessionFromDeviceId(deviceId: string, socketId: string): ClientGameParticipation | null {
        const info = this.findOrphanedParticipation(deviceId);
        if (!info) {
            return null;
        }

        assert(info.participant.connection.status === "orphaned");
        clearTimeout(info.participant.connection.timeout);

        info.participant.connection = {
            status: "connected",
            socketId
        };

        this.logger.info({
            event: 'session.connection-reclaimed',
            sessionId: info.session.id,
            participantId: info.participantId,
            participantRole: info.participantRole,
            deviceId,
            socketId
        }, 'Reclaimed orphaned session connection from device');

        this.emitSessionUpdated(info.session);

        return {
            session: this.toSessionInfo(info.session),
            gameState: this.simulation.getPublicGameState(info.session),
            participantId: info.participantId
        }
    }

    private createSessionId(): string {
        let sessionId = Math.random().toString(36).substring(2, 8);
        while (this.sessions.has(sessionId)) {
            sessionId = Math.random().toString(36).substring(2, 8);
        }

        return sessionId;
    }

    private createParticipantId(session: ServerGameSession): string {
        let participantId = Math.random().toString(36).substring(2, 8);
        while (
            session.players.some((participant) => participant.id === participantId)
            || session.spectators.some((participant) => participant.id === participantId)
        ) {
            participantId = Math.random().toString(36).substring(2, 8);
        }

        return participantId;
    }

    private toSessionInfo(session: ServerGameSession): SessionInfo {
        const base = {
            id: session.id,
            players: cloneParticipants(session.players),
            spectators: cloneParticipants(session.spectators),
            gameOptions: cloneGameOptions(session.gameOptions),
        };

        switch (session.state) {
            case 'lobby':
                return {
                    ...base,
                    state: 'lobby'
                };

            case 'in-game':
                return {
                    ...base,
                    state: 'in-game',
                    startedAt: session.startedAt ?? session.createdAt,
                    gameId: session.currentGameId
                };

            case 'finished':
                return {
                    ...base,
                    state: 'finished',
                    gameId: session.currentGameId,
                    finishReason: session.finishReason ?? 'terminated',
                    winningPlayerId: session.winningPlayerId,
                    rematchAcceptedPlayerIds: [...session.rematchAcceptedPlayerIds]
                };
        }
    }

    private toLobbyInfo(session: ServerGameSession): LobbyInfo {
        return {
            id: session.id,
            playerNames: session.players.map((player) => player.displayName),
            players: session.players.map((player) => ({
                displayName: player.displayName,
                profileId: player.profileId,
                elo: player.elo
            })),
            timeControl: { ...session.gameOptions.timeControl },
            rated: session.gameOptions.rated,
            startedAt: session.state === 'in-game' ? (session.startedAt ?? session.createdAt) : null
        };
    }

    private async ensureGameHistory(session: ServerGameSession): Promise<string> {
        if (session.currentGameId) {
            return session.currentGameId;
        }

        const gameId = await this.gameHistoryRepository.createGame(
            session.id,
            this.buildDatabasePlayers(session),
            this.buildPlayerTiles(session),
            session.gameOptions
        );
        session.currentGameId = gameId;
        return gameId;
    }

    private buildDatabasePlayers(session: ServerGameSession) {
        const players = session.gamePlayers.length > 0 ? session.gamePlayers : session.players;
        return players.map((player, playerIndex) => ({
            playerId: player.id,
            displayName: player.displayName || `Player ${playerIndex + 1}`,
            profileId: player.profileId ?? player.id,
            elo: player.elo ?? null,
            eloChange: player.eloChange ?? null
        }));
    }

    private buildPlayerTiles(session: ServerGameSession): Record<string, PlayerTileConfig> {
        const players = session.gamePlayers.length > 0 ? session.gamePlayers : session.players;
        return buildPlayerTileConfigMap(players.map((player) => player.id));
    }

    private isRatedGameEnabled(session: ServerGameSession): boolean {
        const players = session.gamePlayers;
        if (!session.gameOptions.rated || players.length !== MAX_PLAYERS_PER_SESSION || players.some((player) => player.profileId === null)) {
            return false;
        }

        return new Set(players.map((player) => player.profileId)).size === MAX_PLAYERS_PER_SESSION;
    }

    private clearParticipantEloChanges(participants: ServerSessionParticipant[]): void {
        for (const participant of participants) {
            participant.eloChange = null;
        }
    }

    private async applyRatedGameResult(session: ServerGameSession, winningPlayerId: string | null): Promise<void> {
        if (!session.isRatedGame || !winningPlayerId) {
            return;
        }

        const ratedPlayers = session.gamePlayers.filter((player): player is ServerSessionParticipant & { profileId: string } => player.profileId !== null);
        if (ratedPlayers.length !== MAX_PLAYERS_PER_SESSION) {
            return;
        }

        const winner = ratedPlayers.find((player) => player.id === winningPlayerId);
        const loser = ratedPlayers.find((player) => player.id !== winningPlayerId);
        if (!winner || !loser) {
            return;
        }

        try {
            const updatedRatings = await this.eloHandler.applyRatedGameResult([
                { profileId: winner.profileId, score: 1 },
                { profileId: loser.profileId, score: 0 }
            ]);

            if (updatedRatings.size !== MAX_PLAYERS_PER_SESSION) {
                return;
            }

            this.applyUpdatedRatings(session.gamePlayers, updatedRatings);
            this.applyUpdatedRatings(session.players, updatedRatings);
            this.applyUpdatedRatings(session.spectators, updatedRatings);
            const gameId = await this.ensureGameHistory(session);
            await this.gameHistoryRepository.updatePlayerEloChanges(
                gameId,
                new Map(Array.from(updatedRatings.entries()).flatMap(([profileId, updatedRating]) => {
                    const gamePlayer = session.gamePlayers.find((player) => player.profileId === profileId);
                    return gamePlayer ? [[gamePlayer.id, updatedRating.eloChange] as const] : [];
                }))
            );
            this.emitSessionUpdated(session);
        } catch (error: unknown) {
            this.logger.error({
                err: error,
                event: 'session.elo-update.failed',
                sessionId: session.id,
                winningPlayerId
            }, 'Failed to apply rated game result');
        }
    }

    private applyUpdatedRatings(
        participants: ServerSessionParticipant[],
        updatedRatings: Map<string, { elo: number; eloChange: number }>
    ): void {
        for (const participant of participants) {
            if (!participant.profileId) {
                continue;
            }

            const updatedRating = updatedRatings.get(participant.profileId);
            if (!updatedRating) {
                continue;
            }

            participant.elo = updatedRating.elo;
            participant.eloChange = updatedRating.eloChange;
        }
    }

    private maybeShutdownAfterSessionFinished(): void {
        if (!this.scheduledShutdown || this.shutdownRequested || this.listStoredSessions().some((session) => session.state !== 'finished')) {
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

    private listStoredSessions(): ServerGameSession[] {
        return Array.from(this.sessions.values());
    }
}
