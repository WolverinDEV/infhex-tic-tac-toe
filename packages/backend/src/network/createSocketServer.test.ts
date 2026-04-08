import 'reflect-metadata';

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
    createEmptyGameState,
    type GameState,
    type LobbyInfo,
    type ServerToClientEvents,
    type SessionInfo,
    type SessionId,
    type SessionUpdatedEvent,
    zCellOccupant,
} from '@ih3t/shared';
import pino from 'pino';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

import { SocketServerGateway } from './createSocketServer';

type FakePlayer = SessionInfo[`players`][number];
type FakeSpectator = SessionInfo[`spectators`][number] & {
    socketId: string | null
};

type FakeSession = {
    id: SessionId
    gameState: GameState
    gameOptions: SessionInfo[`gameOptions`]
    players: FakePlayer[]
    spectators: FakeSpectator[]
    chat: SessionInfo[`chat`]
    tournament: SessionInfo[`tournament`]
    state: SessionInfo[`state`]
};

type FakeParticipation = {
    session: FakeSession
    participant: FakePlayer | FakeSpectator
    role: `player` | `spectator`
};

function isFakePlayer(participant: FakePlayer | FakeSpectator): participant is FakePlayer {
    return `connection` in participant;
}

function isFakeSpectator(participant: FakePlayer | FakeSpectator): participant is FakeSpectator {
    return `socketId` in participant;
}

class FakeSessionManager {
    private eventHandlers: {
        sessionUpdated?: (event: SessionUpdatedEvent) => void
        gameStateUpdated?: (event: { sessionId: string; gameState: Partial<GameState> }) => void
    } = {};

    readonly sessions = new Map<string, FakeSession>();
    readonly socketParticipations = new Map<string, FakeParticipation>();

    setEventHandlers(eventHandlers: typeof this.eventHandlers) {
        this.eventHandlers = eventHandlers;
    }

    listLobbyInfo(): LobbyInfo[] {
        return [];
    }

    getParticipationsBySocketId(socketId: string) {
        const participation = this.socketParticipations.get(socketId);
        return participation ? [participation] : [];
    }

    async connectionTransfer(): Promise<[]> {
        return [];
    }

    async connectionReclaimFromDeviceId(): Promise<[]> {
        return [];
    }

    getSessionSnapshot(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        return {
            session: structuredClone(this.toSessionInfo(session)),
            gameState: structuredClone(session.gameState),
        };
    }

    findParticipationFromSocketId(socketId: string) {
        const participation = this.socketParticipations.get(socketId);
        if (!participation) {
            return null;
        }

        return {
            session: participation.session,
            participant: participation.participant,
            role: participation.role,
        };
    }

