import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import {
    type AdminBroadcastMessage,
    type ClientToServerEvents,
    type LobbyInfo,
    type ServerToClientEvents,
    zJoinSessionRequest,
    zPlaceCellRequest,
} from '@ih3t/shared';
import { z } from 'zod';
import { AuthService } from '../auth/authService';
import { BackgroundWorkerHub } from '../background/backgroundWorkers';
import { ROOT_LOGGER } from '../logger';
import { getSocketClientInfo as parseSocketClientInfo } from './clientInfo';
import { CorsConfiguration } from './cors';
import { SessionError, SessionManager } from '../session/sessionManager';
import type {
    ClientGameParticipation,
    JoinSessionResult,
    ParticipantJoinedEvent,
    ParticipantLeftEvent,
    PublicGameStatePayload,
    SessionUpdatedEvent,
} from '../session/types';
import { inspect } from 'node:util';

type Participation = {
    sessionId: string,
    participantId: string,
};

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

@injectable()
export class SocketServerGateway {
    private static readonly LOBBY_LIST_DEBOUNCE_MS = 1_000;
    private readonly logger: Logger;
    private readonly socketParticipations = new Map<string, Participation>();
    private readonly connections = new Map<string, ClientSocket>();
    private pendingLobbyList: LobbyInfo[] | null = null;
    private lobbyListBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
    private io?: Server<ClientToServerEvents, ServerToClientEvents>;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(AuthService) private readonly authService: AuthService,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(BackgroundWorkerHub) private readonly backgroundWorkers: BackgroundWorkerHub,
        @inject(CorsConfiguration) private readonly corsConfiguration: CorsConfiguration
    ) {
        this.logger = rootLogger.child({ component: 'socket-server' });
    }

    attach(server: HttpServer) {
        const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, this.corsConfiguration.options ? {
            cors: this.corsConfiguration.options
        } : undefined);

        this.sessionManager.setEventHandlers({
            lobbyListUpdated: (lobbies) => {
                this.scheduleLobbyListBroadcast(io, lobbies);
            },
            shutdownUpdated(shutdown) {
                io.emit('shutdown-updated', shutdown);
            },
            sessionUpdated(event: SessionUpdatedEvent) {
                io.to(event.sessionId).emit('session-updated', event);
            },
            gameStateUpdated(payload: PublicGameStatePayload) {
                io.to(payload.sessionId).emit('game-state', payload);
            },
            participantJoined(event: ParticipantJoinedEvent) {
                io.to(event.sessionId).emit('participant-joined', event);
            },
            participantLeft(event: ParticipantLeftEvent) {
                io.to(event.sessionId).emit('participant-left', event);
            }
        });

        io.on('connection', (socket) => {
            try {
                this.handleConnection(socket);
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, 'connect', socket, error);
                socket.emit('error', getSocketErrorMessage(error));
                return;
            }
        });

        this.io = io;
    }

    private handleConnection(socket: ClientSocket) {
        const clientInfo = parseSocketClientInfo(socket);

        this.logger.debug({
            event: 'socket.connected',
            socketId: socket.id,
            client: clientInfo
        }, 'Socket connected');

        /* identify the connection and ensure we only have one connection of that client */
        const connectionId = `${clientInfo.deviceId}:${clientInfo.ephemeralClientId}`;
        if (this.connections.has(connectionId)) {
            const oldConnection = this.connections.get(connectionId)!;
            const reclaimedParticipation = this.sessionManager.transferConnection(oldConnection.id, socket.id);
            if (reclaimedParticipation) {
                this.putClientInGameState(socket, reclaimedParticipation)
            }
        }

        /* store the connection */
        this.connections.set(`${clientInfo.deviceId}:${clientInfo.ephemeralClientId}`, socket)

        /* reclaim a game by the device id */
        {
            const reclaimedSession = this.sessionManager.reclaimSessionFromDeviceId(clientInfo.deviceId ?? "", socket.id);
            if (reclaimedSession) {
                this.putClientInGameState(socket, reclaimedSession);
            }
        }

        this.backgroundWorkers.track('site-visited', { client: clientInfo });
        socket.emit('lobby-list', this.sessionManager.listLobbyInfo());
        socket.emit('shutdown-updated', this.sessionManager.getShutdownState());

        socket.on('join-session', async (request) => {
            let sessionId: string;
            try {
                sessionId = zJoinSessionRequest.parse(request).sessionId;
            } catch {
                socket.emit('error', 'Invalid session request.');
                return;
            }

            try {
                const joinResult = await this.socketJoinSession(socket, sessionId);
                if (joinResult.participantRole === 'player' && joinResult.isNewParticipant) {
                    await this.sessionManager.activateSession(sessionId);
                }

                this.logger.info({
                    event: 'socket.joined-session',
                    socketId: socket.id,
                    sessionId,
                    role: joinResult.participantRole,
                    state: joinResult.session.state,
                    isNewParticipant: joinResult.isNewParticipant
                }, 'Socket joined session');
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, 'join-session', socket, error, { sessionId });
                socket.emit('error', getSocketErrorMessage(error));
            }
        });

        socket.on('leave-session', () => {
            const participation = this.socketParticipations.get(socket.id);
            if (!participation) {
                return;
            }

            this.socketParticipations.delete(socket.id);
            socket.leave(participation.sessionId);
            this.sessionManager.leaveSession(participation.sessionId, participation.participantId, 'leave-session');
        });

        socket.on('surrender-session', () => {
            try {
                const { sessionId, participantId } = this.requireParticipation(socket.id);
                this.sessionManager.surrenderSession(sessionId, participantId);
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, 'surrender-session', socket, error);
                socket.emit('error', getSocketErrorMessage(error));
            }
        });

        socket.on('request-rematch', async () => {
            try {
                const { sessionId, participantId } = this.requireParticipation(socket.id);
                const rematch = this.sessionManager.requestRematch(sessionId, participantId);
                if (rematch.status !== 'ready') {
                    return;
                }

                const spectatorIds = this.getDistinctSpectatorIds(this.io!, sessionId, rematch.players);
                const nextSession = this.sessionManager.createRematchSession(sessionId, spectatorIds);
                for (const playerId of rematch.players) {
                    const playerSocket = this.getSocketForSessionParticipant(this.io!, sessionId, playerId);
                    if (!playerSocket) {
                        continue;
                    }

                    this.socketParticipations.set(playerSocket.id, {
                        sessionId: nextSession.sessionId,
                        participantId: playerId
                    });
                    playerSocket.leave(sessionId);
                    playerSocket.join(nextSession.sessionId);
                    playerSocket.emit('session-joined', {
                        sessionId: nextSession.sessionId,
                        session: nextSession.session,
                        participantId: playerId
                    });
                }

                for (const spectatorId of spectatorIds) {
                    const spectatorSocket = this.getSocketForSessionParticipant(this.io!, sessionId, spectatorId);
                    if (!spectatorSocket) {
                        continue;
                    }

                    this.socketParticipations.set(spectatorSocket.id, {
                        sessionId: nextSession.sessionId,
                        participantId: spectatorId
                    });
                    spectatorSocket.leave(sessionId);
                    spectatorSocket.join(nextSession.sessionId);
                    spectatorSocket.emit('session-joined', {
                        sessionId: nextSession.sessionId,
                        session: nextSession.session,
                        participantId: spectatorId
                    });
                }

                await this.sessionManager.activateSession(nextSession.sessionId);
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, 'request-rematch', socket, error);
                socket.emit('error', getSocketErrorMessage(error));
            }
        });

        socket.on('cancel-rematch', () => {
            try {
                const { sessionId, participantId } = this.requireParticipation(socket.id);
                this.sessionManager.cancelRematch(sessionId, participantId);
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, 'cancel-rematch', socket, error);
                socket.emit('error', getSocketErrorMessage(error));
            }
        });

        socket.on('place-cell', (data) => {
            let parsedRequest: z.infer<typeof zPlaceCellRequest>;
            try {
                parsedRequest = zPlaceCellRequest.parse(data);
            } catch {
                socket.emit('error', 'Invalid move request.');
                return;
            }

            try {
                const { sessionId, participantId } = this.requireParticipation(socket.id);
                this.sessionManager.placeCell(sessionId, participantId, parsedRequest.x, parsedRequest.y);
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, 'place-cell', socket, error, {
                    x: parsedRequest.x,
                    y: parsedRequest.y
                });
                socket.emit('error', getSocketErrorMessage(error));
            }
        });

        socket.on('disconnect', () => {
            if (this.connections.get(connectionId) === socket) {
                /* connection terminated compeltely */
                this.connections.delete(connectionId);
            } else {
                /* 
                 * Connection has been overridden.
                 * The old (this) connection has been closed.
                 * 
                 * The following next code should not cause any issues as
                 * all data should have been transferred onto the new socket id.
                 */
            }

            this.logger.debug({
                event: 'socket.disconnected',
                socketId: socket.id
            }, 'Socket disconnected');

            this.socketParticipations.delete(socket.id);
            this.sessionManager.handleSocketDisconnect(socket.id);
        });

        socket.emit("initialized");
    }

    public getConnectedClientCount() {
        return this.io?.sockets.sockets.size ?? 0;
    }

    public broadcastAdminMessage(message: string): AdminBroadcastMessage {
        const broadcast: AdminBroadcastMessage = {
            message,
            sentAt: Date.now()
        };

        this.io?.emit('admin-message', broadcast);

        this.logger.info({
            event: 'admin.broadcast',
            sentAt: new Date(broadcast.sentAt).toISOString(),
            messageLength: message.length,
            connectedClients: this.getConnectedClientCount()
        }, 'Broadcasted admin message');

        return broadcast;
    }

    private getParticipation(socketId: string): Participation | undefined {
        return this.socketParticipations.get(socketId);
    }

    private requireParticipation(socketId: string): Participation {
        const participation = this.getParticipation(socketId);
        if (!participation) {
            throw new SessionError('You are not part of a session');
        }

        return participation;
    }

    private getSocketForSessionParticipant(
        io: Server<ClientToServerEvents, ServerToClientEvents>,
        sessionId: string,
        participantId: string
    ): Socket<ClientToServerEvents, ServerToClientEvents> | null {
        for (const [socketId, participation] of this.socketParticipations.entries()) {
            if (participation.sessionId !== sessionId || participation.participantId !== participantId) {
                continue;
            }

            return io.sockets.sockets.get(socketId) ?? null;
        }

        return null;
    }

    private getDistinctSpectatorIds(
        io: Server<ClientToServerEvents, ServerToClientEvents>,
        sessionId: string,
        playerIds: string[]
    ): string[] {
        const spectatorIds = new Set<string>();
        for (const roomSocketId of io.sockets.adapter.rooms.get(sessionId) ?? []) {
            const roomSocket = io.sockets.sockets.get(roomSocketId);
            if (!roomSocket) {
                continue;
            }

            const roomParticipantId = this.getParticipation(roomSocket.id)?.participantId;
            if (!roomParticipantId || playerIds.includes(roomParticipantId)) {
                continue;
            }

            spectatorIds.add(roomParticipantId);
        }

        return [...spectatorIds];
    }

    private async socketJoinSession(
        socket: Socket<ClientToServerEvents, ServerToClientEvents>,
        sessionId: string,
    ): Promise<JoinSessionResult> {
        const user = await this.authService.getCurrentUserFromSocket(socket)
            ?? this.createGuestUser(socket);

        const joinResult = this.sessionManager.joinSession({
            sessionId,
            socketId: socket.id,
            client: parseSocketClientInfo(socket),
            user,
        });

        this.putClientInGameState(socket, joinResult)
        return joinResult;
    }

    private createGuestUser(
        socket: Socket<ClientToServerEvents, ServerToClientEvents>
    ): import('../auth/authRepository').AccountUserProfile {
        const clientInfo = parseSocketClientInfo(socket);
        const guestSeed = clientInfo.deviceId ?? randomUUID();
        const fallbackSuffix = guestSeed.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'PLAY';

        return {
            id: `guest:${guestSeed}`,
            username: `Guest ${fallbackSuffix}`,
            email: null,
            image: null,
            role: 'user'
        };
    }

    public async shutdownConnections() {
        this.clearLobbyListBroadcastTimer();
        this.io?.emit('error', 'Server shutdown');
        await this.io?.close();
    }

    private scheduleLobbyListBroadcast(
        io: Server<ClientToServerEvents, ServerToClientEvents>,
        lobbies: LobbyInfo[]
    ): void {
        if (this.lobbyListBroadcastTimer) {
            /* update already pending */
            this.pendingLobbyList = lobbies;
            return;
        } else if (!this.pendingLobbyList) {
            /* send update now and schedule update in LOBBY_LIST_DEBOUNCE_MS if updated */
            io.emit('lobby-list', lobbies);
        }

        this.pendingLobbyList = null;
        this.lobbyListBroadcastTimer = setTimeout(() => {
            this.lobbyListBroadcastTimer = null;

            const nextLobbyList = this.pendingLobbyList;
            this.pendingLobbyList = null;
            if (!nextLobbyList) {
                return;
            }

            io.emit('lobby-list', nextLobbyList);
        }, SocketServerGateway.LOBBY_LIST_DEBOUNCE_MS);
    }

    private clearLobbyListBroadcastTimer(): void {
        if (!this.lobbyListBroadcastTimer) {
            return;
        }

        clearTimeout(this.lobbyListBroadcastTimer);
        this.lobbyListBroadcastTimer = null;
        this.pendingLobbyList = null;
    }

    private putClientInGameState(socket: ClientSocket, participation: ClientGameParticipation) {
        this.socketParticipations.set(socket.id, {
            sessionId: participation.session.id,
            participantId: participation.participantId
        });

        socket.join(participation.session.id);
        socket.emit('session-joined', {
            sessionId: participation.session.id,
            session: participation.session,
            participantId: participation.participantId
        });

        if (participation.gameState) {
            socket.emit('game-state', participation.gameState);
        }
    }
}

function getSocketErrorMessage(error: unknown): string {
    if (error instanceof SessionError) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return 'Unexpected server error';
}

function logSocketActionFailure(
    logger: Logger,
    action: string,
    socket: Socket<ClientToServerEvents, ServerToClientEvents>,
    error: unknown,
    extra: Record<string, unknown> = {}
): void {
    if (error instanceof SessionError) {
        logger.warn({
            event: 'socket.action.failed',
            action,
            socketId: socket.id,
            message: error.message,
            ...extra
        }, 'Socket action rejected');
        return;
    }

    logger.error({
        err: error,
        event: 'socket.action.failed',
        action,
        socketId: socket.id,
        ...extra
    }, 'Socket action failed unexpectedly');
}
