import type { BotEngineInterface, BotEngineSuggestionResult } from '@ih3t/shared';
import { applyGameMove, cloneGameState, type GameState, type HexCoordinate } from '@ih3t/shared';

export class SandboxBotMoveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = `SandboxBotMoveError`;
    }
}

function extractSuggestion<T>(
    displayName: string,
    timeoutMs: number,
    result: BotEngineSuggestionResult<T>,
): T {
    if (result.status === `timeout`) {
        throw new SandboxBotMoveError(`${displayName} timed out after ${timeoutMs}ms.`);
    } else if (result.status === `failure`) {
        throw new SandboxBotMoveError(result.message);
    }

    const suggestion = result.suggestion;
    if (suggestion === null) {
        throw new SandboxBotMoveError(`${displayName} did not provide a suggestion.`);
    }

    return suggestion;
}

function applySuggestedMove(gameState: GameState, playerId: string, move: HexCoordinate, displayName: string) {
    try {
        applyGameMove(gameState, {
            playerId,
            x: move.x,
            y: move.y,
        });
    } catch (error) {
        const detail = error instanceof Error ? error.message : `Suggested move was illegal.`;
        throw new SandboxBotMoveError(`${displayName} suggested an illegal move. ${detail}`);
    }
}

export async function getSandboxBotMoves(bot: BotEngineInterface, gameState: GameState, timeoutMs: number): Promise<HexCoordinate[]> {
    const currentTurnPlayerId = gameState.currentTurnPlayerId;
    if (!currentTurnPlayerId || gameState.winner) {
        return [];
    }

    if (gameState.cells.length === 0 && gameState.placementsRemaining === 1) {
        /* first move, can only be one */
        return [{ x: 0, y: 0 }];
    }

    const displayName = bot.getDisplayName();
    const capabilities = bot.getCapabilities();

    if (gameState.placementsRemaining === 2 && capabilities.suggestTurn) {
        const suggestion = extractSuggestion(
            displayName,
            timeoutMs,
            await bot.suggestTurn(cloneGameState(gameState), timeoutMs),
        );

        const nextGameState = cloneGameState(gameState);
        const appliedMoves: HexCoordinate[] = [];

        for (const move of suggestion) {
            if (nextGameState.winner || nextGameState.currentTurnPlayerId !== currentTurnPlayerId) {
                break;
            }

            applySuggestedMove(nextGameState, currentTurnPlayerId, move, displayName);
            appliedMoves.push(move);
        }

        return appliedMoves;
    }

    if (!capabilities.suggestMove) {
        throw new SandboxBotMoveError(
            gameState.placementsRemaining === 1
                ? `${displayName} cannot continue this partial turn because it only supports full-turn suggestions.`
                : `${displayName} does not support single-move suggestions for this position.`,
        );
    }

    const nextGameState = cloneGameState(gameState);
    const appliedMoves: HexCoordinate[] = [];

    while (
        nextGameState.winner === null
        && nextGameState.currentTurnPlayerId === currentTurnPlayerId
        && nextGameState.placementsRemaining > 0
    ) {
        const move = extractSuggestion(
            displayName,
            timeoutMs,
            await bot.suggestMove(cloneGameState(nextGameState), timeoutMs),
        );

        applySuggestedMove(nextGameState, currentTurnPlayerId, move, displayName);
        appliedMoves.push(move);
    }

    return appliedMoves;
}
