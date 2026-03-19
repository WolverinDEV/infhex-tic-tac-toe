import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import type { ClientToServerEvents, ServerToClientEvents } from '@ih3t/shared';
import { BackgroundWorkerHub } from '../background/backgroundWorkers';
import { ROOT_LOGGER } from '../logger';
import { getSocketClientInfo } from './clientInfo';
import { CorsConfiguration } from './cors';
import { SessionError, SessionManager } from '../session/sessionManager';
import type {
    JoinSessionResult,
    PlayerJoinedEvent,
    PlayerLeftEvent,
    PublicGameStatePayload,
    RematchUpdatedEvent,
    SessionFinishedDomainEvent,
} from '../session/types';
import { SessionStore } from '../session/sessionStore';
type OrphanedParticipationId = {
    deviceId: string,
    participantId: string,
    timeout: ReturnType<typeof setTimeout>,
}

@injectable()
export class SocketServerGateway {
    private readonly logger: Logger;
    private readonly socketParticipationId = new Map<string, string>();
    private readonly orphanedParticipationIds = new Map<string, OrphanedParticipationId>();

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(SessionStore) private readonly sessionStore: SessionStore,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(BackgroundWorkerHub) private readonly backgroundWorkers: BackgroundWorkerHub,
        @inject(CorsConfiguration) private readonly corsConfiguration: CorsConfiguration
    ) {
        this.logger = rootLogger.child({ component: 'socket-server' });
    }

    attach(server: HttpServer): Server<ClientToServerEvents, ServerToClientEvents> {
        const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, this.corsConfiguration.options ? {
            cors: this.corsConfiguration.options
        } : undefined);

        this.sessionManager.setEventHandlers({
            sessionsUpdated(sessions) {
                io.emit('sessions-updated', sessions);
            },
            gameStateUpdated(payload: PublicGameStatePayload) {
                io.to(payload.sessionId).emit('game-state', payload);
            },
            playerJoined(event: PlayerJoinedEvent) {
                io.to(event.sessionId).emit('player-joined', {
                    playerId: event.playerId,
                    players: event.players,
                    state: event.state
                });
            },
            playerLeft(event: PlayerLeftEvent) {
                io.to(event.sessionId).emit('player-left', {
                    playerId: event.playerId,
                    players: event.players,
                    state: event.state
                });
            },
            rematchUpdated: (event: RematchUpdatedEvent) => {
                const payload = {
                    sessionId: event.sessionId,
                    canRematch: event.canRematch,
                    requestedPlayerIds: event.requestedPlayerIds
                };

                for (const playerId of event.playerIds) {
                    const playerSocket = this.getSocketForSessionParticipant(io, playerId);
                    playerSocket?.emit('rematch-updated', payload);
                }
            },
            sessionFinished(event: SessionFinishedDomainEvent) {
                io.to(event.sessionId).emit('session-finished', event);
            }
        });

        io.on('connection', (socket) => {
            const clientInfo = getSocketClientInfo(socket);
            const existingParticipantInfo = clientInfo.deviceId ? this.orphanedParticipationIds.get(clientInfo.deviceId) : null;
            if (existingParticipantInfo) {
                clearTimeout(existingParticipantInfo.timeout);
                this.orphanedParticipationIds.delete(existingParticipantInfo.deviceId);

                this.socketParticipationId.set(socket.id, existingParticipantInfo.participantId);

                for (const session of this.sessionStore.findSessionsByParticipant(existingParticipantInfo.participantId)) {
                    try {
                        this.socketJoinSession(socket, session.id);
                    } catch (error: unknown) {
                        logSocketActionFailure(this.logger, 'rejoin-session', socket, error, { sessionId: session.id });
                        socket.emit('error', getSocketErrorMessage(error));
                    }
                }
            } else {
                /* assign a new id */
                const participantId = randomUUID();
                this.socketParticipationId.set(socket.id, participantId);
            }

            const participantId = this.socketParticipationId.get(socket.id)!;
            this.logger.info({
                event: 'socket.connected',
                socketId: socket.id,
                participantId,
                reconnect: Boolean(existingParticipantInfo),
                client: clientInfo
            }, 'Socket connected');

            this.backgroundWorkers.track('site-visited', { client: clientInfo });
            socket.emit('sessions-updated', this.sessionManager.listSessions());

            socket.on('join-session', (sessionId: string) => {
                try {
                    const joinResult = this.socketJoinSession(socket, sessionId);
                    if (joinResult.role === 'player' && joinResult.isNewParticipant) {
                        this.sessionManager.activateSession(sessionId);
                    }

                    this.logger.info({
                        event: 'socket.joined-session',
                        socketId: socket.id,
                        sessionId,
                        role: joinResult.role,
                        state: joinResult.state,
                        isNewParticipant: joinResult.isNewParticipant
                    }, 'Socket joined session');
                } catch (error: unknown) {
                    logSocketActionFailure(this.logger, 'join-session', socket, error, { sessionId });
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('leave-session', (sessionId: string) => {
                socket.leave(sessionId);
                this.sessionManager.leaveSession(sessionId, participantId, 'leave-session');
            });

            socket.on('request-rematch', (finishedSessionId: string) => {
                try {
                    const rematch = this.sessionManager.requestRematch(finishedSessionId, participantId);
                    if (rematch.status !== 'ready') {
                        return;
                    }

                    const playerConnections: Array<{
                        playerId: string;
                        socket: Socket<ClientToServerEvents, ServerToClientEvents>;
                    }> = [];
                    for (const playerId of rematch.players) {
                        const playerSocket = this.getSocketForSessionParticipant(io, playerId);
                        if (!playerSocket) {
                            this.sessionManager.cancelRematch(finishedSessionId);
                            socket.emit('error', 'Your opponent is no longer available for a rematch.');
                            return;
                        }

                        playerConnections.push({
                            playerId,
                            socket: playerSocket
                        });
                    }

                    const nextSession = this.sessionManager.createRematchSession(finishedSessionId);
                    for (const playerConnection of playerConnections) {
                        playerConnection.socket.join(nextSession.sessionId);
                        playerConnection.socket.emit('session-joined', {
                            sessionId: nextSession.sessionId,
                            state: nextSession.state,
                            role: 'player',
                            players: nextSession.players,
                            participantId: playerConnection.playerId
                        });
                    }

                    this.sessionManager.activateSession(nextSession.sessionId);
                } catch (error: unknown) {
                    logSocketActionFailure(this.logger, 'request-rematch', socket, error, { finishedSessionId });
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('cancel-rematch', (finishedSessionId: string) => {
                try {
                    this.sessionManager.cancelRematch(finishedSessionId, participantId);
                } catch (error: unknown) {
                    logSocketActionFailure(this.logger, 'cancel-rematch', socket, error, { finishedSessionId });
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('place-cell', (data: { sessionId: string; x: number; y: number }) => {
                try {
                    this.sessionManager.placeCell(data.sessionId, participantId, data.x, data.y);
                } catch (error: unknown) {
                    logSocketActionFailure(this.logger, 'place-cell', socket, error, {
                        sessionId: data.sessionId,
                        x: data.x,
                        y: data.y
                    });
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('disconnect', () => {
                this.logger.info({
                    event: 'socket.disconnected',
                    socketId: socket.id
                }, 'Socket disconnected');

                this.socketParticipationId.delete(socket.id);

                const deviceId = clientInfo.deviceId;
                if (deviceId && !this.orphanedParticipationIds.has(deviceId)) {
                    this.orphanedParticipationIds.set(deviceId, {
                        deviceId,
                        participantId,
                        timeout: setTimeout(() => {
                            this.orphanedParticipationIds.delete(deviceId);
                            this.sessionManager.handleDisconnect(participantId, true);
                        }, 15_000)
                    });

                    this.sessionManager.handleDisconnect(participantId, false);
                } else {
                    this.sessionManager.handleDisconnect(participantId, true);
                }
            });
        });

        return io;
    }

    private getParticipantId(socketId: string): string | undefined {
        return this.socketParticipationId.get(socketId);
    }

    private requireParticipantId(socketId: string): string {
        const participantId = this.getParticipantId(socketId);
        if (!participantId) {
            throw new SessionError('You are not part of this session');
        }

        return participantId;
    }

    private getSocketForSessionParticipant(
        io: Server<ClientToServerEvents, ServerToClientEvents>,
        participantId: string
    ): Socket<ClientToServerEvents, ServerToClientEvents> | null {
        for (const [socketId, socketParticipantId] of this.socketParticipationId.entries()) {
            if (socketParticipantId !== participantId) {
                continue
            }

            return io.sockets.sockets.get(socketId) ?? null;
        }

        return null;
    }

    private socketJoinSession(socket: Socket<ClientToServerEvents, ServerToClientEvents>, sessionId: string): JoinSessionResult {
        const participantId = this.requireParticipantId(socket.id);

        const joinResult = this.sessionManager.joinSession({
            sessionId,
            participantId,
            client: getSocketClientInfo(socket),
        });

        socket.join(sessionId);
        socket.emit('session-joined', {
            sessionId,
            state: joinResult.state,
            role: joinResult.role,
            players: joinResult.players,
            participantId
        });

        if (joinResult.gameState) {
            socket.emit('game-state', joinResult.gameState);
        }

        return joinResult;
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
