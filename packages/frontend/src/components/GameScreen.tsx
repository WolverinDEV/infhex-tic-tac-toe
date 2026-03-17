import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardState } from '@ih3t/shared'

const HEX_RADIUS = 8
const TURN_TIMEOUT_MS = 45_000
const MIN_SCALE = 18
const MAX_SCALE = 96
const DEFAULT_SCALE = 42
const SQRT_THREE = Math.sqrt(3)
const GRID_LINE_COLOR = 'rgba(148, 163, 184, 0.18)'
const ORIGIN_LINE_COLOR = 'rgba(125, 211, 252, 0.55)'

interface ViewState {
  offsetX: number
  offsetY: number
  scale: number
}

interface DragState {
  startX: number
  startY: number
  originOffsetX: number
  originOffsetY: number
  moved: boolean
}

interface HexCell {
  x: number
  y: number
}

interface CubeCell {
  x: number
  y: number
  z: number
}

interface RenderableCell extends HexCell {
  key: string
  pointX: number
  pointY: number
}

interface HudState {
  hoveredCell: HexCell | null
  scale: number
}

interface GameScreenProps {
  sessionId: string
  players: string[]
  isHost: boolean
  currentPlayerId: string
  boardState: BoardState
  onPlaceCell: (x: number, y: number) => void
  onLeave: () => void
}

function getPlayerColor(playerId: string): string {
  const palette = ['#fbbf24', '#38bdf8', '#f472b6', '#34d399', '#c084fc', '#fb7185']
  let hash = 0
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) >>> 0
  }

  return palette[hash % palette.length]
}

function getCellKey(x: number, y: number): string {
  return `${x},${y}`
}

function hexDistance(a: HexCell, b: HexCell): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs((a.x + a.y) - (b.x + b.y))) / 2
}

function axialToUnitPoint(x: number, y: number) {
  return {
    x: SQRT_THREE * (x + y / 2),
    y: 1.5 * y
  }
}

