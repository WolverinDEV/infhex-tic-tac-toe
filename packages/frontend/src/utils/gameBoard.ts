import { PLACE_CELL_HEX_RADIUS, getCellKey, getHexDistance } from '@ih3t/shared'
import type { BoardCell, DatabaseGamePlayer, PlayerNames, PlayerTileConfig } from '@ih3t/shared'

export const HEX_RADIUS = PLACE_CELL_HEX_RADIUS
export { getCellKey }
export const MIN_SCALE = 12
export const MAX_SCALE = 200
export const DEFAULT_SCALE = 42
export const GRID_LINE_COLOR = 'rgba(148, 163, 184, 0.18)'

const SQRT_THREE = Math.sqrt(3)

export interface HexCell {
    x: number
    y: number
}

interface CubeCell {
    x: number
    y: number
    z: number
}

export type TilePieceMarker = 'X' | 'O'

type RenderableCellStatus = {
    status: "empty"
} | {
    status: "occupied",
    color: string,
    marker: TilePieceMarker,
};

export type RenderableCell = HexCell & RenderableCellStatus & {
    key: string

    pointX: number
    pointY: number
};


const STRAIGHT_HEX_DIRECTIONS: readonly HexCell[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: -1 }
]

type PlayerReference = string | DatabaseGamePlayer

function getPlayerId(player: PlayerReference): string {
    return typeof player === 'string' ? player : player.playerId
}

function getDatabasePlayerDisplayName(players: readonly PlayerReference[], playerId: string): string | null {
    const player = players.find((candidate) => typeof candidate !== 'string' && candidate.playerId === playerId)
    if (!player || typeof player === 'string') {
        return null
    }

    return player.displayName.trim() || null
}

export function getPlayerTileColor(
    playerTiles: Record<string, PlayerTileConfig> | null | undefined,
    playerId: string
): string {
    return playerTiles?.[playerId]?.color ?? '#FF00FF'
}

export function getPlayerLabel(
    players: readonly PlayerReference[],
    playerId: string | null,
    playerNames?: PlayerNames,
    fallbackName: string = 'A player'
): string {
    if (!playerId) {
        return fallbackName
    }

    const embeddedPlayerName = getDatabasePlayerDisplayName(players, playerId)
    if (embeddedPlayerName) {
        return embeddedPlayerName
    }

    const playerName = playerNames?.[playerId]?.trim()
    if (playerName) {
        return playerName
    }

    const playerIndex = players.findIndex((player) => getPlayerId(player) === playerId)
    if (playerIndex === -1) {
        return fallbackName
    }

    return `Player ${playerIndex + 1}`
}

export function axialToUnitPoint(x: number, y: number) {
    return {
        x: SQRT_THREE * (x + y / 2),
        y: 1.5 * y
    }
}

export function pixelToAxial(unitX: number, unitY: number): HexCell {
    const fractionalX = (SQRT_THREE / 3) * unitX - unitY / 3
    const fractionalY = (2 / 3) * unitY
    return roundAxial(fractionalX, fractionalY)
}

export function traceHexPath(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
) {
    context.beginPath()
    for (let corner = 0; corner < 6; corner += 1) {
        const angle = (Math.PI / 180) * (60 * corner - 30)
        const x = centerX + radius * Math.cos(angle)
        const y = centerY + radius * Math.sin(angle)
        if (corner === 0) {
            context.moveTo(x, y)
        } else {
            context.lineTo(x, y)
        }
    }
    context.closePath()
}

export function sameCell(a: HexCell | null, b: HexCell | null) {
    if (!a && !b) return true
    if (!a || !b) return false
    return a.x === b.x && a.y === b.y
}

export function buildHexLine(start: HexCell, end: HexCell): HexCell[] {
    const distance = getHexDistance(start, end)
    if (distance === 0) {
        return [{ x: start.x, y: start.y }]
    }

    const startCube = axialToCube(start)
    const endCube = axialToCube(end)
    const cells: HexCell[] = []

    for (let step = 0; step <= distance; step += 1) {
        const progress = step / distance
        const cube = roundCube({
            x: lerp(startCube.x, endCube.x, progress),
            y: lerp(startCube.y, endCube.y, progress),
            z: lerp(startCube.z, endCube.z, progress)
        })
        const cell = { x: cube.x, y: cube.z }
        if (!sameCell(cells[cells.length - 1] ?? null, cell)) {
            cells.push(cell)
        }
    }

    return cells
}

