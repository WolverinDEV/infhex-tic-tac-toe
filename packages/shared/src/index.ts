export const DUMMY = "Hello?";
export type SessionState = 'lobby' | 'ingame' | 'finished';
export type SessionParticipantRole = 'player' | 'spectator';
export type CellOccupant = string & { _type?: "CellOccupant" };
export type SessionFinishReason = 'disconnect' | 'timeout' | 'terminated' | 'six-in-a-row';

export interface ShutdownState {
    scheduledAt: number;
    shutdownAt: number;
}

export interface BoardCell {
    x: number;
    y: number;
    occupiedBy: CellOccupant;
}

export interface BoardState {
    cells: BoardCell[];
    currentTurnPlayerId: string | null;
    placementsRemaining: number;
    currentTurnExpiresAt: number | null;
}

// Game Session Types
export interface GameSession {
    id: string;
    players: string[];
    spectators: string[];
    maxPlayers: 2; // Fixed to 2 players
    state: SessionState;
    gameState: BoardState;
}

export interface CreateSessionRequest {
    // No maxPlayers needed since it's always 2
}

export interface CreateSessionResponse {
    sessionId: string;
}

export interface SessionInfo {
    id: string;
    playerCount: number;
    maxPlayers: 2; // Always 2
    state: SessionState;
    canJoin: boolean; // Whether the session can accept new players
    createdAt: number;
    startedAt: number | null;
}

export interface GameMove {
    moveNumber: number;
    playerId: string;
    x: number;
    y: number;
    timestamp: number;
}

export interface FinishedGameSummary {
    id: string;
    sessionId: string;
    players: string[];
    winningPlayerId: string | null;
    reason: SessionFinishReason;
    moveCount: number;
    createdAt: number;
    startedAt: number;
    finishedAt: number;
    gameDurationMs: number;
}

export interface FinishedGameRecord extends FinishedGameSummary {
    moves: GameMove[];
}

export interface FinishedGamesPagination {
    page: number;
    pageSize: number;
    totalGames: number;
    totalMoves: number;
    totalPages: number;
    baseTimestamp: number;
}

export interface FinishedGamesPage {
    games: FinishedGameSummary[];
    pagination: FinishedGamesPagination;
}

export interface SessionFinishedEvent {
    sessionId: string;
    finishedGameId: string;
    winningPlayerId: string | null;
    reason: SessionFinishReason;
    canRematch: boolean;
}

export interface RematchUpdatedEvent {
    sessionId: string;
    canRematch: boolean;
    requestedPlayerIds: string[];
}

// Socket Event Types
export interface ServerToClientEvents {
    'sessions-updated': (sessions: SessionInfo[]) => void;
    'shutdown-updated': (shutdown: ShutdownState | null) => void;
    'session-joined': (data: {
        sessionId: string;
        state: SessionState;
        role: SessionParticipantRole;
        players: string[];
        participantId: string;
    }) => void;
    'session-finished': (data: SessionFinishedEvent) => void;
    'player-joined': (data: { playerId: string; players: string[]; state: SessionState }) => void;
    'player-left': (data: { playerId: string; players: string[]; state: SessionState }) => void;
    'game-state': (data: { sessionId: string; sessionState: SessionState, gameState: BoardState }) => void;
    'rematch-updated': (data: RematchUpdatedEvent) => void;
    error: (error: string) => void;
}

export interface ClientToServerEvents {
    'join-session': (sessionId: string) => void;
    'leave-session': (sessionId: string) => void;
    'place-cell': (data: { sessionId: string; x: number; y: number }) => void;
    'request-rematch': (sessionId: string) => void;
    'cancel-rematch': (sessionId: string) => void;
}

// Common utility types
export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Player {
    id: string;
    name?: string;
    position?: Position;
    color?: string;
}
