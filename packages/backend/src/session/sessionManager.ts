import type {
    PlayerTileConfig,
    CreateSessionResponse,
    LobbyInfo,
    SessionChatMessage,
    SessionFinishReason,
    SessionInfo,
    SessionParticipantRole,
} from '@ih3t/shared';
import { buildPlayerTileConfigMap } from '@ih3t/shared';
import assert from 'node:assert';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { ServerShutdownService, type ShutdownHook } from '../admin/serverShutdownService';
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
    PublicGameStatePayload,
    PlayerLeaveSource,
    RematchRequestResult,
    SessionManagerEventHandlers,
    SessionUpdatedEvent,
    ServerGameSession,
    ServerSessionParticipant,
    ClientGameParticipation,
    ServerParticipantConnection,
    ServerSessionParticipation,
} from './types';
import {
    cloneGameOptions,
    cloneParticipants,
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

export interface RematchCreateResult {
    rematchSession: ServerGameSession,
    socketMapping: Record<string, string>,
}

const MAX_PLAYERS_PER_SESSION = 2;
const MAX_SESSION_CHAT_MESSAGES = 100;

@injectable()
export class SessionManager {
    private eventHandlers: SessionManagerEventHandlers = {};
    private readonly logger: Logger;
    private readonly sessions = new Map<string, ServerGameSession>();
    private readonly shutdownHook: ShutdownHook;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(GameSimulation) private readonly simulation: GameSimulation,
        @inject(GameTimeControlManager) private readonly timeControl: GameTimeControlManager,
        @inject(EloHandler) private readonly eloHandler: EloHandler,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(MetricsTracker) private readonly metricsTracker: MetricsTracker,
        @inject(ServerSettingsService) private readonly serverSettingsService: ServerSettingsService
    ) {
        this.logger = rootLogger.child({ component: 'session-manager' });
        this.shutdownHook = this.serverShutdownService.createShutdownHook(
            () => this.shouldBlockShutdown()
        );
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
            moveCount: session.gameState.cells.length,
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            gameDurationMs: session.startedAt === null ? null : Math.max(0, now - session.startedAt),
            totalLifetimeMs: Math.max(0, now - session.createdAt),
            currentTurnPlayerId: session.gameState.currentTurnPlayerId,
            placementsRemaining: session.gameState.placementsRemaining
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

    setEventHandlers(eventHandlers: SessionManagerEventHandlers): void {
        this.eventHandlers = eventHandlers;
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

    async activateSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        await this.tickSession(session);
    }

    async joinSession(session: ServerGameSession, params: JoinSessionParams): Promise<ServerSessionParticipation> {
        if (session.state === 'finished') {
            throw new SessionError('Session has already finished');
        }

        const profileId = params.profile?.id ?? null;
        if (session.gameOptions.rated && !profileId) {
            throw new SessionError('Sign in with Discord to join rated games.');
        }

        /* 
         * Optimistically load the player ELO even only used in lobby state
         * but we do not want a state change while registering the player
         */
        const playerRating = profileId ? await this.eloHandler.getPlayerRating(profileId) : { eloScore: 0, gameCount: 0 };

        let participantRole: SessionParticipantRole;
        let participant: ServerSessionParticipant;
        switch (session.state) {
            case 'lobby':
                if (session.players.length >= MAX_PLAYERS_PER_SESSION) {
                    throw new SessionError('Session is full');
                }

                if (profileId && session.players.some((player) => player.profileId === profileId)) {
                    /* a player with that profile is already in the lobby */
                    if (session.gameOptions.rated) {
                        throw new SessionError('You cannot join your own rated lobby as the second player.');
                    } else if (!params.allowSelfJoinCasualGames) {
                        throw new SessionError('You cannot join your own casual lobby as the second player unless you enabled this in your account preferences.');
                    }
                }

                /* ensure unique display names */
                let displayName = params.displayName;
                {
                    const baseName = params.displayName;

                    let index = 2;
                    while (session.players.some((player) => player.displayName === displayName)) {
                        displayName = `${baseName} #${index}`;
                        index += 1;
                    }
                }

                participantRole = "player";
                session.players.push(participant = {
                    id: this.createParticipantId(session),

                    deviceId: params.deviceId,
                    profileId: params.profile?.id ?? null,
                    displayName,

                    rating: playerRating,
                    ratingAdjustment: null,
                    ratingAdjusted: null,

                    connection: { status: "disconnected", timestamp: Date.now() },
                });
                break;

            case 'in-game':
                participantRole = "spectator";
                session.spectators.push(participant = {
                    id: this.createParticipantId(session),

                    deviceId: params.deviceId,
                    profileId: params.profile?.id ?? null,
                    displayName: params.displayName,

                    rating: playerRating,
                    ratingAdjustment: null,
                    ratingAdjusted: null,

                    connection: { status: "disconnected", timestamp: Date.now() },
                });
                break;
        }

        this.metricsTracker.track('session-joined', {
            sessionId: session.id,

            participantId: participant.id,
            participantRole,

            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id),
        });

        const sessionInfo = this.toSessionInfo(session);
        this.eventHandlers.participantJoined?.({
            sessionId: session.id,
            participantId: participant.id,
            participantRole,
            session: sessionInfo
        });
        this.emitLobbyListUpdated();

        return {
            participant,
            role: participantRole
        };
    }

    leaveSession(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        if (session.players.some((participant) => participant.id === participantId)) {
            this.disconnectPlayerFromSession(session, participantId, source);
            return;
        }

        if (session.spectators.some((participant) => participant.id === participantId)) {
            this.disconnectSpectatorFromSession(session, participantId, source);
            return;
        }
    }

    surrenderSession(session: ServerGameSession, participantId: string): void {
        if (session.state !== 'in-game') {
            throw new SessionError('Game is not currently active');
        }

        if (!session.players.some((participant) => participant.id === participantId)) {
            throw new SessionError('Only active players can surrender');
        }

        const winningPlayerId = session.players.find((player) => player.id !== participantId)?.id ?? null;
        void this.finishSession(session, 'surrender', winningPlayerId);
    }

    placeCell(session: ServerGameSession, playerId: string, x: number, y: number): void {
        if (session.state !== 'in-game') {
            throw new SessionError('Game is not currently active');
        }

        if (!session.players.some((participant) => participant.id === playerId)) {
            throw new SessionError('You are not part of this session');
        }

        let moveResult;
        const timestamp = Date.now();
        const turnExpiresAt = session.gameState.currentTurnExpiresAt;
        try {
            this.timeControl.ensureTurnHasTimeRemaining(session, timestamp);
            moveResult = this.simulation.applyMove(session.gameState, {
                playerId,
                x,
                y,
            });
        } catch (error: unknown) {
            if (error instanceof SimulationError || error instanceof GameTimeControlError) {
                throw new SessionError(error.message);
            }

            throw error;
        }

        this.timeControl.handleMoveApplied(session, {
            playerId: playerId,
            timestamp,
            turnCompleted: moveResult.turnCompleted,
            turnExpiresAt
        });

        void this.gameHistoryRepository.appendMove(session.gameId, {
            moveNumber: session.gameState.cells.length + 1,
            playerId,
            x,
            y,
            timestamp
        });

        if (session.gameState.winner) {
            this.emitGameState(session);
            void this.finishSession(session, 'six-in-a-row', session.gameState.winner.playerId);
            return;
        }

        this.timeControl.syncTurnTimeout(session, this.handleTurnExpired);
        this.emitGameState(session);
    }

    sendChatMessage(session: ServerGameSession, participantId: string, message: string): SessionChatMessage {
        if (session.state === 'lobby') {
            throw new SessionError('Chat is only available once the match has started.');
        }

        const participant = session.players.find((player) => player.id === participantId);
        if (!participant) {
            throw new SessionError('Only active match players can chat.');
        }

        const chatMessage: SessionChatMessage = {
            id: Math.random().toString(36).slice(2, 10),
            participantId,
            participantDisplayName: participant.displayName,
            message,
            sentAt: Date.now()
        };

        session.chatMessages = [...session.chatMessages, chatMessage].slice(-MAX_SESSION_CHAT_MESSAGES);
        this.emitSessionUpdated(session);
        return chatMessage;
    }

    requestRematch(session: ServerGameSession, participantId: string): RematchRequestResult {
        if (this.serverShutdownService.isShutdownPending()) {
            throw new SessionError('Server shutdown pending. Rematches are unavailable.');
        }

        if (session.state !== 'finished') {
            throw new SessionError('Rematch is not available for this match.');
        }

        if (!session.players.some((player) => player.id === participantId)) {
            throw new SessionError('Rematch is not available for this match.');
        }

        const connectedPlayers = session.players.filter(player => player.connection.status === "connected");
        if (connectedPlayers.length !== MAX_PLAYERS_PER_SESSION) {
            throw new SessionError('Your opponent is no longer available for a rematch.');
        }

        if (!session.rematchAcceptedPlayerIds.includes(participantId)) {
            session.rematchAcceptedPlayerIds = [...session.rematchAcceptedPlayerIds, participantId];
        }
        this.emitSessionUpdated(session);

        return {
            status: session.rematchAcceptedPlayerIds.length === session.players.length ? 'ready' : 'pending',
            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id)
        };
    }

    createRematchSession(sessionId: string): RematchCreateResult {
        this.assertNewGameCreationAllowed('rematch');

        const originalSession = this.requireSession(sessionId);
        if (originalSession.state !== 'finished') {
            throw new SessionError('Rematch is not available for this match.');
        }

        if (originalSession.rematchAcceptedPlayerIds.length < originalSession.players.length) {
            throw new SessionError('Waiting for both players to request the rematch.');
        }

        const participantMapping: Record<string, string> = {};
        const rematchSession = createGameSession(sessionId, originalSession.gameOptions);

        rematchSession.players = originalSession.players.map(player => {
            const newParticipantId = this.createParticipantId(rematchSession);
            participantMapping[player.id] = newParticipantId;

            return {
                id: newParticipantId,
                deviceId: player.deviceId,

                connection: { status: "disconnected", timestamp: Date.now() },
                displayName: player.displayName,

                rating: player.ratingAdjusted ?? player.rating,
                ratingAdjustment: null,
                ratingAdjusted: null,

                profileId: player.profileId,
            };
        })
        rematchSession.players.reverse()

        rematchSession.spectators = originalSession.spectators.map(player => {
            const newParticipantId = this.createParticipantId(rematchSession);
            participantMapping[player.id] = newParticipantId;

            return {
                id: newParticipantId,
                deviceId: player.deviceId,

                connection: { status: "disconnected", timestamp: Date.now() },
                displayName: player.displayName,

                rating: player.ratingAdjusted ?? player.rating,
                ratingAdjustment: null,
                ratingAdjusted: null,

                profileId: player.profileId,
            }
        });

        rematchSession.chatMessages = originalSession.chatMessages.map(message => ({
            ...message,
            participantId: participantMapping[message.participantId]
        }));

        const socketMapping: Record<string, string> = {};
        for (const { participant } of this.getAllParticipations(originalSession)) {
            if (participant.connection.status === "connected") {
                socketMapping[participantMapping[participant.id]] = participant.connection.socketId;
            }

            if (participant.connection.status !== "disconnected") {
                /* mark all clients as disconnected in the old session */
                this.updateParticipantConnection(participant, { status: "disconnected", timestamp: Date.now() });
            }
        }

        this.sessions.delete(originalSession.id);
        this.sessions.set(rematchSession.id, rematchSession);
        this.emitLobbyListUpdated();

        void this.tickSession(rematchSession);

        return {
            rematchSession,
            socketMapping: socketMapping
        }
    }

    cancelRematch(session: ServerGameSession, participantId?: string): void {
        if (session.state !== 'finished') {
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

        const timedOutPlayerId = session.gameState.currentTurnPlayerId;
        if (!timedOutPlayerId) {
            this.timeControl.clearSession(sessionId);
            return;
        }

        const winningPlayerId = session.players.find((player) => player.id !== timedOutPlayerId)?.id ?? null;
        void this.finishSession(session, 'timeout', winningPlayerId);
    };

    private assertNewGameCreationAllowed(source: 'lobby' | 'rematch'): void {
        if (this.serverShutdownService.isShutdownPending()) {
            throw new SessionError(source === 'rematch'
                ? 'Server restart pending. Rematches are unavailable.'
                : 'Server restart pending. New games cannot be created.');
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

    async tickAllSessions(): Promise<void> {
        await Promise.allSettled(
            [...this.sessions.values()].map(session => this.tickSession(session))
        );
    }

    private async tickSession(session: ServerGameSession) {
        const connectedPlayers = session.players.filter(spectator => spectator.connection.status !== "disconnected");
        const connectedSpectators = session.spectators.filter(spectator => spectator.connection.status !== "disconnected");
        const sessionAge = Date.now() - session.createdAt;
        if (connectedPlayers.length === 0 && connectedSpectators.length === 0 && sessionAge >= 5_000) {
            this.logger.info(
                {
                    event: 'session.terminated-empty',
                    sessionId: session.id,
                    sessionAge,
                    state: session.state
                },
                'Removing empty session'
            );
            this.timeControl.clearSession(session.id);
            this.sessions.delete(session.id);
            this.emitLobbyListUpdated();
            this.shutdownHook.tryShutdown();
            return;
        }

        switch (session.state) {
            case 'lobby': {
                /* time out players which could not connect within a certain given time */
                let playersUpdated = false
                session.players = session.players.filter(player => {
                    if (player.connection.status !== "disconnected") {
                        return true
                    }

                    if (Date.now() - player.connection.timestamp < 5_000) {
                        return true
                    }

                    playersUpdated = true
                    return false
                })

                if (playersUpdated) {
                    this.emitLobbyListUpdated()
                    this.emitSessionUpdated(session)
                }

                if (connectedPlayers.length < MAX_PLAYERS_PER_SESSION) {
                    /* lobby not yet full / not all people are connected */
                    break;
                }

                /* start game */
                const startedAt = Date.now();
                const gameId = await this.ensureGameHistory(session);
                if (this.sessions.get(session.id) !== session || session.state !== 'lobby' || session.players.length < MAX_PLAYERS_PER_SESSION) {
                    return;
                }

                session.gameId = gameId;
                session.state = 'in-game';
                session.startedAt = startedAt;
                session.finishReason = null;
                session.winningPlayerId = null;
                session.rematchAcceptedPlayerIds = [];
                session.isRatedGame = this.isRatedGameEnabled(session);

                for (const player of session.players) {
                    player.ratingAdjustment = null;
                    player.ratingAdjusted = null;
                }

                if (session.isRatedGame) {
                    this.calculateRatingAdjustments(session);
                }

                this.simulation.startSession(session.gameState, session.players.map((player) => player.id));
                this.timeControl.startSession(session, this.handleTurnExpired, session.startedAt);

                this.emitGameState(session);
                this.emitLobbyListUpdated();
                this.emitSessionUpdated(session);
                this.logger.info(
                    {
                        event: 'session.started',
                        sessionId: session.id,
                        players: session.players.map(({ id }) => id),
                        startedAt: session.startedAt
                    },
                    'Session started'
                );
                break;
            }

            case 'in-game': {
                if (connectedPlayers.length <= 1) {
                    /* Only one player left. Make him the winner. */
                    const [winningPlayer] = connectedPlayers;
                    await this.finishSession(session, 'disconnect', winningPlayer?.id ?? null);
                    break;
                }

                break;
            }

            case 'finished':
                /* nothing to do */
                break;
        }
    }

    private async finishSession(session: ServerGameSession, reason: SessionFinishReason, winningPlayerId: string | null): Promise<void> {
        if (session.state === 'finished') {
            return;
        }

        const finishedAt = Date.now();
        session.state = 'finished';

        this.timeControl.freezeActiveTurnState(session, finishedAt);
        session.gameState = this.simulation.getPublicGameState(session.gameState);
        session.finishReason = reason;
        session.winningPlayerId = winningPlayerId;
        session.rematchAcceptedPlayerIds = [];

        /* mark all participants as disconnected if they're orphaned */
        for (const { participant } of this.getAllParticipations(session)) {
            if (participant.connection.status !== "orphaned") {
                continue
            }

            this.updateParticipantConnection(participant, { status: "disconnected", timestamp: Date.now() });
        }

        await this.applyRatingAdjustments(session, winningPlayerId);

        const gameDurationMs = session.startedAt === null ? null : finishedAt - session.startedAt;
        void this.ensureGameHistory(session).then((gameId) => this.gameHistoryRepository.finishGame(gameId, {
            winningPlayerId,
            durationMs: gameDurationMs,
            reason
        }));

        this.metricsTracker.track('game-finished', {
            sessionId: session.id,
            reason,
            winningPlayerId,
            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id),
            boardState: session.gameState,
            createdAt: new Date(session.createdAt).toISOString(),
            startedAt: session.startedAt === null ? null : new Date(session.startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            gameDurationMs,
            totalLifetimeMs: finishedAt - session.createdAt
        });

        this.timeControl.clearSession(session.id);
        this.emitLobbyListUpdated();
        this.emitSessionUpdated(session);
        this.shutdownHook.tryShutdown();

        this.logger.info(
            {
                event: 'session.finished',
                sessionId: session.id,
                reason,
                winningPlayerId,
                players: session.players.map(({ id }) => id),
                finishedAt
            },
            'Session finished'
        );
    }

    private updateParticipantConnection(participant: ServerSessionParticipant, connection: ServerParticipantConnection) {
        switch (participant.connection.status) {
            case 'connected':
            case 'disconnected':
                /* no cleanup needed */
                break;

            case 'orphaned':
                /* clear pending timeout */
                clearTimeout(participant.connection.timeout);
                break;
        }

        participant.connection = connection;
    }

    private disconnectPlayerFromSession(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        const index = session.players.findIndex(player => player.id === participantId);
        if (index === -1) {
            return;
        }

        const player = session.players[index];
        this.updateParticipantConnection(player, { status: 'disconnected', timestamp: Date.now() });

        if (session.state === 'lobby') {
            /* players can just leave and are removed from the session */
            session.players.splice(index, 1);
        }

        const remainingPlayerIds = session.players
            .filter(player => player.connection.status !== "disconnected")
            .map(({ id }) => id);

        this.metricsTracker.track('game-left', {
            sessionId: session.id,
            playerId: participantId,
            source,
            sessionState: session.state,
            remainingPlayerIds
        });

        session.rematchAcceptedPlayerIds = [];
        this.eventHandlers.participantLeft?.({
            sessionId: session.id,
            participantId,
            participantRole: 'player',
            session: this.toSessionInfo(session)
        });

        this.emitLobbyListUpdated();
        void this.tickSession(session);
    }

    private disconnectSpectatorFromSession(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        /* spectators are always removed from the session */
        const index = session.spectators.findIndex(spectator => spectator.id === participantId);
        if (index === -1) {
            return;
        }

        const [spectator] = session.spectators.splice(index, 1);
        this.updateParticipantConnection(spectator, { status: "disconnected", timestamp: Date.now() });

        this.metricsTracker.track('spectator-left', {
            sessionId: session.id,
            spectatorId: participantId,
            source,
            sessionState: session.state,
            remainingSpectators: session.spectators.map(({ id }) => id)
        });

        this.eventHandlers.participantLeft?.({
            sessionId: session.id,
            participantId,
            participantRole: 'spectator',
            session: this.toSessionInfo(session)
        });

        void this.tickSession(session);
    }

    assignParticipantSocket(session: ServerGameSession, participantId: string, socketId: string): ClientGameParticipation {
        const participation = this.getParticipation(session, participantId);
        if (!participation) {
            throw new SessionError("Invalid participant id");
        }

        this.updateParticipantConnection(participation.participant, { status: 'connected', socketId });
        void this.tickSession(session);

        return {
            session: this.toSessionInfo(session),
            gameState: this.getPublicGameStatePayload(session),

            participantId,
            participantRole: participation.role
        }
    }

    handleSocketDisconnect(socketId: string) {
        const participation = this.findParticipationFromSocketId(socketId);
        if (!participation) {
            /* socket was not connected to any game */
            return;
        }

        const shouldOrphanConnection = participation.role === "player" && participation.session.state === "in-game";
        if (shouldOrphanConnection) {
            this.updateParticipantConnection(
                participation.participant,
                {
                    status: "orphaned",
                    timeout: setTimeout(
                        () => {
                            this.leaveSession(
                                participation.session,
                                participation.participant.id,
                                "disconnect"
                            )
                        },
                        15_000
                    )
                }
            );
        } else {
            this.leaveSession(
                participation.session,
                participation.participant.id,
                "disconnect"
            );
        }

        this.emitSessionUpdated(participation.session);
        void this.tickSession(participation.session);
    }

    private emitLobbyListUpdated(): void {
        this.eventHandlers.lobbyListUpdated?.(this.listLobbyInfo());
    }

    private emitSessionUpdated(session: ServerGameSession): void {
        const event: SessionUpdatedEvent = {
            sessionId: session.id,
            session: this.toSessionInfo(session)
        };
        this.eventHandlers.sessionUpdated?.(event);
    }

    private emitGameState(session: ServerGameSession): void {
        this.eventHandlers.gameStateUpdated?.(this.getPublicGameStatePayload(session));
    }

    private getPublicGameStatePayload(session: ServerGameSession): PublicGameStatePayload {
        return {
            sessionId: session.id,
            gameId: session.gameId,
            gameState: this.simulation.getPublicGameState(session.gameState)
        };
    }

    getSession(sessionId: string): ServerGameSession | null {
        return this.sessions.get(sessionId) ?? null
    }

    requireSession(sessionId: string): ServerGameSession {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new SessionError('Session not found');
        }

        return session;
    }

    getParticipation(session: ServerGameSession, participantId: string): ServerSessionParticipation | null {
        for (const player of session.players) {
            if (player.id !== participantId) {
                continue
            }

            return {
                participant: player,
                role: "player"
            }
        }

        for (const spectator of session.spectators) {
            if (spectator.id !== participantId) {
                continue
            }

            return {
                participant: spectator,
                role: "spectator"
            }
        }

        return null
    }

    getAllParticipations(session: ServerGameSession): ServerSessionParticipation[] {
        return [
            ...session.players.map(player => ({
                participant: player,
                role: "player"
            } satisfies ServerSessionParticipation)),

            ...session.spectators.map(player => ({
                participant: player,
                role: "spectator"
            } satisfies ServerSessionParticipation))
        ];
    }

    findParticipationFromSocketId(socketId: string): { session: ServerGameSession } & ServerSessionParticipation | null {
        for (const session of this.sessions.values()) {
            const participation = this.getAllParticipations(session).find(
                ({ participant: participation }) => participation.connection.status === "connected" && participation.connection.socketId === socketId
            );
            if (!participation) {
                continue;
            }

            return {
                session: session,
                ...participation,
            }
        }

        return null;
    }


    private findOrphanedParticipation(deviceId: string): { session: ServerGameSession } & ServerSessionParticipation | null {
        for (const session of this.sessions.values()) {
            const participation = this.getAllParticipations(session).find(
                ({ participant: participation }) => participation.connection.status === "orphaned" && participation.deviceId === deviceId
            );
            if (!participation) {
                continue;
            }

            return {
                session: session,
                ...participation,
            }
        }

        return null;
    }

    participantTransferConnection(oldSocketId: string, newSocketId: string): ClientGameParticipation | null {
        const info = this.findParticipationFromSocketId(oldSocketId);
        if (!info) {
            return null;
        }

        assert(info.participant.connection.status === "connected");
        assert(info.participant.connection.socketId === oldSocketId);
        info.participant.connection.socketId = newSocketId;

        this.logger.info({
            event: 'session.connection-transferred',
            sessionId: info.session.id,
            participantId: info.participant.id,
            participantRole: info.role,
            oldSocketId,
            newSocketId
        }, 'Transferred session connection to new socket');

        return {
            session: this.toSessionInfo(info.session),
            gameState: this.getPublicGameStatePayload(info.session),

            participantId: info.participant.id,
            participantRole: info.role,
        }
    }

    participantReclaimSessionFromDeviceId(deviceId: string, socketId: string): ClientGameParticipation | null {
        const info = this.findOrphanedParticipation(deviceId);
        if (!info) {
            return null;
        }

        this.updateParticipantConnection(info.participant, {
            status: "connected",
            socketId
        });

        this.logger.info({
            event: 'session.connection-reclaimed',
            sessionId: info.session.id,
            participantId: info.participant.id,
            participantRole: info.role,
            deviceId,
            socketId
        }, 'Reclaimed orphaned session connection from device id');

        this.emitSessionUpdated(info.session);

        return {
            session: this.toSessionInfo(info.session),
            gameState: this.getPublicGameStatePayload(info.session),

            participantId: info.participant.id,
            participantRole: info.role
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
            chatMessages: session.chatMessages.map((chatMessage) => ({ ...chatMessage }))
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
                    gameId: session.gameId
                };

            case 'finished':
                return {
                    ...base,
                    state: 'finished',
                    gameId: session.gameId,
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
                elo: player.rating?.eloScore ?? null
            })),
            timeControl: { ...session.gameOptions.timeControl },
            rated: session.gameOptions.rated,
            startedAt: session.state === 'in-game' ? (session.startedAt ?? session.createdAt) : null
        };
    }

    private async ensureGameHistory(session: ServerGameSession): Promise<string> {
        if (session.gameId) {
            return session.gameId;
        }

        const gameId = await this.gameHistoryRepository.createGame(
            session.id,
            this.buildDatabasePlayers(session),
            this.buildPlayerTiles(session),
            session.gameOptions
        );
        session.gameId = gameId;
        return gameId;
    }

    private buildDatabasePlayers(session: ServerGameSession) {
        return session.players.map((player, playerIndex) => ({
            playerId: player.id,
            displayName: player.displayName || `Player ${playerIndex + 1}`,
            profileId: player.profileId ?? player.id,
            elo: player.rating?.eloScore ?? null,
            eloChange: null
        }));
    }

    private buildPlayerTiles(session: ServerGameSession): Record<string, PlayerTileConfig> {
        return buildPlayerTileConfigMap(session.players.map((player) => player.id));
    }

    private isRatedGameEnabled(session: ServerGameSession): boolean {
        if (!session.gameOptions.rated) {
            /* not planned to be a rated game */
            return false;
        }

        if (session.players.some(player => !player.profileId)) {
            /* session contains guests */
            return false;
        }

        const uniqueProfileIds = new Set(session.players.map(player => player.profileId));
        if (uniqueProfileIds.size !== session.players.length) {
            /* At least one user joined twice. No ELO game possible */
            return false;
        }

        return true;
    }

    private async applyRatingAdjustments(session: ServerGameSession, winningPlayerId: string | null): Promise<void> {
        if (!session.isRatedGame || !winningPlayerId) {
            return;
        }

        try {
            const eloAdjustments = new Map<string, number>();
            for (const player of session.players) {
                if (!player.profileId || !player.ratingAdjustment) {
                    continue
                }

                if (player.ratingAdjusted) {
                    /* rating has already been adjusted */
                    continue
                }

                const adjustment = player.ratingAdjustment;
                player.ratingAdjusted = await this.eloHandler.applyGameResult(
                    player.profileId,
                    adjustment,
                    player.id === winningPlayerId ? "win" : "loss"
                );

                const eloAdjustment = player.id === winningPlayerId ? adjustment.eloGain : adjustment.eloLoss;
                eloAdjustments.set(player.profileId, eloAdjustment)
            }

            const gameId = await this.ensureGameHistory(session);
            await this.gameHistoryRepository.updatePlayerEloChanges(
                gameId,
                eloAdjustments
            );

            this.emitSessionUpdated(session);
        } catch (error: unknown) {
            this.logger.error(
                {
                    err: error,
                    event: 'session.elo-update.failed',
                    sessionId: session.id,
                    winningPlayerId
                },
                'Failed to apply rated game result'
            );
        }
    }

    private calculateRatingAdjustments(session: ServerGameSession) {
        const ratedPlayers = session.players.filter(
            (player): player is ServerSessionParticipant & { profileId: string } => player.profileId !== null
        );
        if (ratedPlayers.length !== 2) {
            return false;
        }

        const [playerOne, playerTwo] = ratedPlayers;

        playerOne.ratingAdjustment = this.eloHandler.calculateEloAdjustments(playerOne.rating, playerTwo.rating);
        playerTwo.ratingAdjustment = this.eloHandler.calculateEloAdjustments(playerTwo.rating, playerOne.rating);
    }

    private listStoredSessions(): ServerGameSession[] {
        return Array.from(this.sessions.values());
    }

    private shouldBlockShutdown(): boolean {
        return this.listStoredSessions().some(session => session.state === 'in-game');
    }
}
