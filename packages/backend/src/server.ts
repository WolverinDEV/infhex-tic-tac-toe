import './env';
import express, { type Request } from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { Server, type Socket } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { closeMetricLogger, logMetric } from './metrics';
import {
    BoardCell,
    GameSession,
    CreateSessionResponse,
    SessionFinishReason,
    SessionInfo,
    ServerToClientEvents,
    ClientToServerEvents,
} from '@ih3t/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDistPath = join(__dirname, '../../frontend/dist');

const app = express();
app.set('trust proxy', true);
const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = new Set(configuredOrigins);

if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://127.0.0.1:5173');
}

const corsOptions: cors.CorsOptions | null = allowedOrigins.size > 0 ? {
    origin(origin, callback) {
        // Allow non-browser requests and configured dev origins.
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Device-Id'],
    credentials: true
} : null;

// CORS middleware for API requests
if (corsOptions) {
    app.use(cors(corsOptions));
}

const server = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, corsOptions ? {
    cors: corsOptions
} : undefined);

interface StoredGameSession extends GameSession {
    createdAt: number;
    startedAt: number | null;
    playerDeviceIds: Record<string, string | null>;
}

type PlayerLeaveSource = 'leave-session' | 'disconnect';

const gameSessions = new Map<string, StoredGameSession>();
const turnTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const TURN_TIMEOUT_MS = 45_000;

function getHeaderValue(value: string | string[] | undefined): string | null {
    if (typeof value === 'string') {
        return value;
    }

    return value?.[0] ?? null;
}

function getRequestClientInfo(request: Request) {
    const deviceId = request.get('x-device-id') ?? getCookieValue(request.get('cookie'), 'ih3t_device_id');

    return {
        deviceId,
        ip: request.ip ?? null,
        userAgent: request.get('user-agent') ?? null,
        origin: request.get('origin') ?? null,
        referer: request.get('referer') ?? null
    };
}

function getSocketClientInfo(socket: Socket<ClientToServerEvents, ServerToClientEvents>) {
    const authDeviceId = typeof socket.handshake.auth.deviceId === 'string'
        ? socket.handshake.auth.deviceId
        : null;
    const cookieDeviceId = getCookieValue(getHeaderValue(socket.handshake.headers.cookie), 'ih3t_device_id');

    return {
        deviceId: authDeviceId ?? cookieDeviceId,
        socketId: socket.id,
        ip: socket.handshake.address ?? null,
        userAgent: getHeaderValue(socket.handshake.headers['user-agent']),
        origin: getHeaderValue(socket.handshake.headers.origin),
        referer: getHeaderValue(socket.handshake.headers.referer)
    };
}

function getCookieValue(cookieHeader: string | null | undefined, cookieName: string): string | null {
    if (!cookieHeader) {
        return null;
    }

    const cookiePrefix = `${cookieName}=`;
    const cookie = cookieHeader
        .split(';')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(cookiePrefix));

    if (!cookie) {
        return null;
    }

    try {
        return decodeURIComponent(cookie.slice(cookiePrefix.length));
    } catch {
        return cookie.slice(cookiePrefix.length);
    }
}

function getCellKey(x: number, y: number): string {
    return `${x},${y}`;
}

function getBoardCells(session: GameSession): BoardCell[] {
    return [...session.gameState.cells].sort((a, b) => {
        if (a.y === b.y) {
            return a.x - b.x;
        }

        return a.y - b.y;
    });
}

function countConnectedTiles(
    occupiedCells: Set<string>,
    startX: number,
    startY: number,
    directionX: number,
    directionY: number,
): number {
    let count = 0;
    let currentX = startX + directionX;
    let currentY = startY + directionY;

    while (occupiedCells.has(getCellKey(currentX, currentY))) {
        count += 1;
        currentX += directionX;
        currentY += directionY;
    }

    return count;
}

function hasFiveInARow(session: GameSession, playerId: string, x: number, y: number): boolean {
    const occupiedCells = new Set(
        session.gameState.cells
            .filter((cell) => cell.occupiedBy === playerId)
            .map((cell) => getCellKey(cell.x, cell.y))
    );
    const directions: Array<[number, number]> = [
        [1, 0],
        [0, 1],
        [1, -1]
    ];

    return directions.some(([directionX, directionY]) => {
        const connectedCount =
            1 +
            countConnectedTiles(occupiedCells, x, y, directionX, directionY) +
            countConnectedTiles(occupiedCells, x, y, -directionX, -directionY);

        return connectedCount >= 5;
    });
}

function emitGameState(sessionId: string): void {
    const session = gameSessions.get(sessionId);
    if (!session) {
        return;
    }

    io.to(sessionId).emit('game-state', {
        sessionId,
        sessionState: session.state,
        gameState: {
            cells: getBoardCells(session),
            currentTurnPlayerId: session.gameState.currentTurnPlayerId,
            placementsRemaining: session.gameState.placementsRemaining,
            currentTurnExpiresAt: session.gameState.currentTurnExpiresAt
        }
    });
}

