import type { BoardState } from '@ih3t/shared'
import type { CanvasHTMLAttributes, RefObject } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import {
  DEFAULT_SCALE,
  GRID_LINE_COLOR,
  HexCell,
  axialToUnitPoint,
  buildRenderableCells,
  clampScale,
  getCellKey,
  getTouchCenter,
  getTouchDistance,
  pixelToAxial,
  sameCell,
  traceHexPath
} from './gameBoardUtils'

const DRAG_THRESHOLD_PX = 6
const MOUSE_AFTER_TOUCH_IGNORE_MS = 500

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

interface PinchState {
  startDistance: number
  startScale: number
  anchorUnitX: number
  anchorUnitY: number
}

interface UseGameBoardOptions {
  boardState: BoardState
  highlightedCells?: HexCell[]
  localPlayerId: string | null
  interactionEnabled: boolean
  onPlaceCell?: (x: number, y: number) => void
}

interface UseGameBoardResult {
  canvasRef: RefObject<HTMLCanvasElement | null>
  canvasClassName: string
  canvasHandlers: Pick<
    CanvasHTMLAttributes<HTMLCanvasElement>,
    | 'onMouseDown'
    | 'onMouseMove'
    | 'onMouseLeave'
    | 'onMouseUp'
    | 'onWheel'
    | 'onTouchStart'
    | 'onTouchMove'
    | 'onTouchEnd'
    | 'onTouchCancel'
  >
  renderableCellCount: number
  resetView: () => void
}

