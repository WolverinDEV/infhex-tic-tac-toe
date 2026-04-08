import assert from 'node:assert';
import { randomInt } from 'node:crypto';

import type {
    BoardCell,
    CreateSessionResponse,
    FinishedGameTournamentInfo,
    GameState,
    HexCoordinate,
    LobbyInfo,
    LobbyFirstPlayer,
    PlayerRating,
    PlayerTileConfig,
    SessionChatMessage,
    SessionChatMessageId,
    SessionChatSenderId,
    SessionFinishReason,
    SessionId,
    SessionInfo,
    SessionState,
    SessionTournamentInfo,
} from '@ih3t/shared';
import { buildPlayerTileConfigMap, DRAW_REQUEST_RETRY_TURNS } from '@ih3t/shared';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';

import { ServerSettingsService } from '../admin/serverSettingsService';
import { ServerShutdownService, type ShutdownHook } from '../admin/serverShutdownService';
import { EloHandler } from '../elo/eloHandler';
import { ROOT_LOGGER } from '../logger';
import { MetricsTracker } from '../metrics/metricsTracker';
import { GameHistoryRepository } from '../persistence/gameHistoryRepository';
import { GameSimulation, SimulationError } from '../simulation/gameSimulation';
import { GameTimeControlError, GameTimeControlManager } from '../simulation/gameTimeControlManager';
import type {
    ClientGameParticipation,
    CreateSessionParams,
    JoinSessionParams,
    PlayerLeaveSource,
    RematchRequestResult,
    ServerGameSession,
    ServerPlayerConnection,
    ServerSessionParticipation,
    ServerSessionPlayer,
    SessionWatchSnapshot,
    SessionManagerEventHandlers,
} from './types';
import {
    cloneChatMessage,
    cloneGameOptions,
    createGameSession,
    toSessionPlayer,
    toSessionSpectator,
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
    private readonly shutdownHook: ShutdownHook;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(GameSimulation) private readonly simulation: GameSimulation,
        @inject(GameTimeControlManager) private readonly timeControl: GameTimeControlManager,
        @inject(EloHandler) private readonly eloHandler: EloHandler,
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

    getSessionSnapshot(sessionId: string): SessionWatchSnapshot | null {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        return {
            session: this.toSessionInfo(session),
            gameState: this.simulation.getPublicGameState(session.gameState),
        };
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

        const sessionId = this.createSessionId();
        const session = createGameSession(sessionId, params.lobbyOptions, {
            reservedPlayerProfileIds: params.reservedPlayerProfileIds,
            tournament: params.tournament ?? null,
        });

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


        let participation: ServerSessionParticipation;
        switch (session.state) {
            case `lobby`: {
                const hasReservedSeats = session.reservedPlayerProfileIds.length > 0;
                const canJoinReservedSeat = Boolean(
                    hasReservedSeats
                    && profileId
                    && session.reservedPlayerProfileIds.includes(profileId)
                    && !session.players.some((player) => player.profileId === profileId),
                );
                const shouldJoinAsSpectator = hasReservedSeats && !canJoinReservedSeat;

                if (!shouldJoinAsSpectator && session.players.length >= MAX_PLAYERS_PER_SESSION) {
                    throw new SessionError(`Session is full`);
                }

                if (!shouldJoinAsSpectator && profileId && session.players.some((player) => player.profileId === profileId)) {
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

                if (shouldJoinAsSpectator) {
                    participation = {
                        session,
                        role: `spectator`,
                        participant: {
                            id: this.createParticipantId(session),

                            profileId,
                            displayName,

                            socketId: null,
                        },
                    };

                    session.spectators.push(participation.participant);
                    break;
                }

                participation = {
                    session,
                    role: `player`,
                    participant: {
                        id: this.createParticipantId(session),

                        deviceId: params.deviceId,
                        profileId,
                        displayName,

                        rating: playerRating,
                        ratingAdjustment: null,
                        ratingAdjusted: null,

                        connection: { status: `disconnected`, timestamp: Date.now() },
                    },
                };

                session.players.push(participation.participant);
                if (hasReservedSeats && participation.participant.profileId) {
                    session.players.sort((leftPlayer, rightPlayer) => {
                        const leftSeat = leftPlayer.profileId
                            ? session.reservedPlayerProfileIds.indexOf(leftPlayer.profileId)
                            : Number.MAX_SAFE_INTEGER;
                        const rightSeat = rightPlayer.profileId
                            ? session.reservedPlayerProfileIds.indexOf(rightPlayer.profileId)
                            : Number.MAX_SAFE_INTEGER;
                        return leftSeat - rightSeat;
                    });
                }
                session.hadPlayers = true;
                break;
            }

            case `in-game`:
            case `finished`:
                participation = {
                    session,
                    role: `spectator`,
                    participant: {
                        id: this.createParticipantId(session),

                        profileId: params.profile?.id ?? null,
                        displayName: params.displayName,

                        socketId: null,
                    }
                }
                session.spectators.push(participation.participant);
                break;
        }

        this.metricsTracker.track(`session-joined`, {
            sessionId: session.id,

            participation,
            players: session.players.map(({ id }) => id),
            spectators: session.spectators.map(({ id }) => id),
        });

        this.emitSessionUpdated(
            session,
            [participation.role === `player` ? `players` : `spectators`],
        );
        this.emitLobbyUpdated(session);

        return participation;
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

    async requestDraw(session: ServerGameSession, participantId: string) {
        await session.lock.runExclusive(async () => {
            this.assertCanParticipateInDraw(session, participantId);

            if (session.drawRequest) {
                if (session.drawRequest === participantId) {
                    throw new SessionError(`Your draw request is already waiting for a response.`);
                }

                throw new SessionError(`Your opponent already offered a draw. Accept or decline it.`);
            }

            if (session.gameState.turnCount < session.drawRequestAvailableAfterTurn) {
                const remainingTurns = session.drawRequestAvailableAfterTurn - session.gameState.turnCount;
                throw new SessionError(`A draw can be requested again after ${remainingTurns} more completed turns.`);
            }

            session.drawRequest = participantId;
            this.emitSessionUpdated(session, ["state"]);
        });
    }

    async acceptDraw(session: ServerGameSession, participantId: string) {
        await session.lock.runExclusive(async () => {
            this.assertCanParticipateInDraw(session, participantId);

            const requestedByPlayerId = session.drawRequest;
            if (!requestedByPlayerId) {
                throw new SessionError(`There is no draw request to accept.`);
            }

            if (requestedByPlayerId === participantId) {
                throw new SessionError(`You cannot accept your own draw request.`);
            }

            await this.finishSessionLocked(session, `draw-agreement`, null);
        });
    }

    async declineDraw(session: ServerGameSession, participantId: string) {
        await session.lock.runExclusive(async () => {
            this.assertCanParticipateInDraw(session, participantId);

            const requestedByPlayerId = session.drawRequest;
            if (!requestedByPlayerId) {
                throw new SessionError(`There is no draw request to decline.`);
            }

            if (requestedByPlayerId === participantId) {
                throw new SessionError(`You cannot decline your own draw request.`);
            }

            session.drawRequest = null;
            session.drawRequestAvailableAfterTurn = session.gameState.turnCount + DRAW_REQUEST_RETRY_TURNS;
            this.emitSessionUpdated(session, ["state"]);
        });
    }


    async placeCell(session: ServerGameSession, playerId: string, cell: HexCoordinate) {
        await session.lock.runExclusive(async () => await this.placeCellLocked(session, playerId, cell));
    }

    private async placeCellLocked(session: ServerGameSession, playerId: string, cell: HexCoordinate) {
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
                x: cell.x,
                y: cell.y,
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
            x: cell.x,
            y: cell.y,
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

            if (session.tournament) {
                throw new SessionError(`Rematches are unavailable for tournament matches.`);
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
            this.emitSessionUpdated(session, [`state`]);

            return {
                status: session.rematchAcceptedPlayerIds.length === session.players.length ? `ready` : `pending`,
                players: session.players.map(({ id }) => id),
                spectators: session.spectators.map(({ id }) => id),
            };
        });
    }

    async createRematchSession(sessionId: SessionId): Promise<RematchCreateResult> {
        this.assertNewGameCreationAllowed(`rematch`);

        const originalSession = this.requireSession(sessionId);
        return originalSession.lock.runExclusive(async () => {
            if (originalSession.tournament) {
                throw new SessionError(`Rematches are unavailable for tournament matches.`);
            }

            if (originalSession.state !== `finished`) {
                throw new SessionError(`Rematch is not available for this match.`);
            }

            if (originalSession.rematchAcceptedPlayerIds.length < originalSession.players.length) {
                throw new SessionError(`Waiting for both players to request the rematch.`);
            }

            const participantMapping: Record<string, string> = {};
            const rematchFirstPlayer = this.resolveRematchFirstPlayer(originalSession);
            const rematchSession = createGameSession(sessionId, {
                ...originalSession.gameOptions,
                firstPlayer: rematchFirstPlayer,
            });

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

                        connection: { status: `disconnected`, timestamp: Date.now() },
                        displayName: player.displayName,

                        rating: player.ratingAdjusted ?? player.rating,
                        ratingAdjustment: null,
                        ratingAdjusted: null,

                        profileId: player.profileId,
                    };
                });

                rematchSession.spectators = originalSession.spectators.map(spectator => {
                    const newParticipantId = this.createParticipantId(rematchSession);
                    participantMapping[spectator.id] = newParticipantId;

                    return {
                        id: newParticipantId,
                        profileId: spectator.profileId,
                        displayName: spectator.displayName,
                        socketId: spectator.socketId
                    };
                });

                rematchSession.chatNames = Object.fromEntries(Object.entries(originalSession.chatNames)
                    .map(([senderId, displayName]) => [participantMapping[senderId], displayName]));
                rematchSession.chatMessages = originalSession.chatMessages.map(message => ({
                    ...message,
                    senderId: participantMapping[message.senderId] as SessionChatSenderId,
                }));

                for (const player of originalSession.players) {
                    if (player.connection.status === `connected`) {
                        socketMapping[participantMapping[player.id]] = player.connection.socketId;
                    }

                    if (player.connection.status !== `disconnected`) {
                        /* mark all clients as disconnected in the old session */
                        this.updatePlayerConnection(player, { status: `disconnected`, timestamp: Date.now() });
                    }
                }

                for (const spectator of originalSession.spectators) {
                    if (!spectator.socketId) {
                        continue
                    }

                    socketMapping[participantMapping[spectator.id]] = spectator.socketId;
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

        const connectedPlayers = session.players.filter(player => player.connection.status !== `disconnected`);
        const connectedSpectators = session.spectators.filter(spectator => spectator.socketId !== null);
        const sessionAge = Date.now() - session.createdAt;
        const isTournamentSessionAwaitingReconciliation = session.tournament !== null
            && session.state === `finished`
            && session.finishedAt !== null
            && Date.now() - session.finishedAt < 30_000;
        const shouldKeepTournamentSession = session.tournament !== null && session.state !== `finished`;
        if (
            !shouldKeepTournamentSession
            && !isTournamentSessionAwaitingReconciliation
            && connectedPlayers.length === 0
            && connectedSpectators.length === 0
            && (session.hadPlayers || sessionAge >= 5_000)
        ) {
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

                this.simulation.startSession(
                    session.gameState,
                    session.players.map((player) => player.id),
                    this.resolveStartingPlayerId(session),
                );
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
        session.finishedAt = finishedAt;

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

    private updatePlayerConnection(player: ServerSessionPlayer, connection: ServerPlayerConnection) {
        switch (player.connection.status) {
            case `connected`:
            case `disconnected`:
                /* no cleanup needed */
                break;

            case `orphaned`:
                /* clear pending timeout */
                clearTimeout(player.connection.timeout);
                break;
        }

        player.connection = connection;
    }

    private disconnectPlayerFromSessionLocked(session: ServerGameSession, participantId: string, source: PlayerLeaveSource): void {
        const index = session.players.findIndex(player => player.id === participantId);
        if (index === -1) {
            return;
        }

        const player = session.players[index];
        this.updatePlayerConnection(player, { status: `disconnected`, timestamp: Date.now() });

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

        const [_spectator] = session.spectators.splice(index, 1);

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

        if (participation.role === "player") {
            this.updatePlayerConnection(participation.participant, { status: `connected`, socketId });
        } else {
            participation.participant.socketId = socketId;
        }

        void this.tickSession(session);

        return {
            session: this.toSessionInfo(session),
            gameState: this.simulation.getPublicGameState(session.gameState),

            participantId,
            participantRole: participation.role,
        };
    }

    handleSocketDisconnect(socketId: string) {
        for (const { session, role, participant } of this.getParticipationsBySocketId(socketId)) {
            switch (role) {
                case "player": {
                    const shouldOrphanConnection = session.state === `in-game`;
                    if (shouldOrphanConnection) {
                        this.updatePlayerConnection(
                            participant,
                            {
                                status: `orphaned`,
                                timeout: setTimeout(
                                    () => {
                                        void this.leaveSession(
                                            session,
                                            participant.id,
                                            `disconnect`,
                                        );
                                    },
                                    15_000,
                                ),
                            },
                        );

                        this.emitSessionUpdated(
                            session,
                            [role === `player` ? `players` : `spectators`],
                        );
                    } else {
                        void this.leaveSession(
                            session,
                            participant.id,
                            `disconnect`,
                        );
                    }

                    break;
                }

                case 'spectator':
                    void this.leaveSession(
                        session,
                        participant.id,
                        `disconnect`,
                    );
                    break;
            }
        }
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

    updateSessionTournamentInfo(sessionId: string, update: Partial<SessionTournamentInfo>): void {
        const session = this.sessions.get(sessionId);
        if (session?.tournament) {
            Object.assign(session.tournament, update);
        }
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
                session,
                participant: player,
                role: `player`,
            };
        }

        for (const spectator of session.spectators) {
            if (spectator.id !== participantId) {
                continue;
            }

            return {
                session,
                participant: spectator,
                role: `spectator`,
            };
        }

        return null;
    }

    getParticipations(session: ServerGameSession): ServerSessionParticipation[] {
        return [
            ...session.players.map(
                player => ({
                    session,
                    participant: player,
                    role: `player`,
                } satisfies ServerSessionParticipation)
            ),

            ...session.spectators.map(
                player => ({
                    session,
                    participant: player,
                    role: `spectator`,
                } satisfies ServerSessionParticipation)
            ),
        ];
    }

    getParticipationsBySocketId(socketId: string): ServerSessionParticipation[] {
        const participations: ServerSessionParticipation[] = [];
        for (const session of this.sessions.values()) {
            for (const player of session.players) {
                if (player.connection.status !== `connected`) {
                    continue
                }

                if (player.connection.socketId !== socketId) {
                    continue
                }

                participations.push({
                    session,
                    participant: player,
                    role: `player`
                });
            }

            for (const spectator of session.spectators) {
                if (spectator.socketId !== socketId) {
                    continue
                }

                participations.push({
                    session,
                    participant: spectator,
                    role: `spectator`
                });
            }
        }

        return participations;
    }

    async connectionTransfer(oldSocketId: string, newSocketId: string): Promise<ClientGameParticipation[]> {
        const gameParticipations: ClientGameParticipation[] = [];

        for (const { session, role, participant } of this.getParticipationsBySocketId(oldSocketId)) {
            const gameParticipation = await session.lock.runExclusive(() => {
                switch (role) {
                    case 'player':
                        if (participant.connection.status !== `connected` || participant.connection.socketId !== oldSocketId) {
                            return null;
                        }

                        participant.connection.socketId = newSocketId;
                        break

                    case 'spectator':
                        participant.socketId = newSocketId;
                        break
                }


                this.logger.info(
                    {
                        event: `session.connection-transferred`,
                        sessionId: session.id,
                        participantId: participant.id,
                        participantRole: role,
                        oldSocketId,
                        newSocketId,
                    },
                    `Transferred session connection to new socket`,
                );

                return {
                    session: this.toSessionInfo(session),
                    gameState: this.simulation.getPublicGameState(session.gameState),

                    participantId: participant.id,
                    participantRole: role,
                };
            });

            if (gameParticipation) {
                gameParticipations.push(gameParticipation);
            }
        }

        return gameParticipations;
    }

    async connectionReclaimFromDeviceId(deviceId: string, socketId: string): Promise<ClientGameParticipation[]> {
        const gameParticipations: ClientGameParticipation[] = [];
        for (const session of this.sessions.values()) {
            const gameParticipation = await session.lock.runExclusive(() => {
                for (const player of session.players) {
                    if (player.connection.status !== `orphaned`) {
                        continue
                    }

                    if (player.deviceId !== deviceId) {
                        continue
                    }

                    this.updatePlayerConnection(player, {
                        status: `connected`,
                        socketId,
                    });

                    this.logger.info({
                        event: `session.player-connection-reclaimed`,
                        sessionId: session.id,
                        playerId: player.id,
                        deviceId,
                        socketId,
                    }, `Reclaimed orphaned session connection from device id`);

                    this.emitSessionUpdated(
                        session,
                        [`players`],
                    );

                    return {
                        session: this.toSessionInfo(session),
                        gameState: this.simulation.getPublicGameState(session.gameState),

                        participantId: player.id,
                        participantRole: `player`,
                    } satisfies ClientGameParticipation;
                }

                return null;
            });

            if (gameParticipation !== null) {
                gameParticipations.push(gameParticipation);

                /*
                 * Currently the client only supports one player connection at the time.
                 * Hence we can reclaim at most one connection. This may change in the feature.
                 */
                break;
            }
        }

        return gameParticipations;
    }

    private createSessionId(): SessionId {
        let sessionId = Math.random().toString(36)
            .substring(2, 8);
        while (this.sessions.has(sessionId)) {
            sessionId = Math.random().toString(36)
                .substring(2, 8);
        }

        return sessionId as SessionId;
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

                    drawRequest: session.drawRequest,
                    drawRequestAvailableAfterTurn: session.drawRequestAvailableAfterTurn,
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

            players: session.players.map(toSessionPlayer),
            spectators: session.spectators.map(toSessionSpectator),

            state,
            chat: {
                displayNames: session.chatNames,
                messages: session.chatMessages.map(cloneChatMessage),
            },
            tournament: session.tournament ? { ...session.tournament } : null,
        };
    }

    private toLobbyInfo(session: ServerGameSession): LobbyInfo {
        return {
            id: session.id,

            players: session.players.map((player) => ({
                displayName: player.displayName,
                profileId: player.profileId,
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
            this.buildFinishedGameTournamentInfo(session),
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
            eloChange: null,
        }));
    }

    private buildPlayerTiles(session: ServerGameSession): Record<string, PlayerTileConfig> {
        return buildPlayerTileConfigMap(session.players.map((player) => player.id));
    }

    private resolveStartingPlayerId(session: ServerGameSession): string | null {
        const [hostPlayer, guestPlayer] = session.players;
        if (!hostPlayer) {
            return null;
        }

        switch (session.gameOptions.firstPlayer) {
            case `host`:
                return hostPlayer.id;

            case `guest`:
                return guestPlayer?.id ?? hostPlayer.id;

            case `random`:
                return session.players[randomInt(0, session.players.length)]?.id ?? hostPlayer.id;
        }
    }

    private resolveRematchFirstPlayer(session: ServerGameSession): LobbyFirstPlayer {
        const [hostPlayer, guestPlayer] = session.players;
        const previousOpeningPlayerId = session.gameState.cells[0]?.occupiedBy ?? null;

        if (!hostPlayer || !guestPlayer) {
            return `random`;
        }

        if (previousOpeningPlayerId === hostPlayer.id) {
            return `guest`;
        } else {
            return `host`;
        }
    }

    private assertCanParticipateInDraw(session: ServerGameSession, participantId: string): void {
        if (session.state !== `in-game`) {
            throw new SessionError(`Draw agreements are only available during an active game.`);
        }

        if (session.tournament) {
            throw new SessionError(`Draw agreements are not available in tournament matches.`);
        }

        if (!session.players.some((participant) => participant.id === participantId)) {
            throw new SessionError(`Only active players can manage draw agreements.`);
        }
    }

    private isRatedGameEnabled(session: ServerGameSession): boolean {
        if (session.tournament) {
            return false;
        }

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

    private buildFinishedGameTournamentInfo(session: ServerGameSession): FinishedGameTournamentInfo | null {
        if (!session.tournament) {
            return null;
        }

        return {
            ...session.tournament,
            resultType: null,
        };
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
        const ratedPlayers = session.players.filter((player): player is ServerSessionPlayer & { profileId: string } => player.profileId !== null);
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
