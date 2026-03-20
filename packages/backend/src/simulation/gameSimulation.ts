import { injectable } from 'tsyringe';
import { zCellOccupant, type BoardCell, type GameMove, type GameTimeControl } from '@ih3t/shared';
import type { PublicGameStatePayload, StoredGameSession } from '../session/types';

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
        this.initializePlayerClocks(session);
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
                currentTurnExpiresAt: session.gameState.currentTurnExpiresAt,
                playerTimeRemainingMs: { ...session.gameState.playerTimeRemainingMs }
            }
        };
    }

    applyMove(session: StoredGameSession, params: ApplyMoveParams): ApplyMoveResult {
        const { playerId, x, y } = params;
        const timestamp = params.timestamp ?? Date.now();

        if (session.gameState.currentTurnPlayerId !== playerId) {
            throw new SimulationError('It is not your turn');
        }

        this.ensureTurnHasTimeRemaining(session, timestamp);

        if (session.gameState.placementsRemaining <= 0) {
            throw new SimulationError('No placements remaining this turn');
        }

        const cellKey = this.getCellKey(x, y);
        const isOccupied = session.gameState.cells.some((cell) => this.getCellKey(cell.x, cell.y) === cellKey);
        if (isOccupied) {
            throw new SimulationError('Cell is already occupied');
        }

        this.applyMoveTimeControl(session, playerId, timestamp);

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
            occupiedBy: zCellOccupant.parse(playerId)
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
            this.syncActiveTurnClock(session, timestamp);
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

    private initializePlayerClocks(session: StoredGameSession): void {
        const timeControl = this.getTimeControl(session);
        if (timeControl.mode !== 'match') {
            session.gameState.playerTimeRemainingMs = {};
            return;
        }

        session.gameState.playerTimeRemainingMs = Object.fromEntries(
            session.players.map((playerId) => [playerId, timeControl.mainTimeMs])
        );
    }

    private ensureTurnHasTimeRemaining(session: StoredGameSession, timestamp: number): void {
        const expiresAt = session.gameState.currentTurnExpiresAt;
        if (expiresAt !== null && timestamp > expiresAt) {
            throw new SimulationError('Your time has expired');
        }
    }

    private applyMoveTimeControl(session: StoredGameSession, playerId: string, timestamp: number): void {
        const timeControl = this.getTimeControl(session);
        if (timeControl.mode !== 'match') {
            return;
        }

        const remainingTimeMs = this.getRemainingTimeAt(session, playerId, timestamp, timeControl.mainTimeMs);
        session.gameState.playerTimeRemainingMs[playerId] = remainingTimeMs + timeControl.incrementMs;
    }

    private setTurn(session: StoredGameSession, playerId: string | null, placementsRemaining: number, timestamp: number): void {
        session.gameState.currentTurnPlayerId = playerId;
        session.gameState.placementsRemaining = playerId ? placementsRemaining : 0;
        if (!playerId) {
            session.gameState.currentTurnExpiresAt = null;
            return;
        }

        this.syncActiveTurnClock(session, timestamp)
    }

    private syncActiveTurnClock(session: StoredGameSession, timestamp: number): void {
        const currentPlayerId = session.gameState.currentTurnPlayerId;
        if (!currentPlayerId) {
            session.gameState.currentTurnExpiresAt = null;
            return;
        }

        const timeControl = this.getTimeControl(session);
        switch (timeControl.mode) {
            case "unlimited":
                session.gameState.currentTurnExpiresAt = null;
                break;

            case "match":
                session.gameState.currentTurnExpiresAt = timestamp + this.getPlayerRemainingTime(
                    session,
                    currentPlayerId,
                    timeControl.mainTimeMs
                );
                break;

            case "turn":
                session.gameState.currentTurnExpiresAt = timestamp + timeControl.turnTimeMs;
                break;
        }
    }

    private getRemainingTimeAt(
        session: StoredGameSession,
        playerId: string,
        timestamp: number,
        fallbackTimeMs: number
    ): number {
        if (session.gameState.currentTurnPlayerId === playerId && session.gameState.currentTurnExpiresAt !== null) {
            return Math.max(0, session.gameState.currentTurnExpiresAt - timestamp);
        }

        return this.getPlayerRemainingTime(session, playerId, fallbackTimeMs);
    }

    private getPlayerRemainingTime(session: StoredGameSession, playerId: string, fallbackTimeMs: number): number {
        return session.gameState.playerTimeRemainingMs[playerId] ?? fallbackTimeMs;
    }

    private getTimeControl(session: StoredGameSession): GameTimeControl {
        return session.lobbyOptions.timeControl;
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