function clearTurnTimeout(sessionId: string): void {
    const timeout = turnTimeouts.get(sessionId);
    if (timeout) {
        clearTimeout(timeout);
        turnTimeouts.delete(sessionId);
    }
}

function setTurn(session: GameSession, playerId: string | null, placementsRemaining: number): void {
    session.gameState.currentTurnPlayerId = playerId;
    session.gameState.placementsRemaining = playerId ? placementsRemaining : 0;
    session.gameState.currentTurnExpiresAt = playerId ? Date.now() + TURN_TIMEOUT_MS : null;
}

function scheduleTurnTimeout(sessionId: string): void {
    clearTurnTimeout(sessionId);

    const session = gameSessions.get(sessionId);
    if (session?.state !== 'ingame' || !session.gameState.currentTurnPlayerId || !session.gameState.currentTurnExpiresAt) {
        return;
    }

    const delay = Math.max(0, session.gameState.currentTurnExpiresAt - Date.now());
    const timeout = setTimeout(() => {
        const activeSession = gameSessions.get(sessionId);
        if (activeSession?.state !== 'ingame' || activeSession.players.length < 2) {
            clearTurnTimeout(sessionId);
            return;
        }

        const timedOutPlayerId = activeSession.gameState.currentTurnPlayerId;
        if (!timedOutPlayerId) {
            clearTurnTimeout(sessionId);
            return;
        }

        const winningPlayerId = activeSession.players.find(playerId => playerId !== timedOutPlayerId) ?? null;
        finishSession(sessionId, 'timeout', winningPlayerId);
    }, delay);

    turnTimeouts.set(sessionId, timeout);
}

function getSessionList(): SessionInfo[] {
    return Array.from(gameSessions.values()).map(session => ({
        id: session.id,
        playerCount: session.players.length,
        maxPlayers: session.maxPlayers,
        state: session.state,
        canJoin: session.state === 'lobby' && session.players.length < session.maxPlayers
    }));
}

function broadcastSessions(): void {
    io.emit('sessions-updated', getSessionList());
}

function updateSessionState(session: StoredGameSession) {
    if (session.players.length === 0) {
        /* No players in session. Deleting session. */
        console.log(`Terminating session ${session.id} (no players)`);
        finishSession(session.id, "terminated", null);
        return
    }

    switch (session.state) {
        case "lobby":
            if (session.players.length < session.maxPlayers) {
                /* waiting for more players */
                return
            }

            session.state = 'ingame';
            session.startedAt = Date.now();

            /* We start with one turn only to omit the first player advantage of placing the first cell in the middle of the board. */
            setTurn(session, session.players[0] ?? null, 1);
            scheduleTurnTimeout(session.id);

            emitGameState(session.id);
            broadcastSessions()

            console.log(`Session ${session.id} started.`);
            break;

        case "ingame":
            break;

        case "finished":
            break;

    }
}

