import type { GameState } from '@ih3t/shared';
import type { ReactNode } from 'react';

import type { HexCell } from '../../utils/gameBoard';
import GameBoardCanvas from './GameBoardCanvas';
import useGameBoard from './useGameBoard';

type GameBoardViewProps = {
    className?: string
    gameState: GameState
    highlightedCells: `last` | `turn` | HexCell[]
    localPlayerId: string | null
    interactionEnabled: boolean
    viewInteractionEnabled?: boolean
    onPlaceCell?: (x: number, y: number) => void
    showTilePieceMarkers?: boolean
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
    onPlaceCell,
    showTilePieceMarkers = false,
    children,
}: Readonly<GameBoardViewProps>) {
    const {
        canvasRef,
        canvasClassName,
        canvasHandlers,
        renderableCellCount,
        resetView,
    } = useGameBoard({
        gameState,
        highlightedCells,
        localPlayerId,
        interactionEnabled,
        viewInteractionEnabled,
        onPlaceCell,
        showTilePieceMarkers,
    });

    return (
        <div className={className}>
            <GameBoardCanvas
                canvasRef={canvasRef}
                className={canvasClassName}
                handlers={canvasHandlers}
            />

            {children?.({
                renderableCellCount,
                resetView,
            })}
        </div>
    );
}

export default GameBoardView;
