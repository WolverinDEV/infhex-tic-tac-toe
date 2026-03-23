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
import { z, ZodError } from 'zod';
import { ServerShutdownService } from '../admin/serverShutdownService';
import { AuthService } from '../auth/authService';
import { ROOT_LOGGER } from '../logger';
import { MetricsTracker } from '../metrics/metricsTracker';
import { getSocketClientInfo as parseSocketClientInfo } from './clientInfo';
import { APP_VERSION_HASH } from '../appVersion';
import { CorsConfiguration } from './cors';
import { SessionError, SessionManager } from '../session/sessionManager';
import type {
    ClientGameParticipation,
    ParticipantJoinedEvent,
    ParticipantLeftEvent,
    PublicGameStatePayload,
    SessionUpdatedEvent,
} from '../session/types';
import { Mutex } from 'async-mutex';

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
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(MetricsTracker) private readonly metricsTracker: MetricsTracker,
        @inject(CorsConfiguration) private readonly corsConfiguration: CorsConfiguration
    ) {
        this.logger = rootLogger.child({ component: 'socket-server' });
    }

    attach(server: HttpServer) {
        const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, this.corsConfiguration.options ? {
            cors: this.corsConfiguration.options
        } : undefined);

        io.use((socket, next) => {
            try {
                this.assertSocketVersionMatch(socket);
                next();
            } catch (error: unknown) {
                next(error instanceof Error ? error : new Error('Unexpected server error'));
            }
        });

        this.sessionManager.setEventHandlers({
            lobbyListUpdated: (lobbies) => {
                this.scheduleLobbyListBroadcast(io, lobbies);
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
        this.serverShutdownService.setEventHandlers({
            shutdownUpdated(shutdown) {
                io.emit('shutdown-updated', shutdown);
            }
        });

        io.on('connection', (socket) => {
            try {
                this.handleConnection(socket);
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, 'connect', socket, error);
                socket.emit('error', getSocketErrorMessage(error));
                socket.disconnect();
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
            const reclaimedParticipation = this.sessionManager.participantTransferConnection(oldConnection.id, socket.id);
            if (reclaimedParticipation) {
                this.putClientInGameState(socket, reclaimedParticipation)
            }
        }

        /* store the connection */
        this.connections.set(`${clientInfo.deviceId}:${clientInfo.ephemeralClientId}`, socket)

        /* reclaim a game by the device id */
        {
            const reclaimedSession = this.sessionManager.participantReclaimSessionFromDeviceId(clientInfo.deviceId ?? "", socket.id);
            if (reclaimedSession) {
                this.putClientInGameState(socket, reclaimedSession);
            }
        }

        this.metricsTracker.track('site-visited', { client: clientInfo });
        socket.emit('lobby-list', this.sessionManager.listLobbyInfo());
        socket.emit('shutdown-updated', this.serverShutdownService.getShutdownState());

        const participationMutex = new Mutex();
        this.bindSocketHandler(socket, "join-session", zJoinSessionRequest, async request => {
            await participationMutex.runExclusive(async () => {
                const existingParticipation = this.sessionManager.findParticipationFromSocketId(socket.id);
                if (existingParticipation?.session.id === request.sessionId) {
                    const gameParticipation = this.sessionManager.assignParticipantSocket(
                        existingParticipation.session,
                        existingParticipation.participant.id,
                        socket.id
                    );

                    this.putClientInGameState(socket, gameParticipation);
                    return;
                }

                if (existingParticipation) {
                    throw new SessionError('Socket already bound to a session');
                }

                const session = this.sessionManager.requireSession(request.sessionId);
                const user = await this.authService.getCurrentUserFromSocket(socket);
                const { participant, role } = await this.sessionManager.joinSession(session, {
                    deviceId: clientInfo.deviceId,

                    profile: user,
                    displayName: user?.username ?? clientInfo.deviceId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()
                });

                const gameParticipation = this.sessionManager.assignParticipantSocket(
                    session,
                    participant.id,
                    socket.id
                );

                this.putClientInGameState(socket, gameParticipation);

                this.logger.info(
                    {
                        event: 'socket.joined-session',
                        socketId: socket.id,

                        sessionId: session.id,
                        participantId: participant.id,
                        role,
                    },
                    'Socket joined session'
                );
            });
        });

        this.bindSocketHandler(socket, "leave-session", z.any(), async () => {
            await participationMutex.runExclusive(() => {
                const participation = this.socketParticipations.get(socket.id);
                if (!participation) {
                    return;
                }

                this.socketParticipations.delete(socket.id);
                socket.leave(participation.sessionId);

                const session = this.sessionManager.getSession(participation.sessionId);
                if (session) {
                    this.sessionManager.leaveSession(
                        session,
                        participation.participantId,
                        'leave-session'
                    );
                }

                this.logger.info(
                    {
                        event: 'socket.left-session',
                        socketId: socket.id,

                        sessionId: participation.sessionId,
                        participantId: participation.participantId,
                    },
                    'Socket left session'
                );
            })
        });

        this.bindSocketHandler(socket, "surrender-session", z.any(), async () => {
            await participationMutex.runExclusive(() => {
                const { sessionId, participantId } = this.requireParticipation(socket.id);
                const session = this.sessionManager.requireSession(sessionId);

                this.sessionManager.surrenderSession(session, participantId);
            });
        });

        this.bindSocketHandler(socket, "request-rematch", z.any(), async () => {
            await participationMutex.runExclusive(() => {
                const { sessionId, participantId } = this.requireParticipation(socket.id);

                {
                    const session = this.sessionManager.requireSession(sessionId);
                    const rematch = this.sessionManager.requestRematch(session, participantId);
                    if (rematch.status !== 'ready') {
                        return;
                    }
                }

                const { rematchSession, socketMapping } = this.sessionManager.createRematchSession(sessionId);
                for (const { participant } of this.sessionManager.getAllParticipations(rematchSession)) {
                    const socketId = socketMapping[participant.id];
                    if (!socketId) {
                        continue
                    }

                    const socket = this.io?.sockets.sockets.get(socketId);
                    if (!socket) {
                        continue
                    }

                    socket.leave(sessionId);

                    const gameParticipation = this.sessionManager.assignParticipantSocket(
                        rematchSession,
                        participant.id,
                        socketId
                    )
                    this.putClientInGameState(socket, gameParticipation);
                }
            });
        });

        this.bindSocketHandler(socket, "cancel-rematch", z.any(), async () => {
            await participationMutex.runExclusive(() => {
                const { sessionId, participantId } = this.requireParticipation(socket.id);
                const session = this.sessionManager.requireSession(sessionId);

                this.sessionManager.cancelRematch(session, participantId);
            });
        });

        this.bindSocketHandler(socket, "place-cell", zPlaceCellRequest, async request => {
            await participationMutex.runExclusive(() => {
                const { sessionId, participantId } = this.requireParticipation(socket.id);
                const session = this.sessionManager.requireSession(sessionId);

                this.sessionManager.placeCell(session, participantId, request.x, request.y);
            });
        });

        socket.on('disconnect', async () => {
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

            await participationMutex.runExclusive(() => {
                this.socketParticipations.delete(socket.id);
                this.sessionManager.handleSocketDisconnect(socket.id);
            });
        });

        socket.emit("initialized");
    }

    private assertSocketVersionMatch(socket: ClientSocket): void {
        if (!APP_VERSION_HASH) {
            /* server in development mode */
            return;
        }

        const clientInfo = parseSocketClientInfo(socket);
        if (clientInfo.versionHash === APP_VERSION_HASH) {
            return;
        }

        this.logger.warn({
            event: 'socket.version-mismatch',
            socketId: socket.id,
            clientVersionHash: clientInfo.versionHash,
            serverVersionHash: APP_VERSION_HASH,
            client: clientInfo
        }, 'Rejected socket connection due to version mismatch');

        throw new Error(
            `Client version hash ${clientInfo.versionHash} does not match server version hash ${APP_VERSION_HASH}. Please refresh the page.`
        );
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

    private bindSocketHandler<T extends keyof ClientToServerEvents, E = Parameters<ClientToServerEvents[T]>[0]>(
        socket: ClientSocket,
        eventType: T,
        eventSchema: z.ZodType<E>,
        callback: (event: E) => Promise<void>
    ) {
        socket.on(
            eventType as any,
            (rawEvent: unknown) => {
                let event: E;
                try {
                    event = eventSchema.parse(rawEvent);
                } catch (error: unknown) {
                    logSocketActionFailure(this.logger, `${eventType}:validate`, socket, error, { payload: rawEvent });
                    socket.emit('error', getSocketErrorMessage(error));
                    return;
                }

                callback(event).catch(error => {
                    logSocketActionFailure(this.logger, eventType, socket, error, { event });
                    socket.emit('error', getSocketErrorMessage(error));
                })
            }
        )
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
    if (error instanceof SessionError || error instanceof ZodError) {
        logger.warn(
            {
                event: 'socket.action.failed',
                action,
                socketId: socket.id,
                message: error.message,
                ...extra
            },
            'Socket action rejected'
        );
        return;
    }

    logger.error(
        {
            err: error,
            event: 'socket.action.failed',
            action,
            socketId: socket.id,
            ...extra
        },
        'Socket action failed unexpectedly'
    );
}
