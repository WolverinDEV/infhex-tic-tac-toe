import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    GameSession,
    CreateSessionResponse,
    SessionInfo,
    ServerToClientEvents,
    ClientToServerEvents,
    GameAction
} from '@ih3t/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173'
]);
const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
        // Allow non-browser requests and configured dev origins.
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
};

// CORS middleware for API requests
app.use(cors(corsOptions));

const server = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: corsOptions
});

const gameSessions = new Map<string, GameSession>();

// Serve static files from dist in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(join(__dirname, '../dist')));
}

// API routes
app.get('/api/sessions', (_req, res) => {
    const sessions: SessionInfo[] = Array.from(gameSessions.values()).map(session => ({
        id: session.id,
        playerCount: session.players.length,
        maxPlayers: session.maxPlayers,
        canJoin: session.players.length < session.maxPlayers
    }));
    res.json(sessions);
});

app.post('/api/sessions', express.json(), (_req, res) => {
    const sessionId = Math.random().toString(36).substring(2, 8);

    const session: GameSession = {
        id: sessionId,
        players: [],
        maxPlayers: 2,
        gameState: {}
    };

    gameSessions.set(sessionId, session);
    const response: CreateSessionResponse = { sessionId };
    res.json(response);
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join-session', (sessionId: string) => {
        const session = gameSessions.get(sessionId);
        if (!session) {
            socket.emit('error', 'Session not found');
            return;
        }

        if (session.players.length >= session.maxPlayers) {
            socket.emit('error', 'Session is full');
            return;
        }

        session.players.push(socket.id);
        socket.join(sessionId);

        // Notify all players in the session
        io.to(sessionId).emit('player-joined', {
            playerId: socket.id,
            players: session.players
        });

        console.log(`Player ${socket.id} joined session ${sessionId}`);
    });

    socket.on('leave-session', (sessionId: string) => {
        const session = gameSessions.get(sessionId);
        if (session) {
            session.players = session.players.filter((id: string) => id !== socket.id);
            socket.leave(sessionId);

            if (session.players.length === 0) {
                gameSessions.delete(sessionId);
                console.log(`Session ${sessionId} deleted (no players)`);
            } else {
                io.to(sessionId).emit('player-left', {
                    playerId: socket.id,
                    players: session.players
                });
            }
        }
    });

    socket.on('game-action', (data: { sessionId: string; action: GameAction }) => {
        const { sessionId, action } = data;
        // Broadcast the action to all players in the session
        socket.to(sessionId).emit('game-action', { playerId: socket.id, action });
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        // Remove player from all sessions
        for (const [sessionId, session] of gameSessions.entries()) {
            if (session.players.includes(socket.id)) {
                session.players = session.players.filter((id: string) => id !== socket.id);

                if (session.players.length === 0) {
                    gameSessions.delete(sessionId);
                } else {
                    io.to(sessionId).emit('player-left', {
                        playerId: socket.id,
                        players: session.players
                    });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
