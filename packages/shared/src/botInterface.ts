import { GameState, HexCoordinate } from ".";

export type BotEngineSuggestionResult<T> = {
    status: "provide"
    suggestion: T,
    metadata: Record<string, string>,
} | {
    status: "failure",
    message: string,
    metadata: Record<string, string>,
} | {
    status: "timeout"
}

export type BotEngineCapabilities = {
    /// Support for suggesting full turns
    suggestTurn: boolean,

    /// Support for suggesting single moves at any given time
    suggestMove: boolean,
}

export type BotEngineInterface = {
    /// Get a human friendly identifier for the bot engine
    getDisplayName(): string;

    /// Get the capabilities of the engine.
    /// The capabilities should not change on an active instance.
    getCapabilities(): Readonly<BotEngineCapabilities>;

    /// Suggest the next turn (e.g. two moves).
    /// The initial turn (placing a cell at 0,0) will be done automatically.
    /// Assumes placementsRemaining === 2.
    suggestTurn(gameState: GameState, timeoutMs: number): Promise<BotEngineSuggestionResult<[HexCoordinate, HexCoordinate]>>;

    /// Suggests the next move at the given game state
    suggestMove(gameState: GameState, timeoutMs: number): Promise<BotEngineSuggestionResult<HexCoordinate>>;

    /// Shutdown the bot
    shutdown(): void;
}
