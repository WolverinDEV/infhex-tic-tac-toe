import { injectable } from 'tsyringe';
import {
    applyGameMove,
    GameRuleError,
    getPublicGameState,
    initializeGameState,
    type GameState,
} from '@ih3t/shared';

type ApplyMoveParams = {
    playerId: string;
    x: number;
    y: number;
}

type ApplyMoveResult = {
    turnCompleted: boolean;
}

export class SimulationError extends GameRuleError {
    constructor(message: string) {
        super(message);
        this.name = 'SimulationError';
    }
}

@injectable()
export class GameSimulation {
    startSession(boardState: GameState, playerIds: readonly string[]): void {
        initializeGameState(boardState, playerIds);
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
