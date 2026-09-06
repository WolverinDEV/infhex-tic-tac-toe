import {
    BoardController,
    type BoardTheme,
    GameBoardRenderer,
    getRenderableCellCount,
} from '@ih3t/board-renderer';
import type { GameState, HexCoordinate } from '@ih3t/shared';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { toRendererBoardState } from '../../utils/gameBoard';

type GameBoardViewProps = {
    className?: string
    gameState: GameState
    highlightedCells: `last` | `turn` | HexCoordinate[]
    localPlayerId: string | null
    interactionEnabled: boolean
    viewInteractionEnabled?: boolean
    focusRecentMovesOnNumberKeys?: boolean
    onPlaceCell?: (x: number, y: number) => void
    theme?: BoardTheme
    controller?: BoardController
    children?: (context: {
        renderableCellCount: number
        resetView: () => void
    }) => ReactNode
};

function GameBoardView({
    className = `relative h-full w-full overflow-hidden`,
    gameState,
    highlightedCells,
    localPlayerId,
    interactionEnabled,
    viewInteractionEnabled,
    focusRecentMovesOnNumberKeys = false,
    onPlaceCell,
    theme,
    controller: suppliedController,
    children,
}: Readonly<GameBoardViewProps>) {
    const [ownedController] = useState(() => new BoardController());
    const controller = suppliedController ?? ownedController;
    const [inspectedRecentMoveDistance, setInspectedRecentMoveDistance] = useState<number | null>(null);
    const canPlaceCell = interactionEnabled
        && Boolean(onPlaceCell)
        && localPlayerId !== null
        && gameState.currentTurnPlayerId === localPlayerId;

    const boardState = useMemo(
        () => toRendererBoardState(gameState),
        [gameState],
    );

    const emphasizedCells = useMemo(() => {
        if (inspectedRecentMoveDistance !== null) {
            const cell = gameState.cells.at(-inspectedRecentMoveDistance);
            return cell ? [{ x: cell.x, y: cell.y }] : [];
        }
        if (highlightedCells === `last`) {
            const cell = gameState.cells.at(-1);
            return cell ? [{ x: cell.x, y: cell.y }] : [];
        }
        if (highlightedCells === `turn`) {
            const cells: HexCoordinate[] = [];
            const playerId = gameState.cells.at(-1)?.occupiedBy;
            for (let index = gameState.cells.length - 1; index >= 0; index -= 1) {
                const cell = gameState.cells[index];
                if (cell.occupiedBy !== playerId) {
                    break;
                }
                cells.push({ x: cell.x, y: cell.y });
            }
            return cells;
        }
        return highlightedCells;
    }, [gameState.cells, highlightedCells, inspectedRecentMoveDistance]);

    useEffect(() => {
        controller.setEmphasizedCells(emphasizedCells);
    }, [controller, emphasizedCells]);

    useEffect(() => {
        setInspectedRecentMoveDistance(null);
    }, [gameState.cells.length]);

    useEffect(() => {
        if (!focusRecentMovesOnNumberKeys) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented
                || event.altKey
                || event.ctrlKey
                || event.metaKey
                || isEditableEventTarget(event.target)
                || !/^[1-9]$/.test(event.key)
            ) {
                return;
            }

            const distance = Number.parseInt(event.key, 10);
            const cell = gameState.cells.at(-distance);
            if (!cell) {
                return;
            }

            event.preventDefault();
            setInspectedRecentMoveDistance(distance);
            controller.centerOnCell(cell);
        };

        document.addEventListener(`keydown`, handleKeyDown);
        return () => document.removeEventListener(`keydown`, handleKeyDown);
    }, [controller, focusRecentMovesOnNumberKeys, gameState.cells]);

    const renderableCellCount = useMemo(
        () => getRenderableCellCount(boardState),
        [boardState],
    );

    return (
        <div className={className}>
            <GameBoardRenderer
                className="absolute inset-0 h-full w-full"

                state={boardState}
                controller={controller}
                options={{
                    viewInteractions: viewInteractionEnabled ?? interactionEnabled,
                    cellInteractions: canPlaceCell,
                    theme,
                }}

                onPlaceCell={cell => onPlaceCell?.(cell.x, cell.y)}
            />

            {children?.({
                renderableCellCount,
                resetView: () => controller.resetView(),
            })}
        </div>
    );
}

function isEditableEventTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (
        target.isContentEditable
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
    );
}

export default GameBoardView;