    requireSession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found`);
        }

        return session;
    }

    async joinSession(session: FakeSession, _params: unknown) {
        const participant: FakePlayer = {
            id: `${session.id}-player-${session.players.length + 1}`,
            displayName: `Guest`,
            profileId: null,
            rating: { eloScore: 1000, gameCount: 0 },
            ratingAdjustment: null,
            connection: { status: `disconnected` },
        };

        session.players.push(participant);
        return {
            participant,
            role: `player` as const,
        };
    }

    assignParticipantSocket(session: FakeSession, participantId: string, socketId: string) {
        const participant = session.players.find((entry) => entry.id === participantId)
            ?? session.spectators.find((entry) => entry.id === participantId);
        assert.ok(participant, `Expected participant ${participantId} in session ${session.id}.`);

        const role = session.players.some((entry) => entry.id === participantId) ? `player` : `spectator`;
        if (role === `player`) {
            assert.ok(isFakePlayer(participant));
            participant.connection = { status: `connected` };
        } else {
            assert.ok(isFakeSpectator(participant));
            participant.socketId = socketId;
        }
        this.socketParticipations.set(socketId, { session, participant, role });

        return {
            session: this.toSessionInfo(session),
            gameState: structuredClone(session.gameState),
            participantId,
            participantRole: role,
        };
    }

    getSession(sessionId: string) {
        return this.sessions.get(sessionId) ?? null;
    }

    async leaveSession(_session: FakeSession, participantId: string) {
        for (const [socketId, participation] of this.socketParticipations.entries()) {
            if (participation.participant.id === participantId) {
                if (participation.role === `player`) {
                    assert.ok(isFakePlayer(participation.participant));
                    participation.participant.connection = { status: `disconnected` };
                } else {
                    assert.ok(isFakeSpectator(participation.participant));
                    participation.participant.socketId = null;
                }
                this.socketParticipations.delete(socketId);
            }
        }
    }

    handleSocketDisconnect(socketId: string) {
        const participation = this.socketParticipations.get(socketId);
        if (participation) {
            if (participation.role === `player`) {
                assert.ok(isFakePlayer(participation.participant));
                participation.participant.connection = { status: `disconnected` };
            } else {
                assert.ok(isFakeSpectator(participation.participant));
                participation.participant.socketId = null;
            }
        }

        this.socketParticipations.delete(socketId);
    }

    async surrenderSession(): Promise<void> { }

    async requestDraw(): Promise<void> { }

    async acceptDraw(): Promise<void> { }

    async declineDraw(): Promise<void> { }

    async requestRematch() {
        return { status: `pending` as const };
    }

    async createRematchSession() {
        throw new Error(`not implemented`);
    }

    async cancelRematch(): Promise<void> { }

    async placeCell(): Promise<void> { }

    sendChatMessage(): void { }

    emitSessionUpdate(sessionId: SessionId, session: SessionUpdatedEvent[`session`]) {
        this.eventHandlers.sessionUpdated?.({
            sessionId,
            session,
        });
    }

    emitGameState(sessionId: SessionId, gameState: Partial<GameState>) {
        this.eventHandlers.gameStateUpdated?.({
            sessionId,
            gameState,
        });
    }

    private toSessionInfo(session: FakeSession): SessionInfo {
        return {
            id: session.id,
            gameOptions: structuredClone(session.gameOptions),
            players: structuredClone(session.players),
            spectators: session.spectators.map(({ socketId: _socketId, ...spectator }) => structuredClone(spectator)),
            chat: structuredClone(session.chat),
            state: structuredClone(session.state),
            tournament: session.tournament ? structuredClone(session.tournament) : null,
        };
    }
}

class FakeAuthService {
    async getUserFromSocket(): Promise<null> {
        return null;
    }

    async getUserPreferences(): Promise<never> {
        throw new Error(`not implemented`);
    }
}

class FakeServerShutdownService {
    setEventHandlers(): void { }

    getShutdownState() {
        return null;
    }
}

class FakeMetricsTracker {
    track(): void { }
}

class FakeTournamentService {
    setEventHandlers(): void { }
}

class FakeCorsConfiguration {
    options = undefined;
}

function createParticipant(id: string, displayName: string): FakePlayer {
    return {
        id,
        displayName,
        profileId: id,
        rating: { eloScore: 1000, gameCount: 0 },
        ratingAdjustment: null,
        connection: { status: `connected` },
    };
}

function createFakeSession(sessionId: string, status: SessionInfo[`state`][`status`]): FakeSession {
    return {
        id: sessionId as SessionId,
        gameState: createEmptyGameState(),
        gameOptions: {
            visibility: `public`,
            rated: false,
            timeControl: { mode: `unlimited` },
            firstPlayer: `random`,
        },
        players: [
            createParticipant(`${sessionId}-left`, `Alpha ${sessionId}`),
            createParticipant(`${sessionId}-right`, `Bravo ${sessionId}`),
        ],
        spectators: [],
        chat: {
            messages: [],
            displayNames: {},
        },
        tournament: null,
        state: status === `in-game`
            ? {
                status,
                startedAt: 1_700_000_000_000,
                gameId: `${sessionId}-game`,
                drawRequest: null,
                drawRequestAvailableAfterTurn: 50,
            }
            : status === `finished`
                ? {
                    status,
                    gameId: `${sessionId}-game`,
                    finishReason: `six-in-a-row`,
                    winningPlayerId: `${sessionId}-left`,
                    rematchAcceptedPlayerIds: [],
                }
                : {
                    status,
                },
    };
}

async function waitForEvent<T>(
    socket: ClientSocket<ServerToClientEvents>,
    eventName: keyof ServerToClientEvents,
    timeoutMs = 2_000,
): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
            socket.off(eventName as any, handleEvent);
            reject(new Error(`Timed out waiting for ${String(eventName)}`));
        }, timeoutMs);

        const handleEvent = (event: T) => {
            clearTimeout(timeout);
            socket.off(eventName as any, handleEvent);
            resolve(event);
        };

        socket.on(eventName as any, handleEvent);
    });
}

async function expectNoMatchingEvent<T>(
    socket: ClientSocket<ServerToClientEvents>,
    eventName: keyof ServerToClientEvents,
    predicate: (event: T) => boolean,
    waitMs = 250,
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const handleEvent = (event: T) => {
            if (!predicate(event)) {
                return;
            }

            clearTimeout(timeout);
            socket.off(eventName as any, handleEvent);
            reject(new Error(`Unexpected ${String(eventName)} event.`));
        };

        const timeout = setTimeout(() => {
            socket.off(eventName as any, handleEvent);
            resolve();
        }, waitMs);

        socket.on(eventName as any, handleEvent);
    });
}

async function createHarness() {
    const sessionManager = new FakeSessionManager();
    const gateway = new SocketServerGateway(
        pino({ level: `silent` }) as never,
        new FakeAuthService() as never,
        new FakeServerShutdownService() as never,
        sessionManager as never,
        new FakeTournamentService() as never,
        new FakeMetricsTracker() as never,
        new FakeCorsConfiguration() as never,
    );

    const server = createServer();
    gateway.attach(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const address = server.address();
    assert.ok(address && typeof address === `object`, `Expected an address for the test server.`);
    const baseUrl = `http://127.0.0.1:${address.port}`;

