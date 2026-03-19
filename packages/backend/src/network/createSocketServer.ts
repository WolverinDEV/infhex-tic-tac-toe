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
    PlayerLeftEvent,
    PublicGameStatePayload,
    RematchUpdatedEvent,
    SessionFinishedDomainEvent,
} from '../session/types';

@injectable()
export class SocketServerGateway {
    private readonly logger: Logger;
    private readonly sessionParticipantsBySocketId = new Map<string, Map<string, string>>();
    private readonly socketIdsBySessionParticipantId = new Map<string, Map<string, string>>();

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
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
                    const playerSocket = this.getSocketForSessionParticipant(io, event.sessionId, playerId);
                    playerSocket?.emit('rematch-updated', payload);
                }
            },
            sessionFinished(event: SessionFinishedDomainEvent) {
                io.to(event.sessionId).emit('session-finished', event);
            }
        });

        io.on('connection', (socket) => {
            this.logger.info({
                event: 'socket.connected',
                socketId: socket.id
            }, 'Socket connected');
            this.backgroundWorkers.track('site-visited', {
                client: getSocketClientInfo(socket)
            });

            socket.emit('sessions-updated', this.sessionManager.listSessions());

            socket.on('join-session', (sessionId: string) => {
                const clientInfo = getSocketClientInfo(socket);
                const participantId = this.getSessionParticipantId(socket.id, sessionId) ?? randomUUID();

                try {
                    const joinResult = this.sessionManager.joinSession({
                        sessionId,
                        participantId,
                        deviceId: clientInfo.deviceId,
                        client: clientInfo
                    });

                    this.bindSessionParticipant(socket.id, sessionId, participantId);
                    socket.join(sessionId);
                    socket.emit('session-joined', {
                        sessionId,
                        state: joinResult.state,
                        role: joinResult.role,
                        players: joinResult.players,
                        participantId
                    });

                    if (joinResult.role === 'player' && joinResult.isNewParticipant) {
                        io.to(sessionId).emit('player-joined', {
                            playerId: participantId,
                            players: joinResult.players,
                            state: joinResult.state
                        });
                        this.sessionManager.activateSession(sessionId);
                    } else if (joinResult.gameState) {
                        socket.emit('game-state', joinResult.gameState);
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
                const participantId = this.releaseSessionParticipant(socket.id, sessionId);
                socket.leave(sessionId);
                if (!participantId) {
                    return;
                }

                this.sessionManager.leaveSession(sessionId, participantId, 'leave-session');
            });

            socket.on('request-rematch', (finishedSessionId: string) => {
                try {
                    const participantId = this.requireSessionParticipantId(socket.id, finishedSessionId);
                    const rematch = this.sessionManager.requestRematch(finishedSessionId, participantId);
                    if (rematch.status !== 'ready') {
                        return;
                    }

                    const playerConnections: Array<{
                        playerId: string;
                        socket: Socket<ClientToServerEvents, ServerToClientEvents>;
                    }> = [];
                    for (const playerId of rematch.players) {
                        const playerSocket = this.getSocketForSessionParticipant(io, finishedSessionId, playerId);
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
                        this.bindSessionParticipant(playerConnection.socket.id, nextSession.sessionId, playerConnection.playerId);
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
                    const participantId = this.requireSessionParticipantId(socket.id, finishedSessionId);
                    this.sessionManager.cancelRematch(finishedSessionId, participantId);
                } catch (error: unknown) {
                    logSocketActionFailure(this.logger, 'cancel-rematch', socket, error, { finishedSessionId });
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('place-cell', (data: { sessionId: string; x: number; y: number }) => {
                try {
                    const participantId = this.requireSessionParticipantId(socket.id, data.sessionId);
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
                const participantIds = new Set(
                    this.releaseSocketParticipants(socket.id).map(({ participantId }) => participantId)
                );
                for (const participantId of participantIds) {
                    this.sessionManager.handleDisconnect(participantId);
                }
            });
        });

        return io;
    }

    private getSessionParticipantId(socketId: string, sessionId: string): string | undefined {
        return this.sessionParticipantsBySocketId.get(socketId)?.get(sessionId);
    }

    private requireSessionParticipantId(socketId: string, sessionId: string): string {
        const participantId = this.getSessionParticipantId(socketId, sessionId);
        if (!participantId) {
            throw new SessionError('You are not part of this session');
        }

        return participantId;
    }

    private bindSessionParticipant(socketId: string, sessionId: string, participantId: string): void {
        let sessionParticipants = this.sessionParticipantsBySocketId.get(socketId);
        if (!sessionParticipants) {
            sessionParticipants = new Map<string, string>();
            this.sessionParticipantsBySocketId.set(socketId, sessionParticipants);
        }
        sessionParticipants.set(sessionId, participantId);

        let participantSockets = this.socketIdsBySessionParticipantId.get(sessionId);
        if (!participantSockets) {
            participantSockets = new Map<string, string>();
            this.socketIdsBySessionParticipantId.set(sessionId, participantSockets);
        }
        participantSockets.set(participantId, socketId);
    }

    private releaseSessionParticipant(socketId: string, sessionId: string): string | undefined {
        const sessionParticipants = this.sessionParticipantsBySocketId.get(socketId);
        const participantId = sessionParticipants?.get(sessionId);
        if (!participantId) {
            return undefined;
        }

        sessionParticipants?.delete(sessionId);
        if (sessionParticipants && sessionParticipants.size === 0) {
            this.sessionParticipantsBySocketId.delete(socketId);
        }

        const participantSockets = this.socketIdsBySessionParticipantId.get(sessionId);
        if (participantSockets?.get(participantId) === socketId) {
            participantSockets.delete(participantId);
            if (participantSockets.size === 0) {
                this.socketIdsBySessionParticipantId.delete(sessionId);
            }
        }

        return participantId;
    }

    private releaseSocketParticipants(socketId: string): Array<{ sessionId: string; participantId: string }> {
        const sessionParticipants = this.sessionParticipantsBySocketId.get(socketId);
        if (!sessionParticipants) {
            return [];
        }

        const releasedParticipants = Array.from(sessionParticipants.entries()).map(([sessionId, participantId]) => ({
            sessionId,
            participantId
        }));

        this.sessionParticipantsBySocketId.delete(socketId);
        for (const releasedParticipant of releasedParticipants) {
            const participantSockets = this.socketIdsBySessionParticipantId.get(releasedParticipant.sessionId);
            if (participantSockets?.get(releasedParticipant.participantId) === socketId) {
                participantSockets.delete(releasedParticipant.participantId);
                if (participantSockets.size === 0) {
                    this.socketIdsBySessionParticipantId.delete(releasedParticipant.sessionId);
                }
            }
        }

        return releasedParticipants;
    }

    private getSocketForSessionParticipant(
        io: Server<ClientToServerEvents, ServerToClientEvents>,
        sessionId: string,
        participantId: string
    ): Socket<ClientToServerEvents, ServerToClientEvents> | null {
        const socketId = this.socketIdsBySessionParticipantId.get(sessionId)?.get(participantId);
        if (!socketId) {
            return null;
        }

        return io.sockets.sockets.get(socketId) ?? null;
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
