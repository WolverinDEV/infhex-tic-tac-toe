export type SessionState = 'lobby' | 'ingame' | 'finished';
export type CellOccupant = string;
export type SessionFinishReason = 'disconnect' | 'timeout';

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
}

// Socket Event Types
export interface ServerToClientEvents {
    'sessions-updated': (sessions: SessionInfo[]) => void;
    'player-joined': (data: { playerId: string; players: string[]; state: SessionState }) => void;
    'player-left': (data: { playerId: string; players: string[]; state: SessionState }) => void;
    'session-finished': (data: { sessionId: string; winnerId: string; loserId: string; reason: SessionFinishReason }) => void;
    'game-state': (data: { sessionId: string; gameState: BoardState }) => void;
    'game-action': (data: { playerId: string; action: GameAction }) => void;
    error: (error: string) => void;
}

export interface ClientToServerEvents {
    'join-session': (sessionId: string) => void;
    'leave-session': (sessionId: string) => void;
    'place-cell': (data: { sessionId: string; x: number; y: number }) => void;
    'game-action': (data: { sessionId: string; action: GameAction }) => void;
}

// Game Action Types (can be extended for specific games)
export interface GameAction {
    type: string;
    payload?: any;
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