    async function connectSocket() {
        const socket = createClient(baseUrl, {
            transports: [`websocket`],
            forceNew: true,
            autoConnect: false,
            auth: {
                deviceId: crypto.randomUUID(),
                ephemeralClientId: crypto.randomUUID(),
                versionHash: `test`,
            },
        });

        const initializedPromise = waitForEvent(socket, `initialized`);
        socket.connect();
        await initializedPromise;
        return socket;
    }

    async function close() {
        await gateway.shutdownConnections();
        if (!server.listening) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error && (error as NodeJS.ErrnoException).code !== `ERR_SERVER_NOT_RUNNING`) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }

    return {
        connectSocket,
        close,
        sessionManager,
    };
}

test(`watch-session returns an initial live snapshot without creating spectator records`, async () => {
    const harness = await createHarness();
    try {
        const liveSession = createFakeSession(`live-1`, `in-game`);
        liveSession.gameState.cells.push({
            x: 0,
            y: 0,
            occupiedBy: zCellOccupant.parse(liveSession.players[0].id),
        });
        harness.sessionManager.sessions.set(liveSession.id, liveSession);

        const socket = await harness.connectSocket();
        try {
            socket.emit(`watch-session`, { sessionId: liveSession.id });

            const payload = await waitForEvent<{
                session: SessionInfo
                gameState: GameState
            }>(socket, `session-watch-started`);

            assert.equal(payload.session.id, liveSession.id);
            assert.equal(payload.session.state.status, `in-game`);
            assert.equal(payload.gameState.cells.length, 1);
            assert.equal(harness.sessionManager.sessions.get(liveSession.id)?.spectators.length, 0);
        } finally {
            socket.close();
        }
    } finally {
        await harness.close();
    }
});

