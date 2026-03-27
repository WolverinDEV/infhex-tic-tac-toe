import type { CanvasHTMLAttributes, RefObject } from 'react';

type GameBoardCanvasProps = {
    canvasRef: RefObject<HTMLCanvasElement | null>
    className: string
    handlers: Pick<
        CanvasHTMLAttributes<HTMLCanvasElement>,
    | `onContextMenu`
    | `onMouseDown`
    | `onMouseMove`
    | `onMouseLeave`
    | `onMouseUp`
    | `onWheel`
    | `onTouchStart`
    | `onTouchMove`
    | `onTouchEnd`
    | `onTouchCancel`
    >
};

function GameBoardCanvas({ canvasRef, className, handlers }: Readonly<GameBoardCanvasProps>) {
    return <canvas ref={canvasRef} className={className} {...handlers} />;
}

export default GameBoardCanvas;
