import {
    applyGameMove,
    GameRuleError,
    type GameState,
    getPublicGameState,
    initializeGameState,
} from '@ih3t/shared';
import { injectable } from 'tsyringe';

type ApplyMoveParams = {
    playerId: string;
    x: number;
    y: number;
};

type ApplyMoveResult = {
    turnCompleted: boolean;
};

export class SimulationError extends GameRuleError {
    constructor(message: string) {
        super(message);
        this.name = `SimulationError`;
    }
}

@injectable()
export class GameSimulation {
    startSession(boardState: GameState, playerIds: readonly string[], startingPlayerId?: string | null): void {
        initializeGameState(boardState, playerIds, startingPlayerId ?? null);
    }

    getPublicGameState(boardState: GameState): GameState {
        return getPublicGameState(boardState);
    }

    applyMove(boardState: GameState, params: ApplyMoveParams): ApplyMoveResult {
        try {
            return applyGameMove(boardState, params);
        } catch (error: unknown) {
            if (error instanceof GameRuleError) {
                throw new SimulationError(error.message);
            }

            throw error;
        }
    }
}