test(`watch-session can follow multiple rooms and unwatch stops further updates`, async () => {
    const harness = await createHarness();
    try {
        const liveSessionA = createFakeSession(`live-a`, `in-game`);
        const liveSessionB = createFakeSession(`live-b`, `in-game`);
        harness.sessionManager.sessions.set(liveSessionA.id, liveSessionA);
        harness.sessionManager.sessions.set(liveSessionB.id, liveSessionB);

        const socket = await harness.connectSocket();
        try {
            socket.emit(`watch-session`, { sessionId: liveSessionA.id });
            await waitForEvent(socket, `session-watch-started`);

            socket.emit(`watch-session`, { sessionId: liveSessionB.id });
            await waitForEvent(socket, `session-watch-started`);

            const sessionUpdatePromise = waitForEvent<SessionUpdatedEvent>(socket, `session-updated`);
            const gameStatePromise = waitForEvent<{ sessionId: string; gameState: Partial<GameState> }>(socket, `game-state`);

            harness.sessionManager.emitSessionUpdate(liveSessionA.id, {
                tournament: {
                    tournamentId: `tournament-1`,
                    tournamentName: `Spring Major`,
                    matchId: `match-1`,
                    bracket: `winners`,
                    round: 1,
                    order: 1,
                    bestOf: 3,
                    currentGameNumber: 1,
                    leftWins: 0,
                    rightWins: 0,
                    matchJoinTimeoutMs: 300_000,
                    matchExtensionMs: 300_000,
                    matchStartedAt: 1_700_000_000_000,
                    leftDisplayName: `Alpha`,
                    rightDisplayName: `Bravo`,
                },
            });
            harness.sessionManager.emitGameState(liveSessionB.id, {
                cells: [
                    {
                        x: 1,
                        y: 0,
                        occupiedBy: zCellOccupant.parse(liveSessionB.players[1].id),
                    },
                ],
            });

            const sessionUpdate = await sessionUpdatePromise;
            const gameState = await gameStatePromise;
            assert.equal(sessionUpdate.sessionId, liveSessionA.id);
            assert.equal(gameState.sessionId, liveSessionB.id);

            socket.emit(`unwatch-session`, { sessionId: liveSessionA.id });
            await new Promise((resolve) => setTimeout(resolve, 50));

            harness.sessionManager.emitSessionUpdate(liveSessionA.id, {
                chat: {
                    displayNames: {},
                    messages: [],
                },
            });
            await expectNoMatchingEvent<SessionUpdatedEvent>(
                socket,
                `session-updated`,
                event => event.sessionId === liveSessionA.id,
            );
        } finally {
            socket.close();
        }
    } finally {
        await harness.close();
    }
});

test(`watch-session rejects missing and non-live sessions`, async () => {
    const harness = await createHarness();
    try {
        harness.sessionManager.sessions.set(`lobby-1`, createFakeSession(`lobby-1`, `lobby`));

        const socket = await harness.connectSocket();
        try {
            socket.emit(`watch-session`, { sessionId: `missing` });
            const missingError = await waitForEvent<{ sessionId: string; message: string }>(socket, `session-watch-error`);
            assert.deepEqual(missingError, {
                sessionId: `missing`,
                message: `session unavailable`,
            });

            socket.emit(`watch-session`, { sessionId: `lobby-1` });
            const lobbyError = await waitForEvent<{ sessionId: string; message: string }>(socket, `session-watch-error`);
            assert.equal(lobbyError.sessionId, `lobby-1`);
            assert.equal(lobbyError.message, `session unavailable`);
        } finally {
            socket.close();
        }
    } finally {
        await harness.close();
    }
});

test(`watch-session enforces the four-session cap`, async () => {
    const harness = await createHarness();
    try {
        const sessionIds = [`live-1`, `live-2`, `live-3`, `live-4`, `live-5`];
        for (const sessionId of sessionIds) {
            harness.sessionManager.sessions.set(sessionId, createFakeSession(sessionId, `in-game`));
        }

        const socket = await harness.connectSocket();
        try {
            for (const sessionId of sessionIds.slice(0, 4)) {
                socket.emit(`watch-session`, { sessionId });
                const started = await waitForEvent<{ session: SessionInfo }>(socket, `session-watch-started`);
                assert.equal(started.session.id, sessionId);
            }

            socket.emit(`watch-session`, { sessionId: `live-5` });
            const error = await waitForEvent<{ sessionId: string; message: string }>(socket, `session-watch-error`);
            assert.equal(error.sessionId, `live-5`);
            assert.equal(error.message, `You can only watch up to 4 live matches at once.`);
        } finally {
            socket.close();
        }
    } finally {
        await harness.close();
    }
});

test(`watch-session does not consume the active join-session slot`, async () => {
    const harness = await createHarness();
    try {
        harness.sessionManager.sessions.set(`live-1`, createFakeSession(`live-1`, `in-game`));
        harness.sessionManager.sessions.set(`lobby-1`, createFakeSession(`lobby-1`, `lobby`));

        const socket = await harness.connectSocket();
        try {
            socket.emit(`watch-session`, { sessionId: `live-1` });
            await waitForEvent(socket, `session-watch-started`);

            socket.emit(`join-session`, { sessionId: `lobby-1` });
            const joined = await waitForEvent<{
                session: SessionInfo
                participantRole: `player` | `spectator`
            }>(socket, `session-joined`);

            assert.equal(joined.session.id, `lobby-1`);
            assert.equal(joined.participantRole, `player`);
        } finally {
            socket.close();
        }
    } finally {
        await harness.close();
    }
});