function useGameBoard({
  boardState,
  localPlayerId,
  interactionEnabled,
  onPlaceCell,
  highlightedCells
}: Readonly<UseGameBoardOptions>): UseGameBoardResult {
  const isSpectator = localPlayerId === null
  const isOwnTurn = localPlayerId !== null && boardState.currentTurnPlayerId === localPlayerId
  const canPlaceCell = interactionEnabled && Boolean(onPlaceCell) && isOwnTurn

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const pinchStateRef = useRef<PinchState | null>(null)
  const suppressTouchPlacementRef = useRef(false)
  const lastTouchInteractionAtRef = useRef(0)

  const viewRef = useRef<ViewState>({ offsetX: 0, offsetY: 0, scale: DEFAULT_SCALE })
  const animationFrameRef = useRef<number | null>(null)
  const hoveredCellRef = useRef<ReturnType<typeof pixelToAxial> | null>(null)

  const latestDataRef = useRef<{
    boardState: BoardState
    renderableCells: ReturnType<typeof buildRenderableCells>
    highlightedCellKeys: Set<string>
    interactionEnabled: boolean
    canPlaceCell: boolean
    isOwnTurn: boolean
  } | null>(null)

  const renderableCells = useMemo(
    () => buildRenderableCells(boardState.cells, boardState.playerTiles),
    [boardState.cells, boardState.playerTiles]
  )

  const highlightedCellKeys = useMemo(
    () => new Set((highlightedCells ?? []).map(({ x, y }) => getCellKey(x, y))),
    [highlightedCells]
  )

  latestDataRef.current = {
    boardState,
    renderableCells,
    highlightedCellKeys,
    interactionEnabled,
    canPlaceCell,
    isOwnTurn
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

    const { offsetX, offsetY, scale } = viewRef.current
    const centerX = width / 2 + offsetX
    const centerY = height / 2 + offsetY
    const hexRadius = scale * 0.92

    /* cell grid outlines */
    for (const cell of latestData.renderableCells.values()) {
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

      /* outline */
      traceHexPath(context, screenX, screenY, hexRadius)
      context.strokeStyle = GRID_LINE_COLOR
      context.lineWidth = 1
      context.stroke()

      /* fill color */
      if (cell.color) {
        traceHexPath(context, screenX, screenY, hexRadius - 2)
        context.fillStyle = cell.color
        context.fill()
      }

      /* highlight */
      if (latestData.highlightedCellKeys.has(cell.key)) {
        traceHexPath(context, screenX, screenY, hexRadius - 1)
        context.save()
        context.shadowBlur = Math.max(14, scale * 0.45)
        context.shadowColor = 'rgba(248, 250, 252, 0.52)'
        context.strokeStyle = 'rgba(248, 250, 252, 0.96)'
        context.lineWidth = Math.max(2, scale * 0.08)
        context.stroke()
        context.restore()

        traceHexPath(context, screenX, screenY, Math.max(4, hexRadius - 6))
        context.fillStyle = 'rgba(255, 255, 255, 0.12)'
        context.fill()
      }
    }

    const hoveredCell = hoveredCellRef.current
    if (hoveredCell && latestData.canPlaceCell) {
      const hoveredKey = getCellKey(hoveredCell.x, hoveredCell.y)
      const renderedCell = latestData.renderableCells.get(hoveredKey)
      if (renderedCell && !renderedCell.color) {
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
  }

  const scheduleDraw = () => {
    if (animationFrameRef.current !== null) {
      return
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null
      drawBoard()
    })
  }

  const screenToCell = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return null
    }

    const rect = canvas.getBoundingClientRect()
    const localX = clientX - rect.left - rect.width / 2 - viewRef.current.offsetX
    const localY = clientY - rect.top - rect.height / 2 - viewRef.current.offsetY

    return pixelToAxial(localX / viewRef.current.scale, localY / viewRef.current.scale)
  }

  const applyZoomAtClientPoint = (clientX: number, clientY: number, nextScale: number) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const safeScale = clampScale(nextScale)
    const anchorUnitX = (clientX - rect.left - rect.width / 2 - viewRef.current.offsetX) / viewRef.current.scale
    const anchorUnitY = (clientY - rect.top - rect.height / 2 - viewRef.current.offsetY) / viewRef.current.scale

    viewRef.current = {
      scale: safeScale,
      offsetX: clientX - rect.left - rect.width / 2 - anchorUnitX * safeScale,
      offsetY: clientY - rect.top - rect.height / 2 - anchorUnitY * safeScale
    }
  }

  const tryPlaceCellAtClientPoint = (clientX: number, clientY: number) => {
    const latestData = latestDataRef.current
    const targetCell = screenToCell(clientX, clientY)
    if (!latestData || !targetCell) {
      return
    }

    const cellKey = getCellKey(targetCell.x, targetCell.y)
    if (latestData.canPlaceCell && latestData.renderableCells.get(cellKey)?.color === null) {
      onPlaceCell?.(targetCell.x, targetCell.y)
    }
  }

  const clearInteractionState = () => {
    dragStateRef.current = null
    pinchStateRef.current = null
  }

  const markTouchInteraction = () => {
    lastTouchInteractionAtRef.current = Date.now()
  }

  const shouldIgnoreMouseEvent = () =>
    Date.now() - lastTouchInteractionAtRef.current < MOUSE_AFTER_TOUCH_IGNORE_MS

  const resetView = () => {
    viewRef.current = { offsetX: 0, offsetY: 0, scale: DEFAULT_SCALE }
    scheduleDraw()
  }

  useEffect(() => {
    scheduleDraw()
  }, [boardState, renderableCells, highlightedCellKeys, interactionEnabled, canPlaceCell, isOwnTurn])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleDraw()
    })
    resizeObserver.observe(canvas)
    scheduleDraw()

    return () => {
      resizeObserver.disconnect()
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [])

  return {
    canvasRef,
    canvasClassName: `absolute inset-0 h-full w-full touch-none select-none ${interactionEnabled
      ? (canPlaceCell || isSpectator ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed')
      : 'cursor-default'
      }`,
    canvasHandlers: {
      onMouseDown: (event) => {
        if (!interactionEnabled || shouldIgnoreMouseEvent()) {
          return
        }

        dragStateRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          originOffsetX: viewRef.current.offsetX,
          originOffsetY: viewRef.current.offsetY,
          moved: false
        }
      },
      onMouseMove: (event) => {
        if (!interactionEnabled || shouldIgnoreMouseEvent()) {
          return
        }

        const nextCell = canPlaceCell ? screenToCell(event.clientX, event.clientY) : null
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
        if (Math.abs(deltaX) > DRAG_THRESHOLD_PX || Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
          dragState.moved = true
        }

        viewRef.current = {
          ...viewRef.current,
          offsetX: dragState.originOffsetX + deltaX,
          offsetY: dragState.originOffsetY + deltaY
        }
        scheduleDraw()
      },
      onMouseLeave: () => {
        if (!interactionEnabled || shouldIgnoreMouseEvent()) {
          return
        }

        dragStateRef.current = null
        if (hoveredCellRef.current !== null) {
          hoveredCellRef.current = null
          scheduleDraw()
        }
      },
      onMouseUp: (event) => {
        if (!interactionEnabled || shouldIgnoreMouseEvent()) {
          return
        }

        const dragState = dragStateRef.current
        dragStateRef.current = null

        if (!dragState || dragState.moved) {
          return
        }

        tryPlaceCellAtClientPoint(event.clientX, event.clientY)
      },
      onWheel: (event) => {
        if (!interactionEnabled) {
          return
        }

        const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08
        applyZoomAtClientPoint(event.clientX, event.clientY, viewRef.current.scale * zoomFactor)
        scheduleDraw()
      },
      onTouchStart: (event) => {
        if (!interactionEnabled) {
          return
        }

        event.preventDefault()
        markTouchInteraction()

        if (event.touches.length === 1) {
          suppressTouchPlacementRef.current = false
          const touch = event.touches[0]
          hoveredCellRef.current = canPlaceCell ? screenToCell(touch.clientX, touch.clientY) : null
          dragStateRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            originOffsetX: viewRef.current.offsetX,
            originOffsetY: viewRef.current.offsetY,
            moved: false
          }
          pinchStateRef.current = null
          scheduleDraw()
          return
        }

        suppressTouchPlacementRef.current = true
        const canvas = canvasRef.current
        const center = getTouchCenter(event.touches)
        const distance = getTouchDistance(event.touches)
        if (!canvas || !center || distance === 0) {
          return
        }

        const rect = canvas.getBoundingClientRect()
        pinchStateRef.current = {
          startDistance: distance,
          startScale: viewRef.current.scale,
          anchorUnitX: (center.x - rect.left - rect.width / 2 - viewRef.current.offsetX) / viewRef.current.scale,
          anchorUnitY: (center.y - rect.top - rect.height / 2 - viewRef.current.offsetY) / viewRef.current.scale
        }
        dragStateRef.current = null
        hoveredCellRef.current = null
        scheduleDraw()
      },
      onTouchMove: (event) => {
        if (!interactionEnabled) {
          return
        }

        event.preventDefault()
        markTouchInteraction()

        if (event.touches.length >= 2) {
          suppressTouchPlacementRef.current = true
          const pinchState = pinchStateRef.current
          const canvas = canvasRef.current
          const center = getTouchCenter(event.touches)
          const distance = getTouchDistance(event.touches)
          if (!pinchState || !canvas || !center || distance === 0) {
            return
          }

          const rect = canvas.getBoundingClientRect()
          const nextScale = clampScale(pinchState.startScale * (distance / pinchState.startDistance))
          viewRef.current = {
            scale: nextScale,
            offsetX: center.x - rect.left - rect.width / 2 - pinchState.anchorUnitX * nextScale,
            offsetY: center.y - rect.top - rect.height / 2 - pinchState.anchorUnitY * nextScale
          }
          hoveredCellRef.current = null
          scheduleDraw()
          return
        }

        const dragState = dragStateRef.current
        const touch = event.touches[0]
        if (!dragState || !touch) {
          return
        }

        const nextCell = canPlaceCell ? screenToCell(touch.clientX, touch.clientY) : null
        if (!sameCell(hoveredCellRef.current, nextCell)) {
          hoveredCellRef.current = nextCell
        }

        const deltaX = touch.clientX - dragState.startX
        const deltaY = touch.clientY - dragState.startY
        if (Math.abs(deltaX) > DRAG_THRESHOLD_PX || Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
          dragState.moved = true
        }

        if (dragState.moved) {
          viewRef.current = {
            ...viewRef.current,
            offsetX: dragState.originOffsetX + deltaX,
            offsetY: dragState.originOffsetY + deltaY
          }
        }

        scheduleDraw()
      },
      onTouchEnd: (event) => {
        if (!interactionEnabled) {
          return
        }

        event.preventDefault()
        markTouchInteraction()

        if (event.touches.length >= 2) {
          suppressTouchPlacementRef.current = true
          const canvas = canvasRef.current
          const center = getTouchCenter(event.touches)
          const distance = getTouchDistance(event.touches)
          if (!canvas || !center || distance === 0) {
            clearInteractionState()
            return
          }

          const rect = canvas.getBoundingClientRect()
          pinchStateRef.current = {
            startDistance: distance,
            startScale: viewRef.current.scale,
            anchorUnitX: (center.x - rect.left - rect.width / 2 - viewRef.current.offsetX) / viewRef.current.scale,
            anchorUnitY: (center.y - rect.top - rect.height / 2 - viewRef.current.offsetY) / viewRef.current.scale
          }
          dragStateRef.current = null
          return
        }

        if (event.touches.length === 1) {
          const touch = event.touches[0]
          hoveredCellRef.current = canPlaceCell ? screenToCell(touch.clientX, touch.clientY) : null
          dragStateRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            originOffsetX: viewRef.current.offsetX,
            originOffsetY: viewRef.current.offsetY,
            moved: false
          }
          pinchStateRef.current = null
          scheduleDraw()
          return
        }

        const dragState = dragStateRef.current
        const lastTouch = event.changedTouches[0]
        if (!suppressTouchPlacementRef.current && dragState && !dragState.moved && lastTouch) {
          tryPlaceCellAtClientPoint(lastTouch.clientX, lastTouch.clientY)
        }

        suppressTouchPlacementRef.current = false
        hoveredCellRef.current = null
        clearInteractionState()
        scheduleDraw()
      },
      onTouchCancel: (event) => {
        event.preventDefault()
        markTouchInteraction()
        suppressTouchPlacementRef.current = false
        hoveredCellRef.current = null
        clearInteractionState()
        scheduleDraw()
      }
    },
    renderableCellCount: renderableCells.size,
    resetView
  }
}

export default useGameBoard
