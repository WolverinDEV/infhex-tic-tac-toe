import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { injectable } from 'tsyringe';
import type { ClientToServerEvents, ServerToClientEvents } from '@ih3t/shared';
import { BackgroundWorkerHub } from '../background/backgroundWorkers';
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
    constructor(
        private readonly sessionManager: SessionManager,
        private readonly backgroundWorkers: BackgroundWorkerHub,
        private readonly corsConfiguration: CorsConfiguration
    ) {}

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
            rematchUpdated(event: RematchUpdatedEvent) {
                const payload = {
                    sessionId: event.sessionId,
                    canRematch: event.canRematch,
                    requestedPlayerIds: event.requestedPlayerIds
                };

                for (const playerId of event.playerIds) {
                    io.to(playerId).emit('rematch-updated', payload);
                }
            },
            sessionFinished(event: SessionFinishedDomainEvent) {
                io.to(event.sessionId).emit('session-finished', event);
            }
        });

        io.on('connection', (socket) => {
            console.log('Player connected:', socket.id);
            this.backgroundWorkers.track('site-visited', {
                client: getSocketClientInfo(socket)
            });

            socket.emit('sessions-updated', this.sessionManager.listSessions());

            socket.on('join-session', (sessionId: string) => {
                const clientInfo = getSocketClientInfo(socket);

                try {
                    const joinResult = this.sessionManager.joinSession({
                        sessionId,
                        participantId: socket.id,
                        deviceId: clientInfo.deviceId,
                        client: clientInfo
                    });

                    socket.join(sessionId);
                    socket.emit('session-joined', {
                        sessionId,
                        state: joinResult.state,
                        role: joinResult.role,
                        players: joinResult.players
                    });

                    if (joinResult.role === 'player' && joinResult.isNewParticipant) {
                        io.to(sessionId).emit('player-joined', {
                            playerId: socket.id,
                            players: joinResult.players,
                            state: joinResult.state
                        });
                        this.sessionManager.activateSession(sessionId);
                    } else if (joinResult.gameState) {
                        socket.emit('game-state', joinResult.gameState);
                    }

                    console.log(`${joinResult.role === 'player' ? 'Player' : 'Spectator'} ${socket.id} joined session ${sessionId}`);
                } catch (error: unknown) {
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('leave-session', (sessionId: string) => {
                socket.leave(sessionId);
                this.sessionManager.leaveSession(sessionId, socket.id, 'leave-session');
            });

            socket.on('request-rematch', (finishedSessionId: string) => {
                try {
                    const rematch = this.sessionManager.requestRematch(finishedSessionId, socket.id);
                    if (rematch.status !== 'ready') {
                        return;
                    }

                    const playerSockets = rematch.players
                        .map((playerId) => io.sockets.sockets.get(playerId))
                        .filter((playerSocket): playerSocket is Socket<ClientToServerEvents, ServerToClientEvents> => Boolean(playerSocket));

                    if (playerSockets.length !== rematch.players.length) {
                        this.sessionManager.cancelRematch(finishedSessionId);
                        socket.emit('error', 'Your opponent is no longer available for a rematch.');
                        return;
                    }

                    const nextSession = this.sessionManager.createRematchSession(finishedSessionId);
                    for (const playerSocket of playerSockets) {
                        playerSocket.join(nextSession.sessionId);
                        playerSocket.emit('session-joined', {
                            sessionId: nextSession.sessionId,
                            state: nextSession.state,
                            role: 'player',
                            players: nextSession.players
                        });
                    }

                    this.sessionManager.activateSession(nextSession.sessionId);
                } catch (error: unknown) {
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('cancel-rematch', (finishedSessionId: string) => {
                this.sessionManager.cancelRematch(finishedSessionId, socket.id);
            });

            socket.on('place-cell', (data: { sessionId: string; x: number; y: number }) => {
                try {
                    this.sessionManager.placeCell(data.sessionId, socket.id, data.x, data.y);
                } catch (error: unknown) {
                    socket.emit('error', getSocketErrorMessage(error));
                }
            });

            socket.on('disconnect', () => {
                console.log('Player disconnected:', socket.id);
                this.sessionManager.handleDisconnect(socket.id);
            });
        });

        return io;
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