export function buildStraightHexLine(start: HexCell, end: HexCell): HexCell[] {
    if (sameCell(start, end)) {
        return [{ x: start.x, y: start.y }]
    }

    const startPoint = axialToUnitPoint(start.x, start.y)
    const endPoint = axialToUnitPoint(end.x, end.y)
    const deltaX = endPoint.x - startPoint.x
    const deltaY = endPoint.y - startPoint.y

    let closestEndCell: HexCell | null = null
    let closestDistanceSquared = Number.POSITIVE_INFINITY
    let closestStepMagnitude = Number.POSITIVE_INFINITY

    for (const direction of STRAIGHT_HEX_DIRECTIONS) {
        const directionPoint = axialToUnitPoint(direction.x, direction.y)
        const directionLengthSquared = directionPoint.x ** 2 + directionPoint.y ** 2
        const projectedSteps = Math.round((deltaX * directionPoint.x + deltaY * directionPoint.y) / directionLengthSquared)
        const candidateEndCell = {
            x: start.x + direction.x * projectedSteps,
            y: start.y + direction.y * projectedSteps
        }
        const candidatePoint = axialToUnitPoint(candidateEndCell.x, candidateEndCell.y)
        const candidateDeltaX = endPoint.x - candidatePoint.x
        const candidateDeltaY = endPoint.y - candidatePoint.y
        const candidateDistanceSquared = candidateDeltaX ** 2 + candidateDeltaY ** 2
        const candidateStepMagnitude = Math.abs(projectedSteps)

        if (
            candidateDistanceSquared < closestDistanceSquared
            || (candidateDistanceSquared === closestDistanceSquared && candidateStepMagnitude < closestStepMagnitude)
        ) {
            closestEndCell = candidateEndCell
            closestDistanceSquared = candidateDistanceSquared
            closestStepMagnitude = candidateStepMagnitude
        }
    }

    return buildHexLine(start, closestEndCell ?? end)
}

export function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function getTouchDistance(touches: React.TouchList): number {
    if (touches.length < 2) {
        return 0
    }

    const [firstTouch, secondTouch] = [touches[0], touches[1]]
    const deltaX = firstTouch.clientX - secondTouch.clientX
    const deltaY = firstTouch.clientY - secondTouch.clientY
    return Math.hypot(deltaX, deltaY)
}

export function getTouchCenter(touches: React.TouchList) {
    if (touches.length === 0) {
        return null
    }

    if (touches.length === 1) {
        return {
            x: touches[0].clientX,
            y: touches[0].clientY
        }
    }

    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    }
}


export function buildRenderableCells(cells: BoardCell[], tileConfigs: Record<string, PlayerTileConfig>): Map<string, RenderableCell> {
    const renderableCells = new Map<string, RenderableCell>()

    if (cells.length === 0) {
        const origin = axialToUnitPoint(0, 0)
        renderableCells.set(getCellKey(0, 0), {
            key: getCellKey(0, 0),

            x: 0,
            y: 0,

            pointX: origin.x,
            pointY: origin.y,

            status: "empty"
        })
        return renderableCells
    }

    const playerIds = Object.keys(tileConfigs);
    for (const cell of cells) {
        for (let x = cell.x - HEX_RADIUS; x <= cell.x + HEX_RADIUS; x += 1) {
            for (let y = cell.y - HEX_RADIUS; y <= cell.y + HEX_RADIUS; y += 1) {
                if (getHexDistance(cell, { x, y }) <= HEX_RADIUS) {
                    const key = getCellKey(x, y)
                    if (!renderableCells.has(key)) {
                        const point = axialToUnitPoint(x, y)
                        renderableCells.set(key, {
                            key,
                            x, y,
                            pointX: point.x, pointY: point.y,
                            status: "empty"
                        })
                    }
                }
            }
        }

        const key = getCellKey(cell.x, cell.y)
        const point = axialToUnitPoint(cell.x, cell.y)
        renderableCells.set(key, {
            key,

            x: cell.x,
            y: cell.y,

            pointX: point.x,
            pointY: point.y,

            status: "occupied",

            color: tileConfigs[cell.occupiedBy]?.color ?? "#FF00FF",
            marker: playerIds[0] === cell.occupiedBy ? 'X' : 'O'
        })
    }

    return renderableCells
}

function axialToCube(cell: HexCell): CubeCell {
    return {
        x: cell.x,
        y: -cell.x - cell.y,
        z: cell.y
    }
}

function lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress
}

function roundAxial(x: number, y: number): HexCell {
    const roundedCube = roundCube({
        x,
        y: -x - y,
        z: y
    })

    return {
        x: roundedCube.x,
        y: roundedCube.z
    }
}

function roundCube(cube: CubeCell): CubeCell {
    let roundedX = Math.round(cube.x)
    let roundedY = Math.round(cube.y)
    let roundedZ = Math.round(cube.z)

    const xDiff = Math.abs(roundedX - cube.x)
    const yDiff = Math.abs(roundedY - cube.y)
    const zDiff = Math.abs(roundedZ - cube.z)

    if (xDiff > yDiff && xDiff > zDiff) {
        roundedX = -roundedY - roundedZ
    } else if (yDiff > zDiff) {
        roundedY = -roundedX - roundedZ
    } else {
        roundedZ = -roundedX - roundedY
    }

    return {
        x: roundedX,
        y: roundedY,
        z: roundedZ
    }
}
