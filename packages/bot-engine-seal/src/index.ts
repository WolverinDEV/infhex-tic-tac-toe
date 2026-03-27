import { BotEngineCapabilities, BotEngineInterface, BotEngineSuggestionResult, GameState, HexCoordinate } from "@ih3t/shared";

import createEngine, { SealEngine as SealEngine } from "./sealEngine";

class SealEngineInterface implements BotEngineInterface {
    constructor(readonly engine: SealEngine) { }

    getDisplayName(): string {
        return `SealBot`;
    }

    getCapabilities(): Readonly<BotEngineCapabilities> {
        return {
            suggestTurn: true,
            suggestMove: false,
        };
    }

    async suggestMove(_gameState: GameState, _timeoutMs: number): Promise<BotEngineSuggestionResult<HexCoordinate>> {
        return { status: `failure`, message: `not supported`, metadata: {} };
    }

    async suggestTurn(gameState: GameState, timeoutMs: number): Promise<BotEngineSuggestionResult<[HexCoordinate, HexCoordinate]>> {
        const playerOne = gameState.cells[0]?.occupiedBy;
        if (!playerOne) {
            throw Error(`missing player 1`);
        }

        const movesOne = gameState.cells
            .filter(cell => cell.occupiedBy === playerOne)
            .flatMap(cell => [cell.x, cell.y]);

        const movesTwo = gameState.cells
            .filter(cell => cell.occupiedBy !== playerOne)
            .flatMap(cell => [cell.x, cell.y]);

        const result = this.engine.getMove(
            movesOne,
            movesTwo,
            gameState.currentTurnPlayerId === playerOne ? 1 : 2,
            timeoutMs,
        );
        console.log(`Bot result for ${gameState.cells.length} %o`, result);

        const [
            x1, y1, x2, y2, depth, nodes, score,
        ] = result;
        return {
            status: `provide`,
            suggestion: [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
            ],
            metadata: {
                depth: `${depth}`,
                nodes: `${nodes}`,
                score: `${score}`,
            },
        };
    }

    shutdown(): void {
        /* nothing to do */
    }
}

export default async function () {
    const engine = await createEngine();
    return new SealEngineInterface(engine);
}
