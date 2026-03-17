// Game Session Types
export interface GameSession {
    id: string;
    players: string[];
    maxPlayers: 2; // Fixed to 2 players
    gameState: any;
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
    canJoin: boolean; // Whether the session can accept new players
}

// Socket Event Types
export interface ServerToClientEvents {
    'player-joined': (data: { playerId: string; players: string[] }) => void;
    'player-left': (data: { playerId: string; players: string[] }) => void;
    'game-action': (data: { playerId: string; action: GameAction }) => void;
    error: (error: string) => void;
}

export interface ClientToServerEvents {
    'join-session': (sessionId: string) => void;
    'leave-session': (sessionId: string) => void;
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