import type { BoardCell } from '@ih3t/shared'

export const HEX_RADIUS = 8
export const TURN_TIMEOUT_MS = 45_000
export const MIN_SCALE = 18
export const MAX_SCALE = 96
export const DEFAULT_SCALE = 42
export const GRID_LINE_COLOR = 'rgba(148, 163, 184, 0.18)'
export const ORIGIN_LINE_COLOR = 'rgba(125, 211, 252, 0.55)'

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

export interface RenderableCell extends HexCell {
  key: string
  pointX: number
  pointY: number
}

export function getPlayerColor(players: string[], playerId: string): string {
  const palette = ['#fbbf24', '#38bdf8', '#f472b6', '#34d399', '#c084fc', '#fb7185']
  const index = players.indexOf(playerId)

  if (index === -1) {
    return palette[0]
  }

  return palette[Math.min(index, palette.length - 1)]
}

export function getCellKey(x: number, y: number): string {
  return `${x},${y}`
}

export function getPlayerLabel(players: string[], playerId: string | null): string {
  if (!playerId) {
    return 'Waiting for a player'
  }

  const playerIndex = players.indexOf(playerId)
  if (playerIndex === -1) {
    return 'A player'
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

export function formatCountdown(milliseconds: number | null): string {
  if (milliseconds === null) {
    return '--:--'
  }

  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function getTouchDistance(touches: TouchList): number {
  if (touches.length < 2) {
    return 0
  }

  const [firstTouch, secondTouch] = [touches[0], touches[1]]
  const deltaX = firstTouch.clientX - secondTouch.clientX
  const deltaY = firstTouch.clientY - secondTouch.clientY
  return Math.hypot(deltaX, deltaY)
}

export function getTouchCenter(touches: TouchList) {
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

export function buildRenderableCells(cells: BoardCell[]): RenderableCell[] {
  const renderableCells = new Map<string, RenderableCell>()

  if (cells.length === 0) {
    const origin = axialToUnitPoint(0, 0)
    renderableCells.set(getCellKey(0, 0), {
      key: getCellKey(0, 0),
      x: 0,
      y: 0,
      pointX: origin.x,
      pointY: origin.y
    })
    return [...renderableCells.values()]
  }

  for (const cell of cells) {
    for (let x = cell.x - HEX_RADIUS; x <= cell.x + HEX_RADIUS; x += 1) {
      for (let y = cell.y - HEX_RADIUS; y <= cell.y + HEX_RADIUS; y += 1) {
        if (hexDistance(cell, { x, y }) <= HEX_RADIUS) {
          const key = getCellKey(x, y)
          if (!renderableCells.has(key)) {
            const point = axialToUnitPoint(x, y)
            renderableCells.set(key, { key, x, y, pointX: point.x, pointY: point.y })
          }
        }
      }
    }
  }

  return [...renderableCells.values()]
}

function hexDistance(a: HexCell, b: HexCell): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs((a.x + a.y) - (b.x + b.y))) / 2
}

function roundAxial(x: number, y: number): HexCell {
  const cube = roundCube({ x, y: -x - y, z: y })
  return { x: cube.x, y: cube.z }
}

function roundCube(cube: CubeCell): CubeCell {
  let roundedX = Math.round(cube.x)
  let roundedY = Math.round(cube.y)
  let roundedZ = Math.round(cube.z)

  const deltaX = Math.abs(roundedX - cube.x)
  const deltaY = Math.abs(roundedY - cube.y)
  const deltaZ = Math.abs(roundedZ - cube.z)

  if (deltaX > deltaY && deltaX > deltaZ) {
    roundedX = -roundedY - roundedZ
  } else if (deltaY > deltaZ) {
    roundedY = -roundedX - roundedZ
  } else {
    roundedZ = -roundedX - roundedY
  }

  return { x: roundedX, y: roundedY, z: roundedZ }
}
