import type { Server as HttpServer } from 'node:http';

import {
    type AdminBroadcastMessage,
    type ClientToServerEvents,
    DEFAULT_ACCOUNT_PREFERENCES,
    type LobbyInfo,
    type ServerToClientEvents,
    SessionId,
    SessionParticipantRole,
    type SessionClaimWinEvent,
    type SessionUpdatedEvent,
    type TournamentNotificationEvent,
    type TournamentUpdatedEvent,
    zAcceptSessionDrawRequest,
    zCancelRematchRequest,
    zDeclineSessionDrawRequest,
    zJoinSessionRequest,
    zLeaveSessionRequest,
    zPlaceCellRequest,
    zRequestRematchRequest,
    zRequestSessionDrawRequest,
    zSessionChatMessageRequest,
    zSurrenderSessionRequest,
    zWatchSessionRequest,
} from '@ih3t/shared';
import { Mutex } from 'async-mutex';
import type { Logger } from 'pino';
import { Server, type Socket } from 'socket.io';
import { inject, injectable } from 'tsyringe';
import { z, ZodError } from 'zod';

import { ServerShutdownService } from '../admin/serverShutdownService';
import { APP_VERSION_HASH } from '../appVersion';
import { AuthService } from '../auth/authService';
import { ROOT_LOGGER } from '../logger';
import { MetricsTracker } from '../metrics/metricsTracker';
import { SessionError, SessionManager } from '../session/sessionManager';
import { TournamentService } from '../tournament/tournamentService';
import type { ClientGameParticipation } from '../session/types';
import { getSocketClientInfo as parseSocketClientInfo, SocketClientInfo } from './clientInfo';
import { CorsConfiguration } from './cors';

type Participation = {
    sessionId: string,
    participantRole: SessionParticipantRole,
    participantId: string,
};

type ClientSocketData = {
    clientInfo: SocketClientInfo,
    participations: Map<string, Participation>,
}

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, any, ClientSocketData>;

const LOBBY_LIST_DEBOUNCE_MS = 1_000;
const MAX_WATCHED_SESSIONS_PER_SOCKET = 4;

function getProfileRoom(profileId: string) {
    return `profile:${profileId}`;
}

const kEmptyValue = Symbol();
class UpdateDebouncer<T> {
    private pendingTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingValue: T | typeof kEmptyValue = kEmptyValue;

    constructor(private readonly callback: (payload: T) => void) { }

    private pushPendingValue() {
        const value = this.pendingValue;
        if (value === kEmptyValue) {
            return;
        }

        this.pendingValue = kEmptyValue;
        this.callback(value);
    }

    notify(value: T) {
        const wasNull = this.pendingValue === kEmptyValue;
        this.pendingValue = value;

        if (this.pendingTimer) {
            /* update already pending */
            return;
        } else if (wasNull) {
            /*
             * Send update now but aggregate instantanious updates.
             * Set the timer to wait LOBBY_LIST_DEBOUNCE_MS until the next update.
             */
            setTimeout(() => this.pushPendingValue(), 0);
        }

        this.pendingTimer = setTimeout(
            () => {
                this.pendingTimer = null;
                this.pushPendingValue();
            },
            LOBBY_LIST_DEBOUNCE_MS,
        );
    }

    cancel() {
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = null;
        }

        this.pendingValue = kEmptyValue;
    }
}

@injectable()
export class SocketServerGateway {
    private readonly logger: Logger;
    private readonly socketWatchedSessions = new Map<string, Set<string>>();
    private readonly connections = new Map<string, ClientSocket>();
    private lobbyPendingUpdates = new Map<string, UpdateDebouncer<LobbyInfo>>();

