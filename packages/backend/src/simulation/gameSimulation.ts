import { injectable } from 'tsyringe';
import {
    buildPlayerTileConfigMap,
    getCellKey,
    isCellWithinPlacementRadius,
    PLACE_CELL_HEX_RADIUS,
    zCellOccupant,
    type BoardCell,
    type GameMove
} from '@ih3t/shared';
import type { PublicGameStatePayload, ServerGameSession } from '../session/types';

interface ApplyMoveParams {
    playerId: string;
    x: number;
    y: number;
    timestamp?: number;
}

interface ApplyMoveResult {
    move: GameMove;
    turnCompleted: boolean;
    winningPlayerId: string | null;
}

export class SimulationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SimulationError';
    }
}

@injectable()
export class GameSimulation {
    startSession(session: ServerGameSession): void {
        session.boardState.playerTiles = buildPlayerTileConfigMap(session.players.map((player) => player.id));
        session.boardState.highlightedCells = [];
        this.setTurn(session, session.players[0]?.id ?? null, 1);
    }

    getPublicGameState(session: ServerGameSession): PublicGameStatePayload {
        return {
            sessionId: session.id,
            gameId: session.currentGameId,
            gameState: {
                cells: this.getBoardCells(session),
                highlightedCells: session.boardState.highlightedCells.map((cell) => ({ ...cell })),
                playerTiles: Object.fromEntries(
                    Object.entries(session.boardState.playerTiles).map(([playerId, playerTileConfig]) => [playerId, { ...playerTileConfig }])
                ),
                currentTurnPlayerId: session.boardState.currentTurnPlayerId,
                placementsRemaining: session.boardState.placementsRemaining,
                currentTurnExpiresAt: session.boardState.currentTurnExpiresAt,
                playerTimeRemainingMs: { ...session.boardState.playerTimeRemainingMs }
            }
        };
    }

    applyMove(session: ServerGameSession, params: ApplyMoveParams): ApplyMoveResult {
        const { playerId, x, y } = params;
        const timestamp = params.timestamp ?? Date.now();

        if (session.boardState.currentTurnPlayerId !== playerId) {
            throw new SimulationError('It is not your turn');
        }

        if (session.boardState.placementsRemaining <= 0) {
            throw new SimulationError('No placements remaining this turn');
        }

        const cellKey = getCellKey(x, y);
        const isOccupied = session.boardState.cells.some((cell) => getCellKey(cell.x, cell.y) === cellKey);
        if (isOccupied) {
            throw new SimulationError('Cell is already occupied');
        }

        if (session.boardState.cells.length === 0 && (x !== 0 || y !== 0)) {
            throw new SimulationError('First placement must be at the origin');
        }

        if (!isCellWithinPlacementRadius(session.boardState.cells, { x, y })) {
            throw new SimulationError(`Cell must be within ${PLACE_CELL_HEX_RADIUS} hexes of an existing placed cell`);
        }
        const isFirstPlacementOfTurn = session.moveHistory.length === 0 || session.boardState.placementsRemaining === 2;
        const turnCompleted = session.boardState.placementsRemaining === 1;

        const move: GameMove = {
            moveNumber: session.moveHistory.length + 1,
            playerId,
            x,
            y,
            timestamp
        };

        session.boardState.cells.push({
            x,
            y,
            occupiedBy: zCellOccupant.parse(playerId)
        });
        session.boardState.highlightedCells = isFirstPlacementOfTurn
            ? [{ x, y }]
            : [...session.boardState.highlightedCells, { x, y }].slice(-2);
        session.moveHistory.push(move);
        session.boardState.placementsRemaining -= 1;

        if (this.hasSixInARow(session, playerId, x, y)) {
            return {
                move,
                turnCompleted,
                winningPlayerId: playerId
            };
        }

        if (turnCompleted) {
            const currentPlayerIndex = session.players.findIndex((player) => player.id === playerId);
            const nextPlayerIndex = currentPlayerIndex === 0 ? 1 : 0;
            this.setTurn(session, session.players[nextPlayerIndex]?.id ?? playerId, 2);
        }

        return {
            move,
            turnCompleted,
            winningPlayerId: null
        };
    }

    private setTurn(session: ServerGameSession, playerId: string | null, placementsRemaining: number): void {
        session.boardState.currentTurnPlayerId = playerId;
        session.boardState.placementsRemaining = playerId ? placementsRemaining : 0;
        if (!playerId) {
            session.boardState.currentTurnExpiresAt = null;
        }
    }

    private getBoardCells(session: ServerGameSession): BoardCell[] {
        return [...session.boardState.cells].sort((a, b) => {
            if (a.y === b.y) {
                return a.x - b.x;
            }

            return a.y - b.y;
        });
    }

    private hasSixInARow(session: ServerGameSession, playerId: string, x: number, y: number): boolean {
        const occupiedCells = new Set(
            session.boardState.cells
                .filter((cell) => cell.occupiedBy === playerId)
                .map((cell) => getCellKey(cell.x, cell.y))
        );
        const directions: Array<[number, number]> = [
            [1, 0],
            [0, 1],
            [1, -1]
        ];

        return directions.some(([directionX, directionY]) => {
            const connectedCount =
                1 +
                this.countConnectedTiles(occupiedCells, x, y, directionX, directionY) +
                this.countConnectedTiles(occupiedCells, x, y, -directionX, -directionY);

            return connectedCount >= 6;
        });
    }

    private countConnectedTiles(
        occupiedCells: Set<string>,
        startX: number,
        startY: number,
        directionX: number,
        directionY: number
    ): number {
        let count = 0;
        let currentX = startX + directionX;
        let currentY = startY + directionY;

        while (occupiedCells.has(getCellKey(currentX, currentY))) {
            count += 1;
            currentX += directionX;
            currentY += directionY;
        }

        return count;
    }
}
