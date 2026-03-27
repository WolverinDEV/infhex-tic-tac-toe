import type { BoardState, GameState } from '@ih3t/shared';
import type { CanvasHTMLAttributes, RefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import {
    axialToUnitPoint,
    buildRenderableCells,
    buildStraightHexLine,
    clampScale,
    DEFAULT_SCALE,
    getCellKey,
    getTouchCenter,
    getTouchDistance,
    GRID_LINE_COLOR,
    HexCell,
    pixelToAxial,
    sameCell,
    TilePieceMarker,
    traceHexPath,
} from '../../utils/gameBoard';

const DRAG_THRESHOLD_PX = 6;
const MOUSE_AFTER_TOUCH_IGNORE_MS = 500;

type ViewState = {
    offsetX: number
    offsetY: number
    scale: number
};

type DragState = {
    startX: number
    startY: number
    originOffsetX: number
    originOffsetY: number
    moved: boolean
};

type HighlightPointerState = {
    startX: number
    startY: number
    startCell: HexCell
    pointerButtonsMask: 1 | 2
    drawing: boolean
    cells: HexCell[]
};

type PinchState = {
    startDistance: number
    startScale: number
    anchorUnitX: number
    anchorUnitY: number
};

type UseGameBoardOptions = {
    gameState: GameState
    highlightedCells: `last` | `turn` | HexCell[]
    localPlayerId: string | null
    interactionEnabled: boolean
    onPlaceCell?: (x: number, y: number) => void
    showTilePieceMarkers?: boolean
};

type UseGameBoardResult = {
    canvasRef: RefObject<HTMLCanvasElement | null>
    canvasClassName: string
    canvasHandlers: Pick<
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
    renderableCellCount: number
    resetView: () => void
};

function traceTilePieceXPath(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    markerRadius: number,
) {
    context.beginPath();
    context.moveTo(centerX - markerRadius, centerY - markerRadius);
    context.lineTo(centerX + markerRadius, centerY + markerRadius);
    context.moveTo(centerX + markerRadius, centerY - markerRadius);
    context.lineTo(centerX - markerRadius, centerY + markerRadius);
}

function traceTilePieceOPath(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    markerRadius: number,
) {
    context.beginPath();
    context.arc(centerX, centerY, markerRadius, 0, Math.PI * 2);
}

type RgbColor = {
    r: number
    g: number
    b: number
};

type TilePieceMarkerPalette = {
    tileTintColor: string
    tileOutlineShadowColor: string
    tileOutlineColor: string
    markerShadowColor: string
    markerOutlineColor: string
    markerFillColor: string
    accentColor: string
};

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(color: string): RgbColor | null {
    const normalizedColor = color.trim();
    const hexMatch = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(normalizedColor);
    if (!hexMatch) {
        return null;
    }

    const hexValue = hexMatch[1];
    if (hexValue.length === 3) {
        return {
            r: Number.parseInt(`${hexValue[0]}${hexValue[0]}`, 16),
            g: Number.parseInt(`${hexValue[1]}${hexValue[1]}`, 16),
            b: Number.parseInt(`${hexValue[2]}${hexValue[2]}`, 16),
        };
    }

    return {
        r: Number.parseInt(hexValue.slice(0, 2), 16),
        g: Number.parseInt(hexValue.slice(2, 4), 16),
        b: Number.parseInt(hexValue.slice(4, 6), 16),
    };
}

function mixRgbColor(baseColor: RgbColor, targetColor: RgbColor, amount: number): RgbColor {
    const safeAmount = Math.max(0, Math.min(1, amount));
    return {
        r: clampChannel(baseColor.r + (targetColor.r - baseColor.r) * safeAmount),
        g: clampChannel(baseColor.g + (targetColor.g - baseColor.g) * safeAmount),
        b: clampChannel(baseColor.b + (targetColor.b - baseColor.b) * safeAmount),
    };
}

function withAlpha(color: RgbColor, alpha: number): string {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function getRelativeLuminance(color: RgbColor): number {
    return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

function getTilePieceMarkerPalette(tileColor: string): TilePieceMarkerPalette {
    const parsedTileColor = parseHexColor(tileColor);
    if (!parsedTileColor) {
        return {
            tileTintColor: `rgba(255, 255, 255, 0.04)`,
            tileOutlineShadowColor: `rgba(15, 23, 42, 0.38)`,
            tileOutlineColor: `rgba(226, 232, 240, 0.92)`,
            markerShadowColor: `rgba(15, 23, 42, 0.26)`,
            markerOutlineColor: `rgba(15, 23, 42, 0.96)`,
            markerFillColor: `rgba(226, 232, 240, 0.98)`,
            accentColor: `rgba(255, 255, 255, 0.18)`,
        };
    }

    const slate900 = { r: 15, g: 23, b: 42 };
    const slate950 = { r: 2, g: 6, b: 23 };
    const white = { r: 255, g: 255, b: 255 };
    const luminance = getRelativeLuminance(parsedTileColor);
    const tileOutlineBase = luminance > 0.72
        ? mixRgbColor(parsedTileColor, slate900, 0.12)
        : mixRgbColor(parsedTileColor, white, 0.06);
    const markerOutlineBase = mixRgbColor(parsedTileColor, slate950, luminance > 0.62 ? 0.82 : 0.74);
    const accentBase = luminance > 0.62
        ? mixRgbColor(parsedTileColor, white, 0.22)
        : mixRgbColor(parsedTileColor, white, 0.38);

    return {
        tileTintColor: withAlpha(mixRgbColor(parsedTileColor, white, 0.2), 0.08),
        tileOutlineShadowColor: withAlpha(mixRgbColor(parsedTileColor, slate950, 0.8), 0.42),
        tileOutlineColor: withAlpha(tileOutlineBase, 0.98),
        markerShadowColor: withAlpha(mixRgbColor(parsedTileColor, slate950, 0.72), 0.28),
        markerOutlineColor: withAlpha(markerOutlineBase, 0.98),
        markerFillColor: withAlpha(parsedTileColor, 0.98),
        accentColor: withAlpha(accentBase, luminance > 0.62 ? 0.18 : 0.22),
    };
}

function drawTilePieceMarker(
    context: CanvasRenderingContext2D,
    marker: TilePieceMarker,
    centerX: number,
    centerY: number,
    hexRadius: number,
    tileColor: string,
) {
    const markerRadius = Math.max(5, hexRadius * 0.36);
    const lineWidth = Math.max(2.25, hexRadius * 0.16);
    const drawMarkerPath = marker === `X` ? traceTilePieceXPath : traceTilePieceOPath;
    const palette = getTilePieceMarkerPalette(tileColor);

    context.save();
    traceHexPath(context, centerX, centerY, Math.max(4, hexRadius - 4));
    context.clip();
    context.lineCap = `round`;
    context.lineJoin = `round`;

    context.save();
    context.translate(lineWidth * 0.14, lineWidth * 0.18);
    drawMarkerPath(context, centerX, centerY, markerRadius);
    context.strokeStyle = palette.markerShadowColor;
    context.lineWidth = lineWidth + Math.max(1.5, hexRadius * 0.04);
    context.stroke();
    context.restore();

    drawMarkerPath(context, centerX, centerY, markerRadius);
    context.strokeStyle = palette.markerOutlineColor;
    context.lineWidth = lineWidth + Math.max(0.75, hexRadius * 0.02);
    context.stroke();

    drawMarkerPath(context, centerX, centerY, markerRadius);
    context.strokeStyle = palette.markerFillColor;
    context.lineWidth = Math.max(1.5, lineWidth * 0.7);
    context.stroke();

    drawMarkerPath(context, centerX, centerY, markerRadius);
    context.strokeStyle = palette.accentColor;
    context.lineWidth = Math.max(1, lineWidth * 0.34);
    context.stroke();

    context.restore();
}

function useGameBoard({
    gameState: gameState,
    localPlayerId,
    interactionEnabled,
    onPlaceCell,
    highlightedCells,
    showTilePieceMarkers = false,
}: Readonly<UseGameBoardOptions>): UseGameBoardResult {
    const isSpectator = localPlayerId === null;
    const isOwnTurn = localPlayerId !== null && gameState.currentTurnPlayerId === localPlayerId;
    const canPlaceCell = interactionEnabled && Boolean(onPlaceCell) && isOwnTurn;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dragStateRef = useRef<DragState | null>(null);
    const highlightPointerStateRef = useRef<HighlightPointerState | null>(null);
    const pinchStateRef = useRef<PinchState | null>(null);
    const suppressTouchPlacementRef = useRef(false);
    const lastTouchInteractionAtRef = useRef(0);

    const viewRef = useRef<ViewState>({ offsetX: 0, offsetY: 0, scale: DEFAULT_SCALE });
    const animationFrameRef = useRef<number | null>(null);
    const hoveredCellRef = useRef<ReturnType<typeof pixelToAxial> | null>(null);
    const lineHighlightsRef = useRef<HexCell[][]>([]);

    const latestDataRef = useRef<{
        boardState: BoardState
        renderableCells: ReturnType<typeof buildRenderableCells>
        highlightedCellKeys: Set<string>
        interactionEnabled: boolean
        canPlaceCell: boolean
        isOwnTurn: boolean
    } | null>(null);

    const renderableCells = useMemo(
        () => buildRenderableCells(gameState.cells, gameState.playerTiles),
        [gameState.cells, gameState.playerTiles],
    );

    const highlightedCellKeys = useMemo(() => {
        const highlightedCellKeys = new Set<string>();

        if (highlightedCells === `last`) {
            const cell = gameState.cells[gameState.cells.length - 1];
            if (cell) {
                highlightedCellKeys.add(
                    getCellKey(cell.x, cell.y),
                );
            }
        } else if (highlightedCells === `turn`) {
            const targetPlayerId = gameState.cells[gameState.cells.length - 1]?.occupiedBy;
            for (let index = gameState.cells.length - 1; index >= 0; index--) {
                const cell = gameState.cells[index];
                if (cell.occupiedBy !== targetPlayerId) {
                    break;
                }

                highlightedCellKeys.add(
                    getCellKey(cell.x, cell.y),
                );
            }
        } else {
            for (const { x, y } of highlightedCells) {
                highlightedCellKeys.add(
                    getCellKey(x, y),
                );
            }
        }

        return highlightedCellKeys;
    }, [highlightedCells, !Array.isArray(highlightedCells) && gameState.cells]);

    latestDataRef.current = {
        boardState: gameState,
        renderableCells,
        highlightedCellKeys,
        interactionEnabled,
        canPlaceCell,
        isOwnTurn,
    };

    const drawBoard = () => {
        const canvas = canvasRef.current;
        const latestData = latestDataRef.current;
        if (!canvas || !latestData) {
            return;
        }

        const context = canvas.getContext(`2d`);
        if (!context) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));

        if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
        }

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = `#0f172a`;
        context.fillRect(0, 0, width, height);

        const { offsetX, offsetY, scale } = viewRef.current;
        const centerX = width / 2 + offsetX;
        const centerY = height / 2 + offsetY;
        const hexRadius = scale * 0.92;

        /* cell grid outlines */
        for (const cell of latestData.renderableCells.values()) {
            const screenX = centerX + cell.pointX * scale;
            const screenY = centerY + cell.pointY * scale;

            if (
                screenX + hexRadius < 0
                || screenY + hexRadius < 0
                || screenX - hexRadius > width
                || screenY - hexRadius > height
            ) {
                continue;
            }

            /* outline */
            traceHexPath(context, screenX, screenY, hexRadius);
            context.strokeStyle = GRID_LINE_COLOR;
            context.lineWidth = 1;
            context.stroke();

            if (cell.status === `occupied`) {
                if (showTilePieceMarkers) {
                    const markerPalette = getTilePieceMarkerPalette(cell.color);

                    traceHexPath(context, screenX, screenY, hexRadius - 2);
                    context.fillStyle = markerPalette.tileTintColor;
                    context.fill();

                    traceHexPath(context, screenX, screenY, hexRadius - 2);
                    context.strokeStyle = markerPalette.tileOutlineShadowColor;
                    context.lineWidth = Math.max(2.5, scale * 0.09);
                    context.stroke();

                    traceHexPath(context, screenX, screenY, hexRadius - 2);
                    context.strokeStyle = markerPalette.tileOutlineColor;
                    context.lineWidth = Math.max(1.6, scale * 0.055);
                    context.stroke();

                    drawTilePieceMarker(context, cell.marker, screenX, screenY, hexRadius, cell.color);
                } else {
                    traceHexPath(context, screenX, screenY, hexRadius - 2);
                    context.fillStyle = cell.color;
                    context.fill();
                }
            }

            /* highlight */
            if (latestData.highlightedCellKeys.has(cell.key)) {
                traceHexPath(context, screenX, screenY, hexRadius - 1);
                context.save();
                context.shadowBlur = Math.max(14, scale * 0.45);
                context.shadowColor = `rgba(248, 250, 252, 0.52)`;
                context.strokeStyle = `rgba(248, 250, 252, 0.96)`;
                context.lineWidth = Math.max(2, scale * 0.08);
                context.stroke();
                context.restore();

                traceHexPath(context, screenX, screenY, Math.max(4, hexRadius - 6));
                context.fillStyle = `rgba(255, 255, 255, 0.12)`;
                context.fill();
            }
        }

        const hoveredCell = hoveredCellRef.current;
        if (hoveredCell && latestData.canPlaceCell) {
            const hoveredKey = getCellKey(hoveredCell.x, hoveredCell.y);
            const renderedCell = latestData.renderableCells.get(hoveredKey);
            if (renderedCell?.status === `empty`) {
                const point = axialToUnitPoint(hoveredCell.x, hoveredCell.y);
                const screenX = centerX + point.x * scale;
                const screenY = centerY + point.y * scale;
                traceHexPath(context, screenX, screenY, hexRadius);
                context.fillStyle = `rgba(125, 211, 252, 0.18)`;
                context.fill();
                context.strokeStyle = `rgba(125, 211, 252, 0.55)`;
                context.lineWidth = 1.5;
                context.stroke();
            }
        }

        const activeLine = highlightPointerStateRef.current?.drawing
            ? highlightPointerStateRef.current.cells
            : null;
        const linesToDraw = activeLine
            ? [...lineHighlightsRef.current, activeLine]
            : lineHighlightsRef.current;

        for (const lineHighlightCells of linesToDraw) {
            if (lineHighlightCells.length === 0) {
                continue;
            }

            const linePoints = lineHighlightCells.map((cell) => {
                const point = axialToUnitPoint(cell.x, cell.y);
                return {
                    screenX: centerX + point.x * scale,
                    screenY: centerY + point.y * scale,
                };
            });

            context.save();
            context.lineCap = `round`;
            context.lineJoin = `round`;

            if (linePoints.length === 1) {
                const [point] = linePoints;

                traceHexPath(context, point.screenX, point.screenY, Math.max(4, hexRadius - 2));
                context.strokeStyle = `rgba(244, 114, 182, 0.96)`;
                context.lineWidth = Math.max(2, scale * 0.085);
                context.shadowBlur = Math.max(14, scale * 0.28);
                context.shadowColor = `rgba(244, 114, 182, 0.35)`;
                context.stroke();

                traceHexPath(context, point.screenX, point.screenY, Math.max(3, hexRadius - 6));
                context.fillStyle = `rgba(244, 114, 182, 0.14)`;
                context.fill();
            } else {
                const markerWidth = Math.max(6, scale * 0.24);

                context.beginPath();
                context.moveTo(linePoints[0].screenX, linePoints[0].screenY);
                for (const point of linePoints.slice(1)) {
                    context.lineTo(point.screenX, point.screenY);
                }

                context.strokeStyle = `rgba(15, 23, 42, 0.34)`;
                context.lineWidth = markerWidth + Math.max(2.5, scale * 0.08);
                context.shadowBlur = Math.max(18, scale * 0.34);
                context.shadowColor = `rgba(15, 23, 42, 0.2)`;
                context.stroke();

                context.shadowBlur = 0;
                context.strokeStyle = `rgba(244, 114, 182, 0.92)`;
                context.lineWidth = markerWidth;
                context.stroke();
            }

            context.restore();
        }
    };

    const scheduleDraw = () => {
        if (animationFrameRef.current !== null) {
            return;
        }

        animationFrameRef.current = window.requestAnimationFrame(() => {
            animationFrameRef.current = null;
            drawBoard();
        });
    };

    const screenToCell = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return null;
        }

        const rect = canvas.getBoundingClientRect();
        const localX = clientX - rect.left - rect.width / 2 - viewRef.current.offsetX;
        const localY = clientY - rect.top - rect.height / 2 - viewRef.current.offsetY;

        return pixelToAxial(localX / viewRef.current.scale, localY / viewRef.current.scale);
    };

    const applyZoomAtClientPoint = (clientX: number, clientY: number, nextScale: number) => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const safeScale = clampScale(nextScale);
        const anchorUnitX = (clientX - rect.left - rect.width / 2 - viewRef.current.offsetX) / viewRef.current.scale;
        const anchorUnitY = (clientY - rect.top - rect.height / 2 - viewRef.current.offsetY) / viewRef.current.scale;

        viewRef.current = {
            scale: safeScale,
            offsetX: clientX - rect.left - rect.width / 2 - anchorUnitX * safeScale,
            offsetY: clientY - rect.top - rect.height / 2 - anchorUnitY * safeScale,
        };
    };

    const tryPlaceCellAtClientPoint = (clientX: number, clientY: number) => {
        const latestData = latestDataRef.current;
        const targetCell = screenToCell(clientX, clientY);
        if (!latestData || !targetCell) {
            return;
        }

        const cellKey = getCellKey(targetCell.x, targetCell.y);
        if (latestData.canPlaceCell && latestData.renderableCells.get(cellKey)?.status === `empty`) {
            onPlaceCell?.(targetCell.x, targetCell.y);
        }
    };

    const clearInteractionState = () => {
        dragStateRef.current = null;
        highlightPointerStateRef.current = null;
        pinchStateRef.current = null;
    };

    const startHighlightPointerInteraction = (
        clientX: number,
        clientY: number,
        pointerButtonsMask: 1 | 2,
    ) => {
        const targetCell = screenToCell(clientX, clientY);
        if (!targetCell || !renderableCells.get(getCellKey(targetCell.x, targetCell.y))) {
            return false;
        }

        highlightPointerStateRef.current = {
            startX: clientX,
            startY: clientY,
            startCell: targetCell,
            pointerButtonsMask,
            drawing: false,
            cells: [targetCell],
        };
        hoveredCellRef.current = null;
        dragStateRef.current = null;
        pinchStateRef.current = null;
        return true;
    };

    const extendLineHighlightAtClientPoint = (clientX: number, clientY: number) => {
        const highlightPointerState = highlightPointerStateRef.current;
        const targetCell = screenToCell(clientX, clientY);
        if (!highlightPointerState || !targetCell) {
            return;
        }

        const deltaX = clientX - highlightPointerState.startX;
        const deltaY = clientY - highlightPointerState.startY;
        const movedEnough = Math.abs(deltaX) > DRAG_THRESHOLD_PX
            || Math.abs(deltaY) > DRAG_THRESHOLD_PX
            || !sameCell(highlightPointerState.startCell, targetCell);

        if (!highlightPointerState.drawing) {
            if (!movedEnough) {
                return;
            }

            highlightPointerState.drawing = true;
            highlightPointerState.cells = [highlightPointerState.startCell];
        }

        const nextLine = buildStraightHexLine(highlightPointerState.startCell, targetCell)
            .filter(cell => renderableCells.has(getCellKey(cell.x, cell.y)));

        const lastCell = nextLine[nextLine.length - 1];
        if (!lastCell || sameCell(lastCell, highlightPointerState.cells[highlightPointerState.cells.length - 1] ?? null)) {
            return;
        }

        highlightPointerState.cells = nextLine;
        scheduleDraw();
    };

    const getLineIndexAtCell = (targetCell: HexCell) => {
        for (let lineIndex = lineHighlightsRef.current.length - 1; lineIndex >= 0; lineIndex -= 1) {
            const matchesCell = lineHighlightsRef.current[lineIndex]?.some((cell) => sameCell(cell, targetCell));
            if (matchesCell) {
                return lineIndex;
            }
        }

        return -1;
    };

    const finishHighlightPointerInteraction = (clientX: number, clientY: number) => {
        const lineDragState = highlightPointerStateRef.current;
        highlightPointerStateRef.current = null;

        if (!lineDragState) {
            return;
        }

        const targetCell = screenToCell(clientX, clientY) ?? lineDragState.startCell;

        if (!lineDragState.drawing) {
            /* we clicked a single cell */
            const lineIndex = getLineIndexAtCell(targetCell);
            if (lineIndex >= 0) {
                /* remove the line */
                lineHighlightsRef.current.splice(lineIndex, 1);
            } else {
                /* higlight the cell */
                lineHighlightsRef.current = [...lineHighlightsRef.current, [targetCell]];
            }
        } else {
            /* finalize the line itself */
            lineDragState.cells = buildStraightHexLine(lineDragState.startCell, targetCell)
                .filter(cell => renderableCells.has(getCellKey(cell.x, cell.y)));

            if (lineDragState.cells.length >= 2) {
                lineHighlightsRef.current = [...lineHighlightsRef.current, lineDragState.cells];
            }
        }

        scheduleDraw();
    };

    const markTouchInteraction = () => {
        lastTouchInteractionAtRef.current = Date.now();
    };

    const shouldIgnoreMouseEvent = () =>
        Date.now() - lastTouchInteractionAtRef.current < MOUSE_AFTER_TOUCH_IGNORE_MS;

    const resetView = () => {
        viewRef.current = { offsetX: 0, offsetY: 0, scale: DEFAULT_SCALE };
        lineHighlightsRef.current = [];
        highlightPointerStateRef.current = null;
        scheduleDraw();
    };

    useEffect(() => {
        scheduleDraw();
    }, [
        gameState, renderableCells, highlightedCellKeys, interactionEnabled, canPlaceCell, isOwnTurn,
    ]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const resizeObserver = new ResizeObserver(() => {
            scheduleDraw();
        });
        resizeObserver.observe(canvas);
        scheduleDraw();

        return () => {
            resizeObserver.disconnect();
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, []);

    return {
        canvasRef,
        canvasClassName: `absolute inset-0 h-full w-full touch-none select-none ${interactionEnabled
            ? (canPlaceCell || isSpectator ? `cursor-grab active:cursor-grabbing` : `cursor-not-allowed`)
            : `cursor-default`
        }`,
        canvasHandlers: {
            onContextMenu: (event) => {
                event.preventDefault();
            },
            onMouseDown: (event) => {
                if (!interactionEnabled || shouldIgnoreMouseEvent()) {
                    return;
                }

                const isHighlightPointerDown = event.button === 2 || (event.button === 0 && event.shiftKey);
                if (isHighlightPointerDown) {
                    event.preventDefault();
                    startHighlightPointerInteraction(
                        event.clientX,
                        event.clientY,
                        event.button === 2 ? 2 : 1,
                    );
                    return;
                }

                if (event.button !== 0) {
                    return;
                }

                dragStateRef.current = {
                    startX: event.clientX,
                    startY: event.clientY,
                    originOffsetX: viewRef.current.offsetX,
                    originOffsetY: viewRef.current.offsetY,
                    moved: false,
                };
            },
            onMouseMove: (event) => {
                if (!interactionEnabled || shouldIgnoreMouseEvent()) {
                    return;
                }

                if (highlightPointerStateRef.current) {
                    if ((event.buttons & highlightPointerStateRef.current.pointerButtonsMask) === 0) {
                        finishHighlightPointerInteraction(event.clientX, event.clientY);
                        return;
                    }

                    extendLineHighlightAtClientPoint(event.clientX, event.clientY);
                    return;
                }

                const nextCell = canPlaceCell ? screenToCell(event.clientX, event.clientY) : null;
                if (!sameCell(hoveredCellRef.current, nextCell)) {
                    hoveredCellRef.current = nextCell;
                    scheduleDraw();
                }

                const dragState = dragStateRef.current;
                if (!dragState) {
                    return;
                }

                const deltaX = event.clientX - dragState.startX;
                const deltaY = event.clientY - dragState.startY;
                if (Math.abs(deltaX) > DRAG_THRESHOLD_PX || Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
                    dragState.moved = true;
                }

                viewRef.current = {
                    ...viewRef.current,
                    offsetX: dragState.originOffsetX + deltaX,
                    offsetY: dragState.originOffsetY + deltaY,
                };
                scheduleDraw();
            },
            onMouseLeave: () => {
                if (!interactionEnabled || shouldIgnoreMouseEvent()) {
                    return;
                }

                const hadActiveLine = highlightPointerStateRef.current !== null;
                dragStateRef.current = null;
                highlightPointerStateRef.current = null;
                if (hoveredCellRef.current !== null) {
                    hoveredCellRef.current = null;
                    scheduleDraw();
                } else if (hadActiveLine) {
                    scheduleDraw();
                }
            },
            onMouseUp: (event) => {
                if (!interactionEnabled || shouldIgnoreMouseEvent()) {
                    return;
                }

                const isHighlightPointerUp
                    = event.button === 2
                    || (event.button === 0 && highlightPointerStateRef.current?.pointerButtonsMask === 1);
                if (isHighlightPointerUp) {
                    event.preventDefault();
                    finishHighlightPointerInteraction(event.clientX, event.clientY);
                    return;
                }

                if (event.button !== 0) {
                    return;
                }

                const dragState = dragStateRef.current;
                dragStateRef.current = null;

                if (!dragState || dragState.moved) {
                    return;
                }

                tryPlaceCellAtClientPoint(event.clientX, event.clientY);
            },
            onWheel: (event) => {
                if (!interactionEnabled) {
                    return;
                }

                const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
                applyZoomAtClientPoint(event.clientX, event.clientY, viewRef.current.scale * zoomFactor);
                scheduleDraw();
            },
            onTouchStart: (event) => {
                if (!interactionEnabled) {
                    return;
                }

                event.preventDefault();
                markTouchInteraction();

                if (event.touches.length === 1) {
                    suppressTouchPlacementRef.current = false;
                    const touch = event.touches[0];
                    hoveredCellRef.current = canPlaceCell ? screenToCell(touch.clientX, touch.clientY) : null;
                    dragStateRef.current = {
                        startX: touch.clientX,
                        startY: touch.clientY,
                        originOffsetX: viewRef.current.offsetX,
                        originOffsetY: viewRef.current.offsetY,
                        moved: false,
                    };
                    pinchStateRef.current = null;
                    scheduleDraw();
                    return;
                }

                suppressTouchPlacementRef.current = true;
                const canvas = canvasRef.current;
                const center = getTouchCenter(event.touches);
                const distance = getTouchDistance(event.touches);
                if (!canvas || !center || distance === 0) {
                    return;
                }

                const rect = canvas.getBoundingClientRect();
                pinchStateRef.current = {
                    startDistance: distance,
                    startScale: viewRef.current.scale,
                    anchorUnitX: (center.x - rect.left - rect.width / 2 - viewRef.current.offsetX) / viewRef.current.scale,
                    anchorUnitY: (center.y - rect.top - rect.height / 2 - viewRef.current.offsetY) / viewRef.current.scale,
                };
                dragStateRef.current = null;
                hoveredCellRef.current = null;
                scheduleDraw();
            },
            onTouchMove: (event) => {
                if (!interactionEnabled) {
                    return;
                }

                event.preventDefault();
                markTouchInteraction();

                if (event.touches.length >= 2) {
                    suppressTouchPlacementRef.current = true;
                    const pinchState = pinchStateRef.current;
                    const canvas = canvasRef.current;
                    const center = getTouchCenter(event.touches);
                    const distance = getTouchDistance(event.touches);
                    if (!pinchState || !canvas || !center || distance === 0) {
                        return;
                    }

                    const rect = canvas.getBoundingClientRect();
                    const nextScale = clampScale(pinchState.startScale * (distance / pinchState.startDistance));
                    viewRef.current = {
                        scale: nextScale,
                        offsetX: center.x - rect.left - rect.width / 2 - pinchState.anchorUnitX * nextScale,
                        offsetY: center.y - rect.top - rect.height / 2 - pinchState.anchorUnitY * nextScale,
                    };
                    hoveredCellRef.current = null;
                    scheduleDraw();
                    return;
                }

                const dragState = dragStateRef.current;
                const touch = event.touches[0];
                if (!dragState || !touch) {
                    return;
                }

                const nextCell = canPlaceCell ? screenToCell(touch.clientX, touch.clientY) : null;
                if (!sameCell(hoveredCellRef.current, nextCell)) {
                    hoveredCellRef.current = nextCell;
                }

                const deltaX = touch.clientX - dragState.startX;
                const deltaY = touch.clientY - dragState.startY;
                if (Math.abs(deltaX) > DRAG_THRESHOLD_PX || Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
                    dragState.moved = true;
                }

                if (dragState.moved) {
                    viewRef.current = {
                        ...viewRef.current,
                        offsetX: dragState.originOffsetX + deltaX,
                        offsetY: dragState.originOffsetY + deltaY,
                    };
                }

                scheduleDraw();
            },
            onTouchEnd: (event) => {
                if (!interactionEnabled) {
                    return;
                }

                event.preventDefault();
                markTouchInteraction();

                if (event.touches.length >= 2) {
                    suppressTouchPlacementRef.current = true;
                    const canvas = canvasRef.current;
                    const center = getTouchCenter(event.touches);
                    const distance = getTouchDistance(event.touches);
                    if (!canvas || !center || distance === 0) {
                        clearInteractionState();
                        return;
                    }

                    const rect = canvas.getBoundingClientRect();
                    pinchStateRef.current = {
                        startDistance: distance,
                        startScale: viewRef.current.scale,
                        anchorUnitX: (center.x - rect.left - rect.width / 2 - viewRef.current.offsetX) / viewRef.current.scale,
                        anchorUnitY: (center.y - rect.top - rect.height / 2 - viewRef.current.offsetY) / viewRef.current.scale,
                    };
                    dragStateRef.current = null;
                    return;
                }

                if (event.touches.length === 1) {
                    const touch = event.touches[0];
                    hoveredCellRef.current = canPlaceCell ? screenToCell(touch.clientX, touch.clientY) : null;
                    dragStateRef.current = {
                        startX: touch.clientX,
                        startY: touch.clientY,
                        originOffsetX: viewRef.current.offsetX,
                        originOffsetY: viewRef.current.offsetY,
                        moved: false,
                    };
                    pinchStateRef.current = null;
                    scheduleDraw();
                    return;
                }

                const dragState = dragStateRef.current;
                const lastTouch = event.changedTouches[0];
                if (!suppressTouchPlacementRef.current && dragState && !dragState.moved && lastTouch) {
                    tryPlaceCellAtClientPoint(lastTouch.clientX, lastTouch.clientY);
                }

                suppressTouchPlacementRef.current = false;
                hoveredCellRef.current = null;
                clearInteractionState();
                scheduleDraw();
            },
            onTouchCancel: (event) => {
                event.preventDefault();
                markTouchInteraction();
                suppressTouchPlacementRef.current = false;
                hoveredCellRef.current = null;
                clearInteractionState();
                scheduleDraw();
            },
        },
        renderableCellCount: renderableCells.size,
        resetView,
    };
}

export default useGameBoard;