    private io?: Server<ClientToServerEvents, ServerToClientEvents>;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(AuthService) private readonly authService: AuthService,
        @inject(ServerShutdownService) private readonly serverShutdownService: ServerShutdownService,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(TournamentService) private readonly tournamentService: TournamentService,
        @inject(MetricsTracker) private readonly metricsTracker: MetricsTracker,
        @inject(CorsConfiguration) private readonly corsConfiguration: CorsConfiguration,
    ) {
        this.logger = rootLogger.child({ component: `socket-server` });
    }

    attach(server: HttpServer) {
        const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, this.corsConfiguration.options ? {
            cors: this.corsConfiguration.options,
        } : undefined);
        this.io = io;

        io.use((socket, next) => {
            try {
                this.assertSocketVersionMatch(socket);
                next();
            } catch (error: unknown) {
                next(error instanceof Error ? error : new Error(`Unexpected server error`));
            }
        });

        this.sessionManager.setEventHandlers({
            lobbyUpdated: (event) => {
                let debouncer = this.lobbyPendingUpdates.get(event.id);
                if (!debouncer) {
                    debouncer = new UpdateDebouncer(event => io.emit(`lobby-updated`, event));
                    this.lobbyPendingUpdates.set(event.id, debouncer);
                }

                debouncer.notify(event);
            },
            lobbyRemoved: (event) => {
                this.lobbyPendingUpdates.get(event.id)?.cancel();
                this.lobbyPendingUpdates.delete(event.id);
                io.emit(`lobby-removed`, event);
            },

            sessionUpdated(event) {
                io.to(event.sessionId).emit(`session-updated`, event);
            },
            sessionChat(event) {
                io.to(event.sessionId).emit(`session-chat`, event);
            },
            gameStateUpdated(event) {
                io.to(event.sessionId).emit(`game-state`, event);
            },
            gameCellPlacement(event) {
                io.to(event.sessionId).emit(`game-cell-place`, event);
            },
        });
        this.tournamentService.setEventHandlers({
            tournamentUpdated: (event) => {
                this.emitTournamentUpdated(event);
            },
            tournamentNotification: (profileId, event) => {
                this.emitTournamentNotification(profileId, event);
            },
            sessionUpdated: (event) => {
                this.emitSessionUpdated(event);
            },
            sessionClaimWin: (event) => {
                this.emitSessionClaimWin(event);
            },
        });
        this.serverShutdownService.setEventHandlers({
            shutdownUpdated(shutdown) {
                io.emit(`shutdown-updated`, shutdown);
            },
        });

        io.on(`connection`, async (socket) => {
            try {
                await this.handleConnection(socket);
            } catch (error: unknown) {
                logSocketActionFailure(this.logger, `connect`, socket, error);
                socket.emit(`error`, getSocketErrorMessage(error));
                socket.disconnect();
                return;
            }
        });
    }

    private async handleConnection(socket: ClientSocket) {
        socket.data = {
            clientInfo: parseSocketClientInfo(socket),
            participations: new Map(),
        };
        const clientInfo = socket.data.clientInfo;
        const authenticatedUser = await this.authService.getUserFromSocket(socket);

        this.logger.debug({
            event: `socket.connected`,
            socketId: socket.id,
            client: clientInfo,
        }, `Socket connected`);

        /* identify the connection and ensure we only have one connection of that client */
        const connectionId = `${clientInfo.deviceId}:${clientInfo.ephemeralClientId}`;
        if (this.connections.has(connectionId)) {
            const oldConnection = this.connections.get(connectionId)!;
            const transferredParticipations = await this.sessionManager.connectionTransfer(oldConnection.id, socket.id);
            for (const participation of transferredParticipations) {
                this.putClientInGameState(socket, participation);
            }
        }

        /* store the connection */
        this.connections.set(`${clientInfo.deviceId}:${clientInfo.ephemeralClientId}`, socket);

        if (authenticatedUser) {
            await socket.join(getProfileRoom(authenticatedUser.id));
        }

        /* reclaim a game by the device id */
        {
            const reclaimedSessions = await this.sessionManager.connectionReclaimFromDeviceId(clientInfo.deviceId ?? ``, socket.id);
            for (const participation of reclaimedSessions) {
                this.putClientInGameState(socket, participation);
            }
        }

        this.metricsTracker.track(`site-visited`, { client: clientInfo });
        socket.emit(`lobby-list`, this.sessionManager.listLobbyInfo());
        socket.emit(`shutdown-updated`, this.serverShutdownService.getShutdownState());

        const participationMutex = new Mutex();
        this.bindSocketHandler(socket, `client-ping`, z.any(), async _request => {
            socket.emit(`server-pong`);
        });

        this.bindSocketHandler(socket, `watch-session`, zWatchSessionRequest, async request => {
            await participationMutex.runExclusive(async () => {
                const snapshot = this.sessionManager.getSessionSnapshot(request.sessionId);
                if (!snapshot) {
                    socket.emit(`session-watch-error`, {
                        sessionId: request.sessionId,
                        message: `session unavailable`,
                    });
                    return;
                }

                if (snapshot.session.state.status !== `in-game`) {
                    socket.emit(`session-watch-error`, {
                        sessionId: request.sessionId,
                        message: `session unavailable`,
                    });
                    return;
                }

                const watchedSessions = this.getOrCreateWatchedSessions(socket.id);
                if (!watchedSessions.has(request.sessionId) && watchedSessions.size >= MAX_WATCHED_SESSIONS_PER_SOCKET) {
                    socket.emit(`session-watch-error`, {
                        sessionId: request.sessionId,
                        message: `You can only watch up to ${MAX_WATCHED_SESSIONS_PER_SOCKET} live matches at once.`,
                    });
                    return;
                }

                watchedSessions.add(request.sessionId);
                await socket.join(request.sessionId);
                socket.emit(`session-watch-started`, snapshot);
            });
        });

        this.bindSocketHandler(socket, `unwatch-session`, zWatchSessionRequest, async request => {
            await participationMutex.runExclusive(async () => {
                const watchedSessions = this.socketWatchedSessions.get(socket.id);
                if (!watchedSessions?.delete(request.sessionId)) {
                    return;
                }

                if (watchedSessions.size === 0) {
                    this.socketWatchedSessions.delete(socket.id);
                }

                if (!socket.data.participations.has(request.sessionId)) {
                    await socket.leave(request.sessionId);
                }
            });
        });

        this.bindSocketHandler(socket, `join-session`, zJoinSessionRequest, async request => {
            await participationMutex.runExclusive(async () => {
                const [existingParticipation] = this.sessionManager.getParticipationsBySocketId(socket.id);
                if (existingParticipation?.session.id === request.sessionId) {
                    const gameParticipation = this.sessionManager.assignParticipantSocket(
                        existingParticipation.session,
                        existingParticipation.participant.id,
                        socket.id,
                    );

                    this.putClientInGameState(socket, gameParticipation);
                    return;
                }

                if (existingParticipation) {
                    throw new SessionError(`Socket already bound to a session`);
                }

                const session = this.sessionManager.requireSession(request.sessionId);
                const user = authenticatedUser ?? await this.authService.getUserFromSocket(socket);
                const preferences = user ? await this.authService.getUserPreferences(user.id) : DEFAULT_ACCOUNT_PREFERENCES;
                const { participant, role } = await this.sessionManager.joinSession(session, {
                    deviceId: clientInfo.deviceId,

                    profile: user,
                    displayName: user?.username ?? `Guest ` + clientInfo.deviceId.replace(/[^a-z0-9]/gi, ``).slice(0, 4)
                        .toUpperCase(),

                    allowSelfJoinCasualGames: preferences.allowSelfJoinCasualGames,
                });

                const gameParticipation = this.sessionManager.assignParticipantSocket(
                    session,
                    participant.id,
                    socket.id,
                );

                this.putClientInGameState(socket, gameParticipation);

                this.logger.info(
                    {
                        event: `socket.joined-session`,
                        socketId: socket.id,

                        sessionId: session.id,
                        participantId: participant.id,
                        role,
                    },
                    `Socket joined session`,
                );
            });
        });

        this.bindSocketHandler(socket, `leave-session`, zLeaveSessionRequest, async ({ sessionId }) => {
            await participationMutex.runExclusive(async () => {
                const participation = socket.data.participations.get(sessionId);
                if (!participation) {
                    return;
                }

                socket.data.participations.delete(sessionId);
                void socket.leave(participation.sessionId);
                if (this.socketWatchedSessions.get(socket.id)?.has(participation.sessionId)) {
                    void socket.join(participation.sessionId);
                }

                const session = this.sessionManager.getSession(participation.sessionId);
                if (session) {
                    await this.sessionManager.leaveSession(
                        session,
                        participation.participantId,
                        `leave-session`,
                    );
                }

                this.logger.info(
                    {
                        event: `socket.left-session`,
                        socketId: socket.id,

                        sessionId: participation.sessionId,
                        participantId: participation.participantId,
                    },
                    `Socket left session`,
                );
            });
        });

        this.bindSocketHandler(socket, `surrender-session`, zSurrenderSessionRequest, async ({ sessionId }) => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, sessionId);
                const session = this.sessionManager.requireSession(sessionId);

                await this.sessionManager.surrenderSession(session, participantId);
            });
        });

        this.bindSocketHandler(socket, `request-session-draw`, zRequestSessionDrawRequest, async ({ sessionId }) => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, sessionId);
                const session = this.sessionManager.requireSession(sessionId);

                await this.sessionManager.requestDraw(session, participantId);
            });
        });

        this.bindSocketHandler(socket, `accept-session-draw`, zAcceptSessionDrawRequest, async ({ sessionId }) => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, sessionId);
                const session = this.sessionManager.requireSession(sessionId);

                await this.sessionManager.acceptDraw(session, participantId);
            });
        });

        this.bindSocketHandler(socket, `decline-session-draw`, zDeclineSessionDrawRequest, async ({ sessionId }) => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, sessionId);
                const session = this.sessionManager.requireSession(sessionId);

                await this.sessionManager.declineDraw(session, participantId);
            });
        });

        this.bindSocketHandler(socket, `request-rematch`, zRequestRematchRequest, async ({ sessionId }) => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, sessionId);

                {
                    const session = this.sessionManager.requireSession(sessionId);
                    const rematch = await this.sessionManager.requestRematch(session, participantId);
                    if (rematch.status !== `ready`) {
                        return;
                    }
                }

                const { rematchSession, socketMapping } = await this.sessionManager.createRematchSession(sessionId);
                for (const { participant } of this.sessionManager.getParticipations(rematchSession)) {
                    const socketId = socketMapping[participant.id];
                    if (!socketId) {
                        continue;
                    }

                    const socket = this.io?.sockets.sockets.get(socketId);
                    if (!socket) {
                        continue;
                    }

                    void socket.leave(sessionId);

                    const gameParticipation = this.sessionManager.assignParticipantSocket(
                        rematchSession,
                        participant.id,
                        socketId,
                    );
                    this.putClientInGameState(socket, gameParticipation);
                }
            });
        });

        this.bindSocketHandler(socket, `cancel-rematch`, zCancelRematchRequest, async ({ sessionId }) => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, sessionId);
                const session = this.sessionManager.requireSession(sessionId);

                await this.sessionManager.cancelRematch(session, participantId);
            });
        });

        this.bindSocketHandler(socket, `place-cell`, zPlaceCellRequest, async request => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, request.sessionId);
                const session = this.sessionManager.requireSession(request.sessionId);

                await this.sessionManager.placeCell(session, participantId, request.cell);
            });
        });

        this.bindSocketHandler(socket, `send-session-chat-message`, zSessionChatMessageRequest, async request => {
            await participationMutex.runExclusive(async () => {
                const { participantId } = this.requireParticipation(socket, request.sessionId);
                const session = this.sessionManager.requireSession(request.sessionId);

                this.sessionManager.sendChatMessage(session, participantId, request.message);
            });
        });

        socket.on(`disconnect`, async () => {
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
                event: `socket.disconnected`,
                socketId: socket.id,
            }, `Socket disconnected`);

            await participationMutex.runExclusive(() => {
                this.socketWatchedSessions.delete(socket.id);
                this.sessionManager.handleSocketDisconnect(socket.id);
            });
        });

        socket.emit(`initialized`);
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
            event: `socket.version-mismatch`,
            socketId: socket.id,
            clientVersionHash: clientInfo.versionHash,
            serverVersionHash: APP_VERSION_HASH,
            client: clientInfo,
        }, `Rejected socket connection due to version mismatch`);

        throw new Error(`Client version hash ${clientInfo.versionHash} does not match server version hash ${APP_VERSION_HASH}. Please refresh the page.`);
    }

    public getConnectedClientCount() {
        return this.io?.sockets.sockets.size ?? 0;
    }

    public broadcastAdminMessage(message: string): AdminBroadcastMessage {
        const broadcast: AdminBroadcastMessage = {
            message,
            sentAt: Date.now(),
        };

        this.io?.emit(`admin-message`, broadcast);

        this.logger.info({
            event: `admin.broadcast`,
            sentAt: new Date(broadcast.sentAt).toISOString(),
            messageLength: message.length,
            connectedClients: this.getConnectedClientCount(),
        }, `Broadcasted admin message`);

        return broadcast;
    }

    private getParticipation(socket: ClientSocket, sessionId: SessionId): Participation | undefined {
        return socket.data.participations.get(sessionId);
    }

    private getOrCreateWatchedSessions(socketId: string): Set<string> {
        let watchedSessions = this.socketWatchedSessions.get(socketId);
        if (!watchedSessions) {
            watchedSessions = new Set<string>();
            this.socketWatchedSessions.set(socketId, watchedSessions);
        }

        return watchedSessions;
    }

    private requireParticipation(socket: ClientSocket, sessionId: SessionId): Participation {
        const participation = this.getParticipation(socket, sessionId);
        if (!participation) {
            throw new SessionError(`You are not part of that session`);
        }

        return participation;
    }

    public async shutdownConnections() {
        for (const updater of this.lobbyPendingUpdates.values()) {
            updater.cancel();
        }
        this.lobbyPendingUpdates.clear();
        this.socketWatchedSessions.clear();

        this.io?.emit(`error`, `Server shutdown`);
        await this.io?.close();
    }

    private putClientInGameState(socket: ClientSocket, participation: ClientGameParticipation) {
        socket.data.participations.set(
            participation.session.id,
            {
                sessionId: participation.session.id,
                participantId: participation.participantId,
                participantRole: participation.participantRole
            }
        );

        void socket.join(participation.session.id);
        socket.emit(`session-joined`, {
            session: participation.session,
            gameState: participation.gameState,

            participantId: participation.participantId,
            participantRole: participation.participantRole,
        });
    }

    emitTournamentUpdated(event: TournamentUpdatedEvent) {
        this.io?.emit(`tournament-updated`, event);
    }

    emitTournamentNotification(profileId: string, event: TournamentNotificationEvent) {
        this.io?.to(getProfileRoom(profileId)).emit(`tournament-notification`, event);
    }

    emitSessionUpdated(event: SessionUpdatedEvent) {
        this.io?.to(event.sessionId).emit(`session-updated`, event);
    }

    emitSessionClaimWin(event: SessionClaimWinEvent) {
        this.io?.to(event.sessionId).emit(`session-claim-win`, event);
    }

    private bindSocketHandler<T extends keyof ClientToServerEvents, E = Parameters<ClientToServerEvents[T]>[0]>(
        socket: ClientSocket,
        eventType: T,
        eventSchema: z.ZodType<E>,
        callback: (event: E) => Promise<void>,
    ) {
        socket.on(
            eventType as any,
            (rawEvent: unknown) => {
                let event: E;
                try {
                    event = eventSchema.parse(rawEvent);
                } catch (error: unknown) {
                    logSocketActionFailure(this.logger, `${eventType}:validate`, socket, error, { payload: rawEvent });
                    socket.emit(`error`, getSocketErrorMessage(error));
                    return;
                }

                callback(event).catch(error => {
                    logSocketActionFailure(this.logger, eventType, socket, error, { event });
                    socket.emit(`error`, getSocketErrorMessage(error));
                });
            },
        );
    }
}

function getSocketErrorMessage(error: unknown): string {
    if (error instanceof SessionError) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return `Unexpected server error`;
}

function logSocketActionFailure(
    logger: Logger,
    action: string,
    socket: Socket<ClientToServerEvents, ServerToClientEvents>,
    error: unknown,
    extra: Record<string, unknown> = {},
): void {
    if (error instanceof SessionError || error instanceof ZodError) {
        logger.warn(
            {
                event: `socket.action.failed`,
                action,
                socketId: socket.id,
                message: error.message,
                ...extra,
            },
            `Socket action rejected`,
        );
        return;
    }

    logger.error(
        {
            err: error,
            event: `socket.action.failed`,
            action,
            socketId: socket.id,
            ...extra,
        },
        `Socket action failed unexpectedly`,
    );
}
