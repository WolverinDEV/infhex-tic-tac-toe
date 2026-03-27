import { BotEngineCapabilities, BotEngineInterface, BotEngineSuggestionResult, GameState, getCellKey, HexCoordinate } from "@ih3t/shared";

class DummyBotEngine implements BotEngineInterface {
    getDisplayName(): string {
        return `Dummy Engine`;
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

    async suggestTurn(gameState: GameState, _timeoutMs: number): Promise<BotEngineSuggestionResult<[HexCoordinate, HexCoordinate]>> {
        const cells = new Set();
        for (const cell of gameState.cells) {
            cells.add(getCellKey(cell.x, cell.y));
        }

        const moves: HexCoordinate[] = [];
        for (let radius = 0; moves.length < gameState.placementsRemaining; radius++) {
            for (let x = -radius; moves.length < gameState.placementsRemaining && x <= radius; x++) {
                for (let y = -radius; moves.length < gameState.placementsRemaining && y <= radius; y++) {
                    if (cells.has(getCellKey(x, y))) {
                        continue;
                    }

                    moves.push({ x, y });
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 250));

        return {
            status: `provide`,
            suggestion: [moves[0], moves[1]],
            metadata: {},
        };
    }

    shutdown(): void {
        /* nothing to do */
    }
}

export default async function () {
    return new DummyBotEngine();
}
