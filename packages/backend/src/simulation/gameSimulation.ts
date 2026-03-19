import { injectable } from 'tsyringe';
import type { BoardCell, GameMove } from '@ih3t/shared';
import type { PublicGameStatePayload, StoredGameSession } from '../session/types';

const TURN_TIMEOUT_MS = 45_000;

interface ApplyMoveParams {
    playerId: string;
    x: number;
    y: number;
    timestamp?: number;
}

interface ApplyMoveResult {
    move: GameMove;
    winningPlayerId: string | null;
}

type TurnExpiredHandler = (sessionId: string) => void;

export class SimulationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SimulationError';
    }
}

@injectable()
export class GameSimulation {
    private readonly turnTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    startSession(session: StoredGameSession, onTurnExpired: TurnExpiredHandler, startedAt = Date.now()): void {
        this.setTurn(session, session.players[0] ?? null, 1, startedAt);
        this.syncTurnTimeout(session, onTurnExpired);
    }

    getPublicGameState(session: StoredGameSession): PublicGameStatePayload {
        return {
            sessionId: session.id,
            sessionState: session.state,
            gameState: {
                cells: this.getBoardCells(session),
                currentTurnPlayerId: session.gameState.currentTurnPlayerId,
                placementsRemaining: session.gameState.placementsRemaining,
                currentTurnExpiresAt: session.gameState.currentTurnExpiresAt
            }
        };
    }

    applyMove(session: StoredGameSession, params: ApplyMoveParams): ApplyMoveResult {
        const { playerId, x, y } = params;
        const timestamp = params.timestamp ?? Date.now();

        if (session.gameState.currentTurnPlayerId !== playerId) {
            throw new SimulationError('It is not your turn');
        }

        if (session.gameState.placementsRemaining <= 0) {
            throw new SimulationError('No placements remaining this turn');
        }

        const cellKey = this.getCellKey(x, y);
        const isOccupied = session.gameState.cells.some((cell) => this.getCellKey(cell.x, cell.y) === cellKey);
        if (isOccupied) {
            throw new SimulationError('Cell is already occupied');
        }

        const move: GameMove = {
            moveNumber: session.moveHistory.length + 1,
            playerId,
            x,
            y,
            timestamp
        };

        session.gameState.cells.push({
            x,
            y,
            occupiedBy: playerId
        });
        session.moveHistory.push(move);

        if (this.hasSixInARow(session, playerId, x, y)) {
            return {
                move,
                winningPlayerId: playerId
            };
        }

        session.gameState.placementsRemaining -= 1;
        if (session.gameState.placementsRemaining === 0) {
            const currentPlayerIndex = session.players.indexOf(playerId);
            const nextPlayerIndex = currentPlayerIndex === 0 ? 1 : 0;
            this.setTurn(session, session.players[nextPlayerIndex] ?? playerId, 2, timestamp);
        } else {
            session.gameState.currentTurnExpiresAt = timestamp + TURN_TIMEOUT_MS;
        }

        return {
            move,
            winningPlayerId: null
        };
    }

    syncTurnTimeout(session: StoredGameSession, onTurnExpired: TurnExpiredHandler): void {
        this.clearSession(session.id);

        if (session.state !== 'ingame' || !session.gameState.currentTurnPlayerId || !session.gameState.currentTurnExpiresAt) {
            return;
        }

        const delay = Math.max(0, session.gameState.currentTurnExpiresAt - Date.now());
        const timeout = setTimeout(() => {
            onTurnExpired(session.id);
        }, delay);

        this.turnTimeouts.set(session.id, timeout);
    }

    clearSession(sessionId: string): void {
        const timeout = this.turnTimeouts.get(sessionId);
        if (!timeout) {
            return;
        }

        clearTimeout(timeout);
        this.turnTimeouts.delete(sessionId);
    }

    dispose(): void {
        for (const sessionId of this.turnTimeouts.keys()) {
            this.clearSession(sessionId);
        }
    }

    private setTurn(session: StoredGameSession, playerId: string | null, placementsRemaining: number, timestamp: number): void {
        session.gameState.currentTurnPlayerId = playerId;
        session.gameState.placementsRemaining = playerId ? placementsRemaining : 0;
        session.gameState.currentTurnExpiresAt = playerId ? timestamp + TURN_TIMEOUT_MS : null;
    }

    private getBoardCells(session: StoredGameSession): BoardCell[] {
        return [...session.gameState.cells].sort((a, b) => {
            if (a.y === b.y) {
                return a.x - b.x;
            }

            return a.y - b.y;
        });
    }

    private hasSixInARow(session: StoredGameSession, playerId: string, x: number, y: number): boolean {
        const occupiedCells = new Set(
            session.gameState.cells
                .filter((cell) => cell.occupiedBy === playerId)
                .map((cell) => this.getCellKey(cell.x, cell.y))
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

        while (occupiedCells.has(this.getCellKey(currentX, currentY))) {
            count += 1;
            currentX += directionX;
            currentY += directionY;
        }

        return count;
    }

    private getCellKey(x: number, y: number): string {
        return `${x},${y}`;
    }
}
