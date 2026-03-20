export const DUMMY = "Hello?";
export type SessionState = 'lobby' | 'ingame' | 'finished';
export type SessionParticipantRole = 'player' | 'spectator';
export type CellOccupant = string & { _type?: "CellOccupant" };
export type SessionFinishReason = 'disconnect' | 'timeout' | 'terminated' | 'six-in-a-row';
export type LobbyVisibility = 'public' | 'private';
export type PlayerNames = Record<string, string>;
export type GameTimeControl =
    | { mode: 'unlimited' }
    | { mode: 'turn'; turnTimeMs: number }
    | { mode: 'match'; mainTimeMs: number; incrementMs: number };

export interface LobbyOptions {
    visibility: LobbyVisibility;
    timeControl: GameTimeControl;
}

export const DEFAULT_LOBBY_OPTIONS: LobbyOptions = {
    visibility: 'public',
    timeControl: {
        mode: 'turn',
        turnTimeMs: 45_000
    }
};

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
    playerTimeRemainingMs: Record<string, number>;
}

// Game Session Types
export interface GameSession {
    id: string;
    players: string[];
    playerNames: PlayerNames;
    spectators: string[];
    maxPlayers: 2; // Fixed to 2 players
    state: SessionState;
    lobbyOptions: LobbyOptions;
    gameState: BoardState;
}

export interface CreateSessionRequest {
    lobbyOptions?: LobbyOptions;
}

export interface CreateSessionResponse {
    sessionId: string;
}

export interface JoinSessionRequest {
    sessionId: string;
    username?: string;
}

export interface SessionInfo {
    id: string;
    playerCount: number;
    maxPlayers: 2; // Always 2
    state: SessionState;
    lobbyOptions: LobbyOptions;
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
    playerNames: PlayerNames;
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
        playerNames: PlayerNames;
        lobbyOptions: LobbyOptions;
        participantId: string;
    }) => void;
    'session-finished': (data: SessionFinishedEvent) => void;
    'player-joined': (data: { playerId: string; players: string[]; playerNames: PlayerNames; state: SessionState }) => void;
    'player-left': (data: { playerId: string; players: string[]; playerNames: PlayerNames; state: SessionState }) => void;
    'game-state': (data: { sessionId: string; sessionState: SessionState, gameState: BoardState }) => void;
    'rematch-updated': (data: RematchUpdatedEvent) => void;
    error: (error: string) => void;
}

export interface ClientToServerEvents {
    'join-session': (request: JoinSessionRequest) => void;
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

export interface AccountProfile {
    id: string;
    username: string;
    email: string | null;
    image: string | null;
}

export interface AccountResponse {
    user: AccountProfile | null;
}

export interface UpdateAccountProfileRequest {
    username: string;
}
