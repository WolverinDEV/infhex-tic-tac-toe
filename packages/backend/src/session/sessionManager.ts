import assert from 'node:assert';

import type {
    AccountBot,
    BoardCell,
    CreateSessionResponse,
    GameState,
    LobbyInfo,
    PlayerRating,
    PlayerTileConfig,
    SessionChatMessage,
    SessionChatMessageId,
    SessionChatSenderId,
    SessionFinishReason,
    SessionInfo,
    SessionParticipantRole,
    SessionState,
} from '@ih3t/shared';
import { buildPlayerTileConfigMap } from '@ih3t/shared';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';

import { ServerSettingsService } from '../admin/serverSettingsService';
import { ServerShutdownService, type ShutdownHook } from '../admin/serverShutdownService';
import { AccountBotService } from '../bots/accountBotService';
import { EloHandler } from '../elo/eloHandler';
import { ROOT_LOGGER } from '../logger';
import { MetricsTracker } from '../metrics/metricsTracker';
import {
    GameHistoryRepository,
} from '../persistence/gameHistoryRepository';
import { GameSimulation, SimulationError } from '../simulation/gameSimulation';
import { GameTimeControlError, GameTimeControlManager } from '../simulation/gameTimeControlManager';
import type {
    ClientGameParticipation,
    CreateSessionParams,
    JoinSessionParams,
    PlayerLeaveSource,
    RematchRequestResult,
    ServerGameSession,
    ServerParticipantConnection,
    ServerSessionParticipant,
    ServerSessionParticipation,
    SessionManagerEventHandlers,
} from './types';
import {
    cloneChatMessage,
    cloneGameOptions,
    cloneParticipants,
    createGameSession,
} from './types';

export class SessionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = `SessionError`;
    }
}

export type TerminalSessionStatus = {
    sessionId: string;
    state: `lobby` | `in-game` | `finished`;
    playerCount: number;
    spectatorCount: number;
    moveCount: number;
    createdAt: number;
    startedAt: number | null;
    gameDurationMs: number | null;
    totalLifetimeMs: number;
    currentTurnPlayerId: string | null;
    placementsRemaining: number;
};

export type ActiveSessionCounts = {
    total: number;
    public: number;
    private: number;
};

export type RematchCreateResult = {
    rematchSession: ServerGameSession,
    socketMapping: Record<string, string>,
};

const MAX_PLAYERS_PER_SESSION = 2;
const MAX_SESSION_CHAT_MESSAGES = 100;

@injectable()
export class SessionManager {
    private eventHandlers: SessionManagerEventHandlers = {};
    private readonly logger: Logger;
    private readonly sessions = new Map<string, ServerGameSession>();
    private readonly activeBotTurns = new Set<string>();
    private readonly shutdownHook: ShutdownHook;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(GameSimulation) private readonly simulation: GameSimulation,
        @inject(GameTimeControlManager) private readonly timeControl: GameTimeControlManager,
        @inject(EloHandler) private readonly eloHandler: EloHandler,
        @inject(AccountBotService) private readonly accountBotService: AccountBotService,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(MetricsTracker) private readonly metricsTracker: MetricsTracker,
        @inject(ServerSettingsService) private readonly serverSettingsService: ServerSettingsService,
    ) {
        this.logger = rootLogger.child({ component: `session-manager` });
        this.shutdownHook = this.serverShutdownService.createShutdownHook(() => this.shouldBlockShutdown());
    }

    listLobbyInfo(): LobbyInfo[] {
        return this.listStoredSessions()
            .filter((session) => {
                if (session.state === `finished`) {
                    return false;
                }

                return session.state !== `lobby` || session.gameOptions.visibility === `public`;
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
            throw new SessionError(`Session not found.`);
        }

        return session.lock.runExclusive(async () => {
            if (session.state === `lobby`) {
                throw new SessionError(`Only in-progress games can be terminated.`);
            }

            if (session.state === `finished`) {
                throw new SessionError(`Session has already finished.`);
            }

            await this.finishSessionLocked(session, `terminated`, null);
            return this.toSessionInfo(session);
        });
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
            placementsRemaining: session.gameState.placementsRemaining,
        }));
    }

    getActiveSessionCounts(): ActiveSessionCounts {
        const counts: ActiveSessionCounts = {
            total: 0,
            public: 0,
            private: 0,
        };

        for (const session of this.listStoredSessions()) {
            if (session.state === `finished`) {
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
        this.assertNewGameCreationAllowed(`lobby`);

        if (params.lobbyOptions.rated && params.bots && params.bots.length > 0) {
            throw new SessionError(`Bots can only be used in casual games.`);
        }

        const sessionId = this.createSessionId();
        const session = createGameSession(sessionId, params.lobbyOptions);

        if (params.bots?.length) {
            session.players = params.bots.map((bot) => this.createBotParticipant(session, bot));
            session.hadPlayers = session.players.length > 0;
        }

        this.sessions.set(session.id, session);

        /*
         * Do not send an update yet. 
         * An update will ether be send once a player joined that lobby anyways.
         * This reduces the total update count.
         * this.emitLobbyListUpdated();
         */

        this.logger.info({
            event: `session.created`,
            sessionId: session.id,
            visibility: session.gameOptions.visibility,
            createdAt: session.createdAt,
            client: params.client,
        }, `Session created`);

        this.metricsTracker.track(`game-created`, {
            sessionId,
            createdAt: new Date(session.createdAt).toISOString(),
            client: params.client,
        });

        if (session.players.length > 0) {
            this.emitLobbyUpdated(session);
            void this.tickSession(session);
        }

        return { sessionId };
    }

    async joinSession(session: ServerGameSession, params: JoinSessionParams): Promise<ServerSessionParticipation> {
        const playerRating = params.profile ? await this.eloHandler.getPlayerRating(params.profile.id) : { eloScore: 0, gameCount: 0 };
        return session.lock.runExclusive(() => this.joinSessionLocked(session, params, playerRating));
    }

    private async joinSessionLocked(session: ServerGameSession, params: JoinSessionParams, playerRating: PlayerRating): Promise<ServerSessionParticipation> {
        if (this.sessions.get(session.id) !== session) {
            /* session no longer exists */
            throw new SessionError(`Session no longer exists`);
        }

        const profileId = params.profile?.id ?? null;
        if (session.gameOptions.rated && !profileId) {
            throw new SessionError(`Sign in with Discord to join rated games.`);
        }


        let participantRole: SessionParticipantRole;
        let participant: ServerSessionParticipant;
        switch (session.state) {
            case `lobby`: {

                if (session.players.length >= MAX_PLAYERS_PER_SESSION) {
                    throw new SessionError(`Session is full`);
                }

                if (profileId && session.players.some((player) => player.profileId === profileId)) {
                /* a player with that profile is already in the lobby */
                    if (session.gameOptions.rated) {
                        throw new SessionError(`You cannot join your own rated lobby as the second player.`);
                    } else if (!params.allowSelfJoinCasualGames) {
                        throw new SessionError(`You cannot join your own casual lobby as the second player unless you enabled this in your account preferences.`);
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

                participantRole = `player`;
                session.players.push(participant = {
                    id: this.createParticipantId(session),

                    deviceId: params.deviceId,
                    profileId: params.profile?.id ?? null,
                    displayName,
                    isBot: false,
                    botId: null,
                    botOwnerProfileId: null,

                    rating: playerRating,
                    ratingAdjustment: null,
                    ratingAdjusted: null,

                    connection: { status: `disconnected`, timestamp: Date.now() },
                });
                session.hadPlayers = true;
                break;
            }

            case `in-game`:
            case `finished`:
                participantRole = `spectator`;
                session.spectators.push(participant = {
                    id: this.createParticipantId(session),

                    deviceId: params.deviceId,
                    profileId: params.profile?.id ?? null,
                    displayName: params.displayName,
                    isBot: false,
                    botId: null,
                    botOwnerProfileId: null,

                    rating: playerRating,
                    ratingAdjustment: null,
                    ratingAdjusted: null,

                    connection: { status: `disconnected`, timestamp: Date.now() },
                });
                break;
        }

        this.metricsTracker.track(`session-joined`, {
            sessionId: session.id,

            participantId: participant.id,
            participantRole,

            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id),
        });

        this.emitSessionUpdated(
            session,
            [participantRole === `player` ? `players` : `spectators`],
        );
        this.emitLobbyUpdated(session);

        return {
            participant,
            role: participantRole,
        };
    }

    async leaveSession(session: ServerGameSession, participantId: string, source: PlayerLeaveSource) {
        await session.lock.runExclusive(() => this.leaveSessionLocked(session, participantId, source));
    }

    private leaveSessionLocked(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        if (session.players.some((participant) => participant.id === participantId)) {
            this.disconnectPlayerFromSessionLocked(session, participantId, source);
            return;
        }

        if (session.spectators.some((participant) => participant.id === participantId)) {
            this.disconnectSpectatorFromSessionLocked(session, participantId, source);
            return;
        }
    }

    async surrenderSession(session: ServerGameSession, participantId: string) {
        await session.lock.runExclusive(async () => {
            if (session.state !== `in-game`) {
                throw new SessionError(`Game is not currently active`);
            }

            if (!session.players.some((participant) => participant.id === participantId)) {
                throw new SessionError(`Only active players can surrender`);
            }

            const winningPlayerId = session.players.find((player) => player.id !== participantId)?.id ?? null;
            await this.finishSessionLocked(session, `surrender`, winningPlayerId);
        });
    }


    async placeCell(session: ServerGameSession, playerId: string, x: number, y: number) {
        await session.lock.runExclusive(async () => await this.placeCellLocked(session, playerId, x, y));
        this.triggerBotTurnIfNeeded(session.id);
    }

    private async placeCellLocked(session: ServerGameSession, playerId: string, x: number, y: number) {
        assert(session.lock.isLocked());

        if (session.state !== `in-game`) {
            throw new SessionError(`Game is not currently active`);
        }

        if (!session.players.some((participant) => participant.id === playerId)) {
            throw new SessionError(`You are not part of this session`);
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
            turnExpiresAt,
        });

        void this.gameHistoryRepository.appendMove(session.gameId, {
            moveNumber: session.gameState.cells.length + 1,
            playerId,
            x,
            y,
            timestamp,
        });

        if (session.gameState.winner) {
            /* emit full state just to ensure everyone sees the same */
            this.emitGameState(session);

            await this.finishSessionLocked(session, `six-in-a-row`, session.gameState.winner.playerId);
            return;
        }

        this.timeControl.syncTurnTimeout(session, this.handleTurnExpired);
        this.emitCellPlacement(session, session.gameState.cells.at(-1)!);
    }

    sendChatMessage(session: ServerGameSession, participantId: string, message: string) {
        const participant = session.players.find((player) => player.id === participantId);
        if (!participant) {
            throw new SessionError(`Only active match players can chat.`);
        }

        const senderId = participantId as SessionChatSenderId;
        const chatMessage: SessionChatMessage = {
            id: Math.random().toString(36)
                .slice(2, 10) as SessionChatMessageId,
            senderId,
            message,
            sentAt: Date.now(),
        };

        session.chatNames[senderId] = participant.displayName;
        session.chatMessages = [...session.chatMessages, chatMessage].slice(-MAX_SESSION_CHAT_MESSAGES);

        this.eventHandlers.sessionChat?.({
            sessionId: session.id,
            message: chatMessage,
            senderDisplayName: participant.displayName,
        });
    }

    async requestRematch(session: ServerGameSession, participantId: string): Promise<RematchRequestResult> {
        return session.lock.runExclusive(async () => {
            if (this.serverShutdownService.isShutdownPending()) {
                throw new SessionError(`Server shutdown pending. Rematches are unavailable.`);
            }

            if (session.state !== `finished`) {
                throw new SessionError(`Rematch is not available for this match.`);
            }

            if (!session.players.some((player) => player.id === participantId)) {
                throw new SessionError(`Rematch is not available for this match.`);
            }

            const connectedPlayers = session.players.filter(player => player.connection.status === `connected`);
            if (connectedPlayers.length !== MAX_PLAYERS_PER_SESSION) {
                throw new SessionError(`Your opponent is no longer available for a rematch.`);
            }

            if (!session.rematchAcceptedPlayerIds.includes(participantId)) {
                session.rematchAcceptedPlayerIds = [...session.rematchAcceptedPlayerIds, participantId];
            }
            for (const botPlayer of session.players.filter((player) => player.isBot)) {
                if (!session.rematchAcceptedPlayerIds.includes(botPlayer.id)) {
                    session.rematchAcceptedPlayerIds = [...session.rematchAcceptedPlayerIds, botPlayer.id];
                }
            }
            this.emitSessionUpdated(session, [`state`]);

            return {
                status: session.rematchAcceptedPlayerIds.length === session.players.length ? `ready` : `pending`,
                players: session.players.map(({ id }) => id),
                spectators: session.spectators.map(({ id }) => id),
            };
        });
    }

    async createRematchSession(sessionId: string): Promise<RematchCreateResult> {
        this.assertNewGameCreationAllowed(`rematch`);

        const originalSession = this.requireSession(sessionId);
        return originalSession.lock.runExclusive(async () => {
            if (originalSession.state !== `finished`) {
                throw new SessionError(`Rematch is not available for this match.`);
            }

            if (originalSession.rematchAcceptedPlayerIds.length < originalSession.players.length) {
                throw new SessionError(`Waiting for both players to request the rematch.`);
            }

            const participantMapping: Record<string, string> = {};
            const rematchSession = createGameSession(sessionId, originalSession.gameOptions);

            const socketMapping: Record<string, string> = {};
            await rematchSession.lock.runExclusive(async () => {
                /*
                 * As we're setting all players connection state to disconnected,
                 * we need to set hadPlayers to false as well, else tickSession will remove this lobby
                 * before the socket gateway could even assign the client sockets to the new session.
                 */
                rematchSession.hadPlayers = false;

                rematchSession.players = originalSession.players.map(player => {
                    const newParticipantId = this.createParticipantId(rematchSession);
                    participantMapping[player.id] = newParticipantId;

                    return {
                        id: newParticipantId,
                        deviceId: player.deviceId,

                        connection: player.isBot
                            ? ({ status: `connected`, socketId: this.getBotSocketId(player.botId ?? newParticipantId) } satisfies ServerParticipantConnection)
                            : ({ status: `disconnected`, timestamp: Date.now() } satisfies ServerParticipantConnection),
                        displayName: player.displayName,

                        rating: player.ratingAdjusted ?? player.rating,
                        ratingAdjustment: null,
                        ratingAdjusted: null,

                        profileId: player.profileId,
                        isBot: player.isBot,
                        botId: player.botId,
                        botOwnerProfileId: player.botOwnerProfileId,
                    };
                });
                rematchSession.players.reverse();

                rematchSession.spectators = originalSession.spectators.map(player => {
                    const newParticipantId = this.createParticipantId(rematchSession);
                    participantMapping[player.id] = newParticipantId;

                    return {
                        id: newParticipantId,
                        deviceId: player.deviceId,

                        connection: { status: `disconnected`, timestamp: Date.now() },
                        displayName: player.displayName,

                        rating: player.ratingAdjusted ?? player.rating,
                        ratingAdjustment: null,
                        ratingAdjusted: null,

                        profileId: player.profileId,
                        isBot: player.isBot,
                        botId: player.botId,
                        botOwnerProfileId: player.botOwnerProfileId,
                    };
                });

                rematchSession.chatNames = Object.fromEntries(Object.entries(originalSession.chatNames)
                    .map(([senderId, displayName]) => [participantMapping[senderId], displayName]));
                rematchSession.chatMessages = originalSession.chatMessages.map(message => ({
                    ...message,
                    senderId: participantMapping[message.senderId] as SessionChatSenderId,
                }));

                for (const { participant } of this.getAllParticipations(originalSession)) {
                    if (participant.connection.status === `connected`) {
                        socketMapping[participantMapping[participant.id]] = participant.connection.socketId;
                    }

                    if (participant.connection.status !== `disconnected`) {
                        /* mark all clients as disconnected in the old session */
                        this.updateParticipantConnection(participant, { status: `disconnected`, timestamp: Date.now() });
                    }
                }

                this.sessions.delete(originalSession.id);
                this.sessions.set(rematchSession.id, rematchSession);

                if (originalSession.id !== rematchSession.id) {
                    /* remove the original session */
                    this.eventHandlers.lobbyRemoved?.({ id: originalSession.id });
                }
                this.emitLobbyUpdated(rematchSession);
            });

            void this.tickSession(rematchSession);

            return {
                rematchSession,
                socketMapping: socketMapping,
            };
        });
    }

    async cancelRematch(session: ServerGameSession, participantId?: string) {
        await session.lock.runExclusive(async () => {
            if (session.state !== `finished`) {
                return;
            }

            if (participantId) {
                if (!session.rematchAcceptedPlayerIds.includes(participantId)) {
                    return;
                }

                session.rematchAcceptedPlayerIds = session.rematchAcceptedPlayerIds.filter(playerId => playerId !== participantId);
            } else {
                session.rematchAcceptedPlayerIds = [];
            }

            this.emitSessionUpdated(session, [`state`]);
        });
    }

    private readonly handleTurnExpired = (sessionId: string): void => {
        const session = this.sessions.get(sessionId);
        if (session?.state !== `in-game` || session.players.length < MAX_PLAYERS_PER_SESSION) {
            this.timeControl.clearSession(sessionId);
            return;
        }

        const timedOutPlayerId = session.gameState.currentTurnPlayerId;
        if (!timedOutPlayerId) {
            this.timeControl.clearSession(sessionId);
            return;
        }

        const winningPlayerId = session.players.find((player) => player.id !== timedOutPlayerId)?.id ?? null;
        void session.lock.runExclusive(async () => await this.finishSessionLocked(session, `timeout`, winningPlayerId));
    };

    private assertNewGameCreationAllowed(source: `lobby` | `rematch`): void {
        if (this.serverShutdownService.isShutdownPending()) {
            throw new SessionError(source === `rematch`
                ? `Server restart pending. Rematches are unavailable.`
                : `Server restart pending. New games cannot be created.`);
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
            event: `session.creation.blocked.concurrent-game-limit`,
            source,
            currentConcurrentGames,
            maxConcurrentGames,
        }, `Blocked new game creation because the concurrent game limit was reached`);

        throw new SessionError(`The server is currently at its concurrent game limit (${maxConcurrentGames}). Please wait for another game to finish before creating a new one.`);
    }

    async tickAllSessions(): Promise<void> {
        await Promise.allSettled([...this.sessions.values()].map(session => this.tickSession(session)));
    }

    private async tickSession(session: ServerGameSession) {
        await session.lock.runExclusive(async () => this.tickSessionLocked(session));
        this.triggerBotTurnIfNeeded(session.id);
    }

    private deleteSession(session: ServerGameSession, reason: string) {
        const sessionAge = Date.now() - session.createdAt;
        this.logger.info(
            {
                event: `session.deleted`,
                sessionId: session.id,
                state: session.state,

                sessionAge,
                reason,
            },
            `Removing session`,
        );

        this.timeControl.clearSession(session.id);
        this.activeBotTurns.delete(session.id);
        this.sessions.delete(session.id);
        this.eventHandlers.lobbyRemoved?.({ id: session.id });
        this.shutdownHook.tryShutdown();
    }

    private async tickSessionLocked(session: ServerGameSession) {
        assert(session.lock.isLocked());

        if (this.sessions.get(session.id) !== session) {
            /* session no longer exists */
            return;
        }

        const connectedPlayers = session.players.filter(spectator => spectator.connection.status !== `disconnected`);
        const connectedSpectators = session.spectators.filter(spectator => spectator.connection.status !== `disconnected`);
        const sessionAge = Date.now() - session.createdAt;
        if (connectedPlayers.length === 0 && connectedSpectators.length === 0 && (session.hadPlayers || sessionAge >= 5_000)) {
            this.deleteSession(session, `empty`);
            return;
        }

        switch (session.state) {
            case `lobby`: {
            /* time out players which could not connect within a certain given time */
                let playersUpdated = false;
                session.players = session.players.filter(player => {
                    if (player.connection.status !== `disconnected`) {
                        return true;
                    }

                    if (Date.now() - player.connection.timestamp < 5_000) {
                        return true;
                    }

                    playersUpdated = true;
                    return false;
                });

                if (playersUpdated) {
                    this.emitLobbyUpdated(session);
                    this.emitSessionUpdated(session, [`players`]);
                }

                if (connectedPlayers.length < MAX_PLAYERS_PER_SESSION) {
                /* lobby not yet full / not all people are connected */
                    break;
                }

                /* start game */
                const startedAt = Date.now();
                const gameId = await this.ensureGameHistory(session);
                if (this.sessions.get(session.id) !== session || session.state !== `lobby` || session.players.length < MAX_PLAYERS_PER_SESSION) {
                    return;
                }

                session.gameId = gameId;
                session.state = `in-game`;
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
                this.emitLobbyUpdated(session);
                this.emitSessionUpdated(session, [`state`, `players`]);
                this.logger.info(
                    {
                        event: `session.started`,
                        sessionId: session.id,
                        players: session.players.map(({ id }) => id),
                        startedAt: session.startedAt,
                    },
                    `Session started`,
                );
                break;
            }

            case `in-game`: {
                if (connectedPlayers.length <= 1) {
                /* Only one player left. Make him the winner. */
                    const [winningPlayer] = connectedPlayers;
                    await this.finishSessionLocked(session, `disconnect`, winningPlayer?.id ?? null);
                    break;
                }

                break;
            }

            case `finished`:
                if (connectedPlayers.length === 0) {
                /*
                 * All players have left the session.
                 * Specators do not count.
                 */
                    this.deleteSession(session, `empty-finished`);
                    return;
                }

                /* nothing to do */
                break;
        }
    }

    private async finishSessionLocked(session: ServerGameSession, reason: SessionFinishReason, winningPlayerId: string | null): Promise<void> {
        assert(session.lock.isLocked());
        if (session.state === `finished`) {
            return;
        }

        const finishedAt = Date.now();
        session.state = `finished`;

        this.timeControl.freezeActiveTurnState(session, finishedAt);
        session.gameState = this.simulation.getPublicGameState(session.gameState);
        session.finishReason = reason;
        session.winningPlayerId = winningPlayerId;
        session.rematchAcceptedPlayerIds = [];

        await this.applyRatingAdjustments(session, winningPlayerId);

        const gameDurationMs = session.startedAt === null ? null : finishedAt - session.startedAt;
        void this.ensureGameHistory(session).then((gameId) => this.gameHistoryRepository.finishGame(gameId, {
            winningPlayerId,
            durationMs: gameDurationMs,
            reason,
        }));

        this.metricsTracker.track(`game-finished`, {
            sessionId: session.id,

            reason,
            winningPlayerId,

            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id),

            createdAt: new Date(session.createdAt).toISOString(),
            startedAt: session.startedAt === null ? null : new Date(session.startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),

            gameDurationMs,
            totalLifetimeMs: finishedAt - session.createdAt,

            gameId: session.gameId,
        });

        this.timeControl.clearSession(session.id);
        this.activeBotTurns.delete(session.id);

        /* finished sessions are removed from the list */
        this.eventHandlers.lobbyRemoved?.({ id: session.id });

        this.emitSessionUpdated(session, [`players`, `state`]);
        this.shutdownHook.tryShutdown();

        this.logger.info(
            {
                event: `session.finished`,
                sessionId: session.id,
                reason,
                winningPlayerId,
                players: session.players.map(({ id }) => id),
                finishedAt,
            },
            `Session finished`,
        );

        void this.tickSession(session);
    }

    private updateParticipantConnection(participant: ServerSessionParticipant, connection: ServerParticipantConnection) {
        switch (participant.connection.status) {
            case `connected`:
            case `disconnected`:
            /* no cleanup needed */
                break;

            case `orphaned`:
            /* clear pending timeout */
                clearTimeout(participant.connection.timeout);
                break;
        }

        participant.connection = connection;
    }

    private disconnectPlayerFromSessionLocked(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        const index = session.players.findIndex(player => player.id === participantId);
        if (index === -1) {
            return;
        }

        const player = session.players[index];
        this.updateParticipantConnection(player, { status: `disconnected`, timestamp: Date.now() });

        if (session.state === `lobby`) {
            /* players can just leave and are removed from the session */
            session.players.splice(index, 1);
        }

        const remainingPlayerIds = session.players
            .filter(player => player.connection.status !== `disconnected`)
            .map(({ id }) => id);

        this.metricsTracker.track(`game-left`, {
            sessionId: session.id,
            playerId: participantId,
            source,
            sessionState: session.state,
            remainingPlayerIds,
        });

        session.rematchAcceptedPlayerIds = [];
        this.emitSessionUpdated(session, [`players`, `state`]);

        if (session.state !== `finished`) {
            this.emitLobbyUpdated(session);
        }

        void this.tickSession(session);
    }

    private disconnectSpectatorFromSessionLocked(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        /* spectators are always removed from the session */
        const index = session.spectators.findIndex(spectator => spectator.id === participantId);
        if (index === -1) {
            return;
        }

        const [spectator] = session.spectators.splice(index, 1);
        this.updateParticipantConnection(spectator, { status: `disconnected`, timestamp: Date.now() });

        this.metricsTracker.track(`spectator-left`, {
            sessionId: session.id,
            spectatorId: participantId,
            source,
            sessionState: session.state,
            remainingSpectators: session.spectators.map(({ id }) => id),
        });

        this.emitSessionUpdated(session, [`spectators`]);
        void this.tickSession(session);
    }

    assignParticipantSocket(session: ServerGameSession, participantId: string, socketId: string): ClientGameParticipation {
        const participation = this.getParticipation(session, participantId);
        if (!participation) {
            throw new SessionError(`Invalid participant id`);
        }

        this.updateParticipantConnection(participation.participant, { status: `connected`, socketId });
        void this.tickSession(session);

        return {
            session: this.toSessionInfo(session),
            gameState: this.simulation.getPublicGameState(session.gameState),

            participantId,
            participantRole: participation.role,
        };
    }

    handleSocketDisconnect(socketId: string) {
        const participation = this.findParticipationFromSocketId(socketId);
        if (!participation) {
            /* socket was not connected to any game */
            return;
        }

        const shouldOrphanConnection = participation.role === `player` && participation.session.state === `in-game`;
        if (shouldOrphanConnection) {
            this.updateParticipantConnection(
                participation.participant,
                {
                    status: `orphaned`,
                    timeout: setTimeout(
                        () => {
                            void this.leaveSession(
                                participation.session,
                                participation.participant.id,
                                `disconnect`,
                            );
                        },
                        15_000,
                    ),
                },
            );
        } else {
            void this.leaveSession(
                participation.session,
                participation.participant.id,
                `disconnect`,
            );
        }

        this.emitSessionUpdated(
            participation.session,
            [participation.role === `player` ? `players` : `spectators`],
        );
        void this.tickSession(participation.session);
    }

    private emitLobbyUpdated(session: ServerGameSession): void {
        if (session.state === `lobby` && session.gameOptions.visibility === `private`) {
            /* Private lobbies do not get announce while in lobby mode. Only once they enter "in game" state. */
            return;
        } else if (session.state === `finished`) {
            /* Finished sessions are not announced */
            return;
        }

        const lobbyInfo = this.toLobbyInfo(session);
        this.eventHandlers.lobbyUpdated?.(lobbyInfo);
    }

    private emitSessionUpdated(session: ServerGameSession, keys?: (keyof SessionInfo)[]): void {
        const fullInfo = this.toSessionInfo(session);
        const partialInfo: Partial<SessionInfo> = {};
        if (keys) {
            for (const key of keys) {
                /* @ts-expect-error key is keyof SessionInfo so also in Partial<SessionInfo> */
                partialInfo[key] = fullInfo[key];
            }
        } else {
            Object.assign(partialInfo, fullInfo);
        }

        this.eventHandlers.sessionUpdated?.({
            sessionId: session.id,
            session: partialInfo,
        });
    }

    private emitGameState(session: ServerGameSession): void {
        this.eventHandlers.gameStateUpdated?.({
            sessionId: session.id,
            gameState: this.simulation.getPublicGameState(session.gameState),
        });
    }

    private emitCellPlacement(session: ServerGameSession, cell: BoardCell) {
        const state = this.simulation.getPublicGameState(session.gameState) as Partial<GameState>;
        delete state.cells;
        delete state.playerTiles;

        this.eventHandlers.gameCellPlacement?.({
            sessionId: session.id,
            state,
            cell: cell,
        });
    }

    getSession(sessionId: string): ServerGameSession | null {
        return this.sessions.get(sessionId) ?? null;
    }

    requireSession(sessionId: string): ServerGameSession {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new SessionError(`Session not found`);
        }

        return session;
    }

    getParticipation(session: ServerGameSession, participantId: string): ServerSessionParticipation | null {
        for (const player of session.players) {
            if (player.id !== participantId) {
                continue;
            }

            return {
                participant: player,
                role: `player`,
            };
        }

        for (const spectator of session.spectators) {
            if (spectator.id !== participantId) {
                continue;
            }

            return {
                participant: spectator,
                role: `spectator`,
            };
        }

        return null;
    }

    getAllParticipations(session: ServerGameSession): ServerSessionParticipation[] {
        return [
            ...session.players.map(player => ({
                participant: player,
                role: `player`,
            } satisfies ServerSessionParticipation)),

            ...session.spectators.map(player => ({
                participant: player,
                role: `spectator`,
            } satisfies ServerSessionParticipation)),
        ];
    }

    findParticipationFromSocketId(socketId: string): { session: ServerGameSession } & ServerSessionParticipation | null {
        for (const session of this.sessions.values()) {
            const participation = this.getAllParticipations(session).find(({ participant: participation }) => participation.connection.status === `connected` && participation.connection.socketId === socketId);
            if (!participation) {
                continue;
            }

            return {
                session: session,
                ...participation,
            };
        }

        return null;
    }


    private findOrphanedParticipation(deviceId: string): { session: ServerGameSession } & ServerSessionParticipation | null {
        for (const session of this.sessions.values()) {
            const participation = this.getAllParticipations(session).find(({ participant: participation }) => participation.connection.status === `orphaned` && participation.deviceId === deviceId);
            if (!participation) {
                continue;
            }

            return {
                session: session,
                ...participation,
            };
        }

        return null;
    }

    async participantTransferConnection(oldSocketId: string, newSocketId: string): Promise<ClientGameParticipation | null> {
        const info = this.findParticipationFromSocketId(oldSocketId);
        if (!info) {
            return null;
        }

        return await info.session.lock.runExclusive(() => {
            if (info.participant.connection.status !== `connected` || info.participant.connection.socketId !== oldSocketId) {
                return null;
            }

            info.participant.connection.socketId = newSocketId;

            this.logger.info(
                {
                    event: `session.connection-transferred`,
                    sessionId: info.session.id,
                    participantId: info.participant.id,
                    participantRole: info.role,
                    oldSocketId,
                    newSocketId,
                },
                `Transferred session connection to new socket`,
            );

            return {
                session: this.toSessionInfo(info.session),
                gameState: this.simulation.getPublicGameState(info.session.gameState),

                participantId: info.participant.id,
                participantRole: info.role,
            };
        });
    }

    async participantReclaimSessionFromDeviceId(deviceId: string, socketId: string): Promise<ClientGameParticipation | null> {
        const info = this.findOrphanedParticipation(deviceId);
        if (!info) {
            return null;
        }

        return await info.session.lock.runExclusive(() => {
            if (info.participant.connection.status !== `orphaned`) {
                /* connection already reclaimed */
                return null;
            }

            this.updateParticipantConnection(info.participant, {
                status: `connected`,
                socketId,
            });

            this.logger.info({
                event: `session.connection-reclaimed`,
                sessionId: info.session.id,
                participantId: info.participant.id,
                participantRole: info.role,
                deviceId,
                socketId,
            }, `Reclaimed orphaned session connection from device id`);

            this.emitSessionUpdated(
                info.session,
                [info.role === `player` ? `players` : `spectators`],
            );

            return {
                session: this.toSessionInfo(info.session),
                gameState: this.simulation.getPublicGameState(info.session.gameState),

                participantId: info.participant.id,
                participantRole: info.role,
            };
        });
    }

    private createSessionId(): string {
        let sessionId = Math.random().toString(36)
            .substring(2, 8);
        while (this.sessions.has(sessionId)) {
            sessionId = Math.random().toString(36)
                .substring(2, 8);
        }

        return sessionId;
    }

    private createParticipantId(session: ServerGameSession): string {
        let participantId = Math.random().toString(36)
            .substring(2, 8);
        while (
            session.players.some((participant) => participant.id === participantId)
            || session.spectators.some((participant) => participant.id === participantId)
        ) {
            participantId = Math.random().toString(36)
                .substring(2, 8);
        }

        return participantId;
    }

    private createBotParticipant(session: ServerGameSession, bot: AccountBot): ServerSessionParticipant {
        return {
            id: this.createParticipantId(session),
            deviceId: `bot:${bot.id}`,
            profileId: null,
            displayName: bot.name,
            isBot: true,
            botId: bot.id,
            botOwnerProfileId: bot.ownerProfileId,
            rating: {
                eloScore: 0,
                gameCount: 0,
            },
            ratingAdjustment: null,
            ratingAdjusted: null,
            connection: {
                status: `connected`,
                socketId: this.getBotSocketId(bot.id),
            },
        };
    }

    private getBotSocketId(botId: string): string {
        return `bot:${botId}`;
    }

    private triggerBotTurnIfNeeded(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session || session.state !== `in-game` || this.activeBotTurns.has(sessionId)) {
            return;
        }

        const currentPlayer = session.players.find((player) => player.id === session.gameState.currentTurnPlayerId);
        if (!currentPlayer?.isBot) {
            return;
        }

        this.activeBotTurns.add(sessionId);
        void this.runBotTurnLoop(sessionId)
            .catch((error: unknown) => {
                this.logger.error({ err: error, sessionId, event: `bot-turn.failed` }, `Bot turn loop failed`);
            })
            .finally(() => {
                this.activeBotTurns.delete(sessionId);

                const activeSession = this.sessions.get(sessionId);
                const activeBotPlayer = activeSession?.players.find((player) => player.id === activeSession.gameState.currentTurnPlayerId);
                if (activeSession?.state === `in-game` && activeBotPlayer?.isBot) {
                    queueMicrotask(() => this.triggerBotTurnIfNeeded(sessionId));
                }
            });
    }

    private async runBotTurnLoop(sessionId: string): Promise<void> {
        while (true) {
            const session = this.sessions.get(sessionId);
            if (!session) {
                return;
            }

            const pendingTurn = await session.lock.runExclusive(async () => this.getPendingBotTurnLocked(session));
            if (!pendingTurn) {
                return;
            }

            if (pendingTurn.kind === `opening-origin`) {
                await this.placeCell(session, pendingTurn.playerId, 0, 0);
                continue;
            }

            const bot = await this.accountBotService.getBotById(pendingTurn.botId);
            if (!bot) {
                await this.forfeitBotTurn(session, pendingTurn.playerId, `Bot configuration no longer exists.`);
                return;
            }

            let move;
            try {
                move = await this.accountBotService.requestMove(bot, pendingTurn.request);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : `Bot request failed.`;
                await this.forfeitBotTurn(session, pendingTurn.playerId, message);
                return;
            }

            const applyResult = await session.lock.runExclusive(async () => {
                if (session.state !== `in-game` || session.gameState.currentTurnPlayerId !== pendingTurn.playerId) {
                    return { status: `stale` } as const;
                }

                const currentPlayer = session.players.find((player) => player.id === pendingTurn.playerId);
                if (!currentPlayer?.isBot || currentPlayer.botId !== pendingTurn.botId) {
                    return { status: `stale` } as const;
                }

                if (move.pieces[0].x === move.pieces[1].x && move.pieces[0].y === move.pieces[1].y) {
                    return { status: `invalid`, message: `Bot returned the same placement twice.` } as const;
                }

                try {
                    await this.placeCellLocked(session, pendingTurn.playerId, move.pieces[0].x, move.pieces[0].y);
                    if (session.state !== `in-game`) {
                        return { status: `done` } as const;
                    }

                    await this.placeCellLocked(session, pendingTurn.playerId, move.pieces[1].x, move.pieces[1].y);
                    return { status: `applied` } as const;
                } catch (error: unknown) {
                    if (error instanceof SessionError) {
                        return { status: `invalid`, message: error.message } as const;
                    }

                    throw error;
                }
            });

            if (applyResult.status === `stale` || applyResult.status === `done`) {
                return;
            }

            if (applyResult.status === `invalid`) {
                await this.forfeitBotTurn(session, pendingTurn.playerId, applyResult.message);
                return;
            }
        }
    }

    private getPendingBotTurnLocked(session: ServerGameSession):
        | {
            kind: `opening-origin`;
            playerId: string;
        }
        | {
            kind: `stateless-turn`;
            playerId: string;
            botId: string;
            request: Parameters<AccountBotService[`requestMove`]>[1];
        }
        | null {
        if (session.state !== `in-game`) {
            return null;
        }

        const currentPlayerId = session.gameState.currentTurnPlayerId;
        if (!currentPlayerId) {
            return null;
        }

        const currentPlayer = session.players.find((player) => player.id === currentPlayerId);
        if (!currentPlayer?.isBot || !currentPlayer.botId) {
            return null;
        }

        if (session.gameState.cells.length === 0 && session.gameState.placementsRemaining === 1) {
            return {
                kind: `opening-origin`,
                playerId: currentPlayerId,
            };
        }

        const playerOneId = session.players[0]?.id;
        const playerTwoId = session.players[1]?.id;
        if (!playerOneId || !playerTwoId) {
            return null;
        }

        const currentPlayerIndex = session.players.findIndex((player) => player.id === currentPlayerId);
        if (currentPlayerIndex === -1) {
            return null;
        }

        const timeLimitSeconds = session.gameState.currentTurnExpiresAt
            ? Math.max(0.1, (session.gameState.currentTurnExpiresAt - Date.now()) / 1000)
            : undefined;

        return {
            kind: `stateless-turn`,
            playerId: currentPlayerId,
            botId: currentPlayer.botId,
            request: {
                toMove: currentPlayerIndex === 0 ? `x` : `o`,
                cells: session.gameState.cells.map((cell) => ({
                    x: cell.x,
                    y: cell.y,
                    piece: cell.occupiedBy === playerOneId ? `x` : `o`,
                })),
                timeLimitSeconds,
            },
        };
    }

    private async forfeitBotTurn(session: ServerGameSession, playerId: string, reason: string): Promise<void> {
        this.logger.warn({
            event: `bot-turn.forfeit`,
            sessionId: session.id,
            playerId,
            reason,
        }, `Bot forfeited the game`);

        await session.lock.runExclusive(async () => {
            if (session.state !== `in-game`) {
                return;
            }

            const botPlayer = session.players.find((player) => player.id === playerId);
            if (!botPlayer?.isBot) {
                return;
            }

            const winningPlayerId = session.players.find((player) => player.id !== playerId)?.id ?? null;
            await this.finishSessionLocked(session, `surrender`, winningPlayerId);
        });
    }

    private toSessionInfo(session: ServerGameSession): SessionInfo {
        let state: SessionState;
        switch (session.state) {
            case `lobby`:
                state = {
                    status: `lobby`,
                };
                break;

            case `in-game`:
                state = {
                    status: `in-game`,

                    gameId: session.gameId,
                    startedAt: session.startedAt!,
                };
                break;

            case `finished`:
                state = {
                    status: `finished`,

                    gameId: session.gameId,

                    finishReason: session.finishReason ?? `terminated`,
                    rematchAcceptedPlayerIds: session.rematchAcceptedPlayerIds,

                    winningPlayerId: session.winningPlayerId,
                };
                break;
        }

        return {
            id: session.id,
            gameOptions: cloneGameOptions(session.gameOptions),

            players: cloneParticipants(session.players),
            spectators: cloneParticipants(session.spectators),

            state,
            chat: {
                displayNames: session.chatNames,
                messages: session.chatMessages.map(cloneChatMessage),
            },
        };
    }

    private toLobbyInfo(session: ServerGameSession): LobbyInfo {
        return {
            id: session.id,

            players: session.players.map((player) => ({
                displayName: player.displayName,
                profileId: player.profileId,
                isBot: player.isBot,
                botId: player.botId,
                botOwnerProfileId: player.botOwnerProfileId,
                elo: player.rating.eloScore,
            })),

            timeControl: { ...session.gameOptions.timeControl },
            rated: session.gameOptions.rated,

            createdAt: session.createdAt,
            startedAt: session.state === `in-game` ? (session.startedAt ?? session.createdAt) : null,
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
            session.gameOptions,
        );
        session.gameId = gameId;
        return gameId;
    }

    private buildDatabasePlayers(session: ServerGameSession) {
        return session.players.map((player, playerIndex) => ({
            playerId: player.id,
            displayName: player.displayName || `Player ${playerIndex + 1}`,
            profileId: player.profileId,
            isBot: player.isBot,
            botId: player.botId,
            botOwnerProfileId: player.botOwnerProfileId,
            elo: player.rating?.eloScore ?? null,
            eloChange: null,
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

    // / Update the player rating adjustments. emitSessionUpdated with players must be called manually afterwards
    private async applyRatingAdjustments(session: ServerGameSession, winningPlayerId: string | null): Promise<void> {
        if (!session.isRatedGame || !winningPlayerId) {
            return;
        }

        try {
            const eloAdjustments = new Map<string, number>();
            for (const player of session.players) {
                if (!player.profileId || !player.ratingAdjustment) {
                    continue;
                }

                if (player.ratingAdjusted) {
                    /* rating has already been adjusted */
                    continue;
                }

                const adjustment = player.ratingAdjustment;
                player.ratingAdjusted = await this.eloHandler.applyGameResult(
                    player.profileId,
                    adjustment,
                    player.id === winningPlayerId ? `win` : `loss`,
                );

                const eloAdjustment = player.id === winningPlayerId ? adjustment.eloGain : adjustment.eloLoss;
                eloAdjustments.set(player.id, eloAdjustment);
            }

            const gameId = await this.ensureGameHistory(session);
            await this.gameHistoryRepository.updatePlayerEloChanges(
                gameId,
                eloAdjustments,
            );
        } catch (error: unknown) {
            this.logger.error(
                {
                    err: error,
                    event: `session.elo-update.failed`,
                    sessionId: session.id,
                    winningPlayerId,
                },
                `Failed to apply rated game result`,
            );
        }
    }

    private calculateRatingAdjustments(session: ServerGameSession) {
        const ratedPlayers = session.players.filter((player): player is ServerSessionParticipant & { profileId: string } => player.profileId !== null);
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
        return this.listStoredSessions().some(session => session.state === `in-game`);
    }
}