function finishSession(sessionId: string, reason: SessionFinishReason, winningPlayerId: string | null): void {
    const session = gameSessions.get(sessionId);
    if (!session) {
        return;
    }

    const finishedAt = Date.now();
    const finalBoardState = {
        cells: getBoardCells(session),
        currentTurnPlayerId: session.gameState.currentTurnPlayerId,
        placementsRemaining: session.gameState.placementsRemaining,
        currentTurnExpiresAt: session.gameState.currentTurnExpiresAt
    };
    const gameDurationMs = session.startedAt === null ? null : finishedAt - session.startedAt;

    if (session.state !== "finished") {
        session.state = 'finished';
        io.to(sessionId).emit('session-finished', { sessionId, reason, winningPlayerId });
    }

    logMetric('game-finished', {
        sessionId,
        reason,
        winningPlayerId,
        players: [...session.players],
        playerDeviceIds: { ...session.playerDeviceIds },
        boardState: finalBoardState,
        createdAt: new Date(session.createdAt).toISOString(),
        startedAt: session.startedAt === null ? null : new Date(session.startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        gameDurationMs,
        totalLifetimeMs: finishedAt - session.createdAt
    });

    clearTurnTimeout(sessionId);
    gameSessions.delete(sessionId);
    broadcastSessions();

    console.log(`Session ${sessionId} finished (${reason})`)
}

function removePlayerFromSession(session: StoredGameSession, playerId: string, source: PlayerLeaveSource) {
    const playerDeviceId = session.playerDeviceIds[playerId] ?? null;
    session.players = session.players.filter((id: string) => id !== playerId);
    delete session.playerDeviceIds[playerId];

    logMetric('game-left', {
        sessionId: session.id,
        playerId,
        deviceId: playerDeviceId,
        source,
        sessionState: session.state,
        remainingPlayers: [...session.players]
    });

    if (session.state === 'ingame') {
        const [winningPlayerId] = session.players;
        finishSession(session.id, 'disconnect', winningPlayerId ?? null);
        return;
    }

    io.to(session.id).emit('player-left', {
        playerId,
        players: session.players,
        state: session.state
    });
    broadcastSessions();

    updateSessionState(session);
}

// Serve the built frontend from the backend in production containers.
if (process.env.NODE_ENV === 'production' && existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
}

// API routes
app.get('/api/sessions', (_req, res) => {
    res.json(getSessionList());
});

app.post('/api/sessions', express.json(), (req, res) => {
    const sessionId = Math.random().toString(36).substring(2, 8);
    const createdAt = Date.now();

    const session: StoredGameSession = {
        id: sessionId,
        players: [],
        maxPlayers: 2,
        state: 'lobby',
        createdAt,
        startedAt: null,
        playerDeviceIds: {},
        gameState: {
            cells: [],
            currentTurnPlayerId: null,
            placementsRemaining: 0,
            currentTurnExpiresAt: null
        }
    };

    gameSessions.set(sessionId, session);
    broadcastSessions();

    logMetric('game-created', {
        sessionId,
        createdAt: new Date(createdAt).toISOString(),
        client: getRequestClientInfo(req)
    });

    const response: CreateSessionResponse = { sessionId };
    res.json(response);
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    logMetric('site-visited', {
        client: getSocketClientInfo(socket)
    });
    socket.emit('sessions-updated', getSessionList());

    socket.on('join-session', (sessionId: string) => {
        const session = gameSessions.get(sessionId);
        const clientInfo = getSocketClientInfo(socket);
        if (!session) {
            socket.emit('error', 'Session not found');
            return;
        }

        if (session.state !== "lobby") {
            socket.emit('error', 'Session has already started');
            return;
        }

        if (session.players.length >= session.maxPlayers) {
            socket.emit('error', 'Session is full');
            return;
        }

        session.players.push(socket.id);
        session.playerDeviceIds[socket.id] = clientInfo.deviceId;
        socket.join(sessionId);

        /* confirm join for client */
        socket.emit('session-joined', {
            sessionId,
            state: session.state
        });

        /* notify everyone else */
        io.to(sessionId).emit('player-joined', {
            playerId: socket.id,
            players: session.players,
            state: session.state
        });

        broadcastSessions();


        console.log(`Player ${socket.id} joined session ${sessionId}`);
        logMetric('game-joined', {
            sessionId,
            playerId: socket.id,
            players: [...session.players],
            client: clientInfo
        });

        updateSessionState(session);
    });

    socket.on('leave-session', (sessionId: string) => {
        const session = gameSessions.get(sessionId);
        if (session) {
            socket.leave(sessionId);
            removePlayerFromSession(session, socket.id, 'leave-session');
        }
    });

    socket.on('place-cell', (data: { sessionId: string; x: number; y: number }) => {
        const session = gameSessions.get(data.sessionId);
        if (!session) {
            socket.emit('error', 'Session not found');
            return;
        }

        if (session.state !== 'ingame') {
            socket.emit('error', 'Game is not currently active');
            return;
        }

        if (!session.players.includes(socket.id)) {
            socket.emit('error', 'You are not part of this session');
            return;
        }

        if (session.gameState.currentTurnPlayerId !== socket.id) {
            socket.emit('error', 'It is not your turn');
            return;
        }

        if (session.gameState.placementsRemaining <= 0) {
            socket.emit('error', 'No placements remaining this turn');
            return;
        }

        const cellKey = getCellKey(data.x, data.y);
        const isOccupied = session.gameState.cells.some((cell) => getCellKey(cell.x, cell.y) === cellKey);
        if (isOccupied) {
            socket.emit('error', 'Cell is already occupied');
            return;
        }

        session.gameState.cells.push({
            x: data.x,
            y: data.y,
            occupiedBy: socket.id
        });

        if (hasFiveInARow(session, socket.id, data.x, data.y)) {
            emitGameState(data.sessionId);
            finishSession(data.sessionId, 'five-in-a-row', socket.id);
            return;
        }

        session.gameState.placementsRemaining -= 1;
        if (session.gameState.placementsRemaining === 0) {
            const currentPlayerIndex = session.players.indexOf(socket.id);
            const nextPlayerIndex = currentPlayerIndex === 0 ? 1 : 0;
            setTurn(session, session.players[nextPlayerIndex] ?? socket.id, 2);
        } else {
            session.gameState.currentTurnExpiresAt = Date.now() + TURN_TIMEOUT_MS;
        }

        scheduleTurnTimeout(data.sessionId);
        emitGameState(data.sessionId);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        // Remove player from all sessions
        for (const session of gameSessions.values()) {
            if (!session.players.includes(socket.id)) {
                continue;
            }

            removePlayerFromSession(session, socket.id, 'disconnect');
        }
    });
});

if (process.env.NODE_ENV === 'production' && existsSync(frontendDistPath)) {
    app.get(/^(?!\/api(?:\/|$)|\/socket\.io(?:\/|$)).*/, (_req, res) => {
        res.sendFile(join(frontendDistPath, 'index.html'));
    });
}


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

server.on('close', () => {
    void closeMetricLogger();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        server.close(() => {
            process.exit(0);
        });
    });
}