function pixelToAxial(unitX: number, unitY: number): HexCell {
  const fractionalX = (SQRT_THREE / 3) * unitX - (1 / 3) * unitY
  const fractionalY = (2 / 3) * unitY
  return roundAxial(fractionalX, fractionalY)
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

function traceHexPath(context: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
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

function sameCell(a: HexCell | null, b: HexCell | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y
}

function formatCountdown(milliseconds: number | null): string {
  if (milliseconds === null) {
    return '--:--'
  }

  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function GameScreen({
  sessionId,
  players,
  isHost,
  currentPlayerId,
  boardState,
  onPlaceCell,
  onLeave
}: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const viewRef = useRef<ViewState>({ offsetX: 0, offsetY: 0, scale: DEFAULT_SCALE })
  const hoveredCellRef = useRef<HexCell | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const latestDataRef = useRef<{
    boardState: BoardState
    renderableCells: RenderableCell[]
    renderableCellSet: Set<string>
    cellMap: Map<string, string>
  } | null>(null)
  const [hudState, setHudState] = useState<HudState>({
    hoveredCell: null,
    scale: DEFAULT_SCALE
  })
  const [turnCountdownMs, setTurnCountdownMs] = useState<number | null>(TURN_TIMEOUT_MS)

  const cellMap = useMemo(() => {
    return new Map(boardState.cells.map((cell) => [getCellKey(cell.x, cell.y), cell.occupiedBy]))
  }, [boardState])

  const renderableCells = useMemo(() => {
    const cells = new Map<string, RenderableCell>()

    if (boardState.cells.length === 0) {
      const origin = axialToUnitPoint(0, 0)
      cells.set(getCellKey(0, 0), { key: getCellKey(0, 0), x: 0, y: 0, pointX: origin.x, pointY: origin.y })
      return [...cells.values()]
    }

    for (const cell of boardState.cells) {
      for (let x = cell.x - HEX_RADIUS; x <= cell.x + HEX_RADIUS; x += 1) {
        for (let y = cell.y - HEX_RADIUS; y <= cell.y + HEX_RADIUS; y += 1) {
          if (hexDistance({ x: cell.x, y: cell.y }, { x, y }) <= HEX_RADIUS) {
            const key = getCellKey(x, y)
            if (!cells.has(key)) {
              const point = axialToUnitPoint(x, y)
              cells.set(key, { key, x, y, pointX: point.x, pointY: point.y })
            }
          }
        }
      }
    }

    return [...cells.values()]
  }, [boardState.cells])

  const renderableCellSet = useMemo(() => {
    return new Set(renderableCells.map((cell) => cell.key))
  }, [renderableCells])

  const ownColor = getPlayerColor(currentPlayerId || (isHost ? players[0] ?? 'host' : players[1] ?? players[0] ?? 'guest'))
  const isOwnTurn = Boolean(currentPlayerId) && boardState.currentTurnPlayerId === currentPlayerId
  const turnHeadline = isOwnTurn ? 'Your turn' : 'Opponents turn'
  const turnDetail = isOwnTurn
    ? `Place ${boardState.placementsRemaining} more ${boardState.placementsRemaining === 1 ? 'cell' : 'cells'}.`
    : `Waiting for the other player to finish ${boardState.placementsRemaining} ${boardState.placementsRemaining === 1 ? 'move' : 'moves'}.`

  latestDataRef.current = {
    boardState,
    renderableCells,
    renderableCellSet,
    cellMap
  }

  const updateHudState = () => {
    const nextHoveredCell = hoveredCellRef.current

    setHudState((current) => {
      if (
        current.scale === viewRef.current.scale &&
        sameCell(current.hoveredCell, nextHoveredCell)
      ) {
        return current
      }

      return {
        hoveredCell: nextHoveredCell,
        scale: viewRef.current.scale
      }
    })
  }

  const drawBoard = () => {
    const canvas = canvasRef.current
    const latestData = latestDataRef.current
    if (!canvas || !latestData) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#0f172a'
    context.fillRect(0, 0, width, height)
    if (!isOwnTurn) {
      context.fillStyle = 'rgba(15, 23, 42, 0.22)'
      context.fillRect(0, 0, width, height)
    }

    const { offsetX, offsetY, scale } = viewRef.current
    const centerX = width / 2 + offsetX
    const centerY = height / 2 + offsetY
    const hexRadius = scale * 0.92

    for (const cell of latestData.renderableCells) {
      const screenX = centerX + cell.pointX * scale
      const screenY = centerY + cell.pointY * scale

      if (
        screenX + hexRadius < 0 ||
        screenY + hexRadius < 0 ||
        screenX - hexRadius > width ||
        screenY - hexRadius > height
      ) {
        continue
      }

      traceHexPath(context, screenX, screenY, hexRadius)
      context.fillStyle = 'rgba(15, 23, 42, 0.86)'
      context.fill()
      context.strokeStyle = cell.x === 0 && cell.y === 0 ? ORIGIN_LINE_COLOR : GRID_LINE_COLOR
      context.lineWidth = cell.x === 0 && cell.y === 0 ? 1.6 : 1
      context.stroke()
    }

    const hoveredCell = hoveredCellRef.current
    if (hoveredCell) {
      const hoveredKey = getCellKey(hoveredCell.x, hoveredCell.y)
      if (latestData.renderableCellSet.has(hoveredKey) && !latestData.cellMap.has(hoveredKey)) {
        const point = axialToUnitPoint(hoveredCell.x, hoveredCell.y)
        const screenX = centerX + point.x * scale
        const screenY = centerY + point.y * scale
        traceHexPath(context, screenX, screenY, hexRadius)
        context.fillStyle = 'rgba(125, 211, 252, 0.18)'
        context.fill()
        context.strokeStyle = 'rgba(125, 211, 252, 0.55)'
        context.lineWidth = 1.5
        context.stroke()
      }
    }

    for (const cell of latestData.boardState.cells) {
      const point = axialToUnitPoint(cell.x, cell.y)
      const screenX = centerX + point.x * scale
      const screenY = centerY + point.y * scale

      if (
        screenX + hexRadius < 0 ||
        screenY + hexRadius < 0 ||
        screenX - hexRadius > width ||
        screenY - hexRadius > height
      ) {
        continue
      }

      traceHexPath(context, screenX, screenY, hexRadius - 2)
      context.fillStyle = getPlayerColor(cell.occupiedBy)
      context.fill()

      context.fillStyle = '#e2e8f0'
      context.font = `${Math.max(11, scale * 0.24)}px ui-sans-serif, system-ui, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(cell.occupiedBy.slice(0, 2).toUpperCase(), screenX, screenY + 1)
    }
  }

  const scheduleDraw = () => {
    if (animationFrameRef.current !== null) {
      return
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null
      drawBoard()
      updateHudState()
    })
  }

  const screenToCell = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const localX = clientX - rect.left - rect.width / 2 - viewRef.current.offsetX
    const localY = clientY - rect.top - rect.height / 2 - viewRef.current.offsetY

    return pixelToAxial(localX / viewRef.current.scale, localY / viewRef.current.scale)
  }

  useEffect(() => {
    scheduleDraw()
  }, [boardState, renderableCells, renderableCellSet, cellMap])

  useEffect(() => {
    const expiresAt = boardState.currentTurnExpiresAt
    if (!expiresAt) {
      setTurnCountdownMs(null)
      return
    }

    const updateCountdown = () => {
      setTurnCountdownMs(Math.max(0, expiresAt - Date.now()))
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 250)
    return () => window.clearInterval(interval)
  }, [boardState.currentTurnExpiresAt])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const parent = canvas.parentElement
    if (!parent) return

    const resizeObserver = new ResizeObserver(() => {
      scheduleDraw()
    })
    resizeObserver.observe(parent)
    scheduleDraw()

    return () => {
      resizeObserver.disconnect()
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-white">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${isOwnTurn ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'}`}
        onMouseDown={(event) => {
          dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            originOffsetX: viewRef.current.offsetX,
            originOffsetY: viewRef.current.offsetY,
            moved: false
          }
        }}
        onMouseMove={(event) => {
          const nextCell = screenToCell(event.clientX, event.clientY)
          if (!sameCell(hoveredCellRef.current, nextCell)) {
            hoveredCellRef.current = nextCell
            scheduleDraw()
          }

          const dragState = dragStateRef.current
          if (!dragState) {
            return
          }

          const deltaX = event.clientX - dragState.startX
          const deltaY = event.clientY - dragState.startY
          if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            dragState.moved = true
          }

          viewRef.current = {
            ...viewRef.current,
            offsetX: dragState.originOffsetX + deltaX,
            offsetY: dragState.originOffsetY + deltaY
          }
          scheduleDraw()
        }}
        onMouseLeave={() => {
          dragStateRef.current = null
          if (hoveredCellRef.current !== null) {
            hoveredCellRef.current = null
            scheduleDraw()
          }
        }}
        onMouseUp={(event) => {
          const dragState = dragStateRef.current
          dragStateRef.current = null

          if (!dragState || dragState.moved) {
            return
          }

          const targetCell = screenToCell(event.clientX, event.clientY)
          if (!targetCell) {
            return
          }

          const cellKey = getCellKey(targetCell.x, targetCell.y)
          if (isOwnTurn && renderableCellSet.has(cellKey) && !cellMap.has(cellKey)) {
            onPlaceCell(targetCell.x, targetCell.y)
          }
        }}
        onWheel={(event) => {
          const canvas = canvasRef.current
          if (!canvas) return

          const rect = canvas.getBoundingClientRect()
          const pointerX = event.clientX - rect.left
          const pointerY = event.clientY - rect.top
          const anchorUnitX = (pointerX - rect.width / 2 - viewRef.current.offsetX) / viewRef.current.scale
          const anchorUnitY = (pointerY - rect.height / 2 - viewRef.current.offsetY) / viewRef.current.scale
          const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08
          const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewRef.current.scale * zoomFactor))

          viewRef.current = {
            scale: nextScale,
            offsetX: pointerX - rect.width / 2 - anchorUnitX * nextScale,
            offsetY: pointerY - rect.height / 2 - anchorUnitY * nextScale
          }
          scheduleDraw()
        }}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="flex h-full flex-col justify-between gap-4">
          <div className="flex justify-center absolute top-3 left-0 right-0">
            <div className="pointer-events-none shadow-xxl w-full max-w-md rounded-md bg-slate-800 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${isOwnTurn ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <div className="min-w-0 flex-1 spacing">
                  <div className={`text-sm font-bold uppercase tracking-[0.16em] ${isOwnTurn
                    ? 'bg-emerald-400/16 text-emerald-500'
                    : 'bg-white/8 text-slate-500'
                    }`}>
                    {turnHeadline}
                  </div>
                  <div className="text-sm text-slate-200">{turnDetail}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                    {formatCountdown(turnCountdownMs)} remaining
                  </div>
                </div>
                <div className="flex w-14 gap-1.5">
                  {Array.from({ length: 2 }, (_, index) => {
                    let color;
                    if (index >= 2 - boardState.placementsRemaining) {
                      color = isOwnTurn ? 'bg-emerald-500' : 'bg-white/90'
                    } else {
                      color = 'bg-white/40'
                    }

                    return (
                      <span
                        key={index}
                        className={`h-2 flex-1 rounded-full ${color}`}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-wrap bottom-2 right-2 absolute gap-2">
            <button
              onClick={() => {
                viewRef.current = { offsetX: 0, offsetY: 0, scale: DEFAULT_SCALE }
                scheduleDraw()
              }}
              className="rounded-full bg-sky-600 w-40 px-4 py-2 font-medium shadow-lg hover:bg-sky-500"
            >
              Reset View
            </button>
            <button
              onClick={onLeave}
              className="rounded-full bg-red-500 w-40 px-4 py-2 font-medium shadow-lg hover:bg-red-400"
            >
              Leave Game
            </button>
          </div>

          <div className="pointer-events-auto w-full max-w-sm rounded-[1.5rem] bg-slate-950/28 px-4 py-4 text-right shadow-[0_12px_45px_rgba(15,23,42,0.22)] absolute top-0 right-0 backdrop-blur-md">
            <h1 className="mt-1 text-2xl font-bold">Infinite Hex Tik-Tak-Toe</h1>
            <div className="text-sm uppercase tracking-[0.25em] text-sky-300">Live Match</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="border-r border-white/18 pr-3">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Cells</div>
                <div className="mt-1 text-white">{renderableCells.length} active</div>
                <div className="text-slate-300">{boardState.cells.length} occupied</div>
              </div>

              <div className="border-r border-white/18 pr-3">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Your Color</div>
                <div className="mt-1 flex items-center justify-end gap-2.5 text-white">
                  <span>{ownColor}</span>
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-white/20"
                    style={{ backgroundColor: ownColor }}
                  />
                </div>
              </div>

              <div className="border-r border-white/18 pr-3">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Hovered Cell</div>
                <div className="mt-1 text-white">
                  {hudState.hoveredCell ? `(${hudState.hoveredCell.x}, ${hudState.hoveredCell.y})` : 'Move over the board'}
                </div>
              </div>

              <div className="border-r border-white/18 pr-3">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Zoom Level</div>
                <div className="mt-1 text-white">{Math.round((hudState.scale / DEFAULT_SCALE) * 100)}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameScreen
