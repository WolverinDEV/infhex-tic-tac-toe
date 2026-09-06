import {
    CellKey,
    type PlayerColorIndex,
    getCellKey,
    getHexDistance,
    type HexCoordinate,
    PLACE_CELL_HEX_RADIUS,
} from "@ih3t/shared";

import type { BoardState, CellMarker } from ".";

export const MIN_SCALE = 2;
export const MAX_SCALE = 200;
export const kDefaultScale = 42;

const SQRT_THREE = Math.sqrt(3);
const STRAIGHT_HEX_DIRECTIONS: readonly HexCoordinate[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: -1 },
];

type CubeCell = {
    x: number;
    y: number;
    z: number;
};

type EmptyRenderableCell = HexCoordinate & {
    key: CellKey;
    pointX: number;
    pointY: number;
    status: `empty`;
};

type OccupiedRenderableCell = Omit<EmptyRenderableCell, `status`> & {
    status: `occupied`;
    marker: CellMarker;
    colorIndex: PlayerColorIndex;
};

export type RenderableCell = EmptyRenderableCell | OccupiedRenderableCell;

export function axialToUnitPoint(x: number, y: number) {
    return {
        x: SQRT_THREE * (x + y / 2),
        y: 1.5 * y,
    };
}

export function pixelToAxial(unitX: number, unitY: number): HexCoordinate {
    return roundAxial((SQRT_THREE / 3) * unitX - unitY / 3, (2 / 3) * unitY);
}

export function buildRenderableCells(
    state: BoardState,
): Map<string, RenderableCell> {
    const cells = new Map<string, RenderableCell>();

    if (state.placedCells.length === 0) {
        addEmptyCell(cells, 0, 0);
        return cells;
    }

    for (const placedCell of state.placedCells) {
        for (
            let x = placedCell.x - PLACE_CELL_HEX_RADIUS;
            x <= placedCell.x + PLACE_CELL_HEX_RADIUS;
            x += 1
        ) {
            for (
                let y = placedCell.y - PLACE_CELL_HEX_RADIUS;
                y <= placedCell.y + PLACE_CELL_HEX_RADIUS;
                y += 1
            ) {
                if (
                    getHexDistance(placedCell, { x, y }) <=
                    PLACE_CELL_HEX_RADIUS
                ) {
                    addEmptyCell(cells, x, y);
                }
            }
        }

        const key = getCellKey(placedCell.x, placedCell.y);
        const point = axialToUnitPoint(placedCell.x, placedCell.y);
        cells.set(key, {
            key,
            
            x: placedCell.x,
            y: placedCell.y,

            pointX: point.x,
            pointY: point.y,

            status: `occupied`,
            marker: placedCell.marker,
            colorIndex: placedCell.colorIndex,
        });
    }

    return cells;
}

export function getRenderableCellCount(state: BoardState): number {
    return buildRenderableCells(state).size;
}

export function buildStraightHexLine(
    start: HexCoordinate,
    end: HexCoordinate,
): HexCoordinate[] {
    if (sameCell(start, end)) {
        return [{ x: start.x, y: start.y }];
    }

    const startPoint = axialToUnitPoint(start.x, start.y);
    const endPoint = axialToUnitPoint(end.x, end.y);
    const deltaX = endPoint.x - startPoint.x;
    const deltaY = endPoint.y - startPoint.y;

    let closestEndCell = end;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    let closestStepMagnitude = Number.POSITIVE_INFINITY;

    for (const direction of STRAIGHT_HEX_DIRECTIONS) {
        const directionPoint = axialToUnitPoint(direction.x, direction.y);
        const directionLengthSquared =
            directionPoint.x ** 2 + directionPoint.y ** 2;
        const projectedSteps = Math.round(
            (deltaX * directionPoint.x + deltaY * directionPoint.y) /
                directionLengthSquared,
        );
        const candidateEndCell = {
            x: start.x + direction.x * projectedSteps,
            y: start.y + direction.y * projectedSteps,
        };
        const candidatePoint = axialToUnitPoint(
            candidateEndCell.x,
            candidateEndCell.y,
        );
        const distanceSquared =
            (endPoint.x - candidatePoint.x) ** 2 +
            (endPoint.y - candidatePoint.y) ** 2;
        const stepMagnitude = Math.abs(projectedSteps);

        if (
            distanceSquared < closestDistanceSquared ||
            (distanceSquared === closestDistanceSquared &&
                stepMagnitude < closestStepMagnitude)
        ) {
            closestEndCell = candidateEndCell;
            closestDistanceSquared = distanceSquared;
            closestStepMagnitude = stepMagnitude;
        }
    }

    return buildHexLine(start, closestEndCell);
}

export function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function sameCell(
    first: HexCoordinate | null,
    second: HexCoordinate | null,
): boolean {
    if (!first && !second) return true;
    if (!first || !second) return false;
    return first.x === second.x && first.y === second.y;
}

export function traceHexPath(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
) {
    context.beginPath();
    for (let corner = 0; corner < 6; corner += 1) {
        const angle = (Math.PI / 180) * (60 * corner - 30);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        if (corner === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    }
    context.closePath();
}

function addEmptyCell(
    cells: Map<string, RenderableCell>,
    x: number,
    y: number,
) {
    const key = getCellKey(x, y);
    if (cells.has(key)) {
        return;
    }

    const point = axialToUnitPoint(x, y);
    cells.set(key, {
        key,
        x,
        y,
        pointX: point.x,
        pointY: point.y,
        status: `empty`,
    });
}

function buildHexLine(
    start: HexCoordinate,
    end: HexCoordinate,
): HexCoordinate[] {
    const distance = getHexDistance(start, end);
    if (distance === 0) {
        return [{ x: start.x, y: start.y }];
    }

    const startCube = axialToCube(start);
    const endCube = axialToCube(end);
    const cells: HexCoordinate[] = [];

    for (let step = 0; step <= distance; step += 1) {
        const progress = step / distance;
        const cube = roundCube({
            x: lerp(startCube.x, endCube.x, progress),
            y: lerp(startCube.y, endCube.y, progress),
            z: lerp(startCube.z, endCube.z, progress),
        });
        const cell = { x: cube.x, y: cube.z };
        if (!sameCell(cells.at(-1) ?? null, cell)) {
            cells.push(cell);
        }
    }

    return cells;
}

function axialToCube(cell: HexCoordinate): CubeCell {
    return {
        x: cell.x,
        y: -cell.x - cell.y,
        z: cell.y,
    };
}

function lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
}

function roundAxial(x: number, y: number): HexCoordinate {
    const cube = roundCube({ x, y: -x - y, z: y });
    return { x: cube.x, y: cube.z };
}

function roundCube(cube: CubeCell): CubeCell {
    let x = Math.round(cube.x);
    let y = Math.round(cube.y);
    let z = Math.round(cube.z);

    const xDiff = Math.abs(x - cube.x);
    const yDiff = Math.abs(y - cube.y);
    const zDiff = Math.abs(z - cube.z);

    if (xDiff > yDiff && xDiff > zDiff) {
        x = -y - z;
    } else if (yDiff > zDiff) {
        y = -x - z;
    } else {
        z = -x - y;
    }

    return { x, y, z };
}
