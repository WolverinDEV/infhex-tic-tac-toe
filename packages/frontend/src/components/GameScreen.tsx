import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { BoardState, SessionParticipantRole, ShutdownState } from '@ih3t/shared'
import { playCountdownWarningSound, playTilePlacedSound } from '../soundEffects'
import GameBoardCanvas from './game-screen/GameBoardCanvas'
import GameScreenHud from './game-screen/GameScreenHud'
import GameScreenStatus from './game-screen/GameScreenStatus'
import { TURN_TIMEOUT_MS, getCellKey, getPlayerColor, getPlayerLabel } from './game-screen/gameBoardUtils'
import useGameBoard from './game-screen/useGameBoard'

interface GameScreenProps {
  players: string[]
  participantRole: SessionParticipantRole
  currentPlayerId: string
  boardState: BoardState
  shutdown: ShutdownState | null
  onPlaceCell: (x: number, y: number) => void
  onLeave: () => void
  overlay?: ReactNode
  interactionEnabled?: boolean
}

function mergeCellKeys(existingKeys: string[], addedKeys: string[]) {
  return [...new Set([...existingKeys, ...addedKeys])]
}

function GameScreen({
  players,
  participantRole,
  currentPlayerId,
  boardState,
  shutdown,
  onPlaceCell,
  onLeave,
  overlay,
  interactionEnabled = true
}: Readonly<GameScreenProps>) {
  const [turnCountdownMs, setTurnCountdownMs] = useState<number | null>(TURN_TIMEOUT_MS)
  const [highlightedCellKeys, setHighlightedCellKeys] = useState<string[]>([])
  const previousBoardStateRef = useRef<BoardState | null>(null)
  const previousCellCountRef = useRef(boardState.cells.length)
  const ongoingOpponentTurnKeysRef = useRef<string[]>([])
  const lastOpponentTurnKeysRef = useRef<string[]>([])
  const lastCountdownWarningSecondRef = useRef<number | null>(null)

  const isSpectator = participantRole === 'spectator'
  const ownColor = getPlayerColor(players, currentPlayerId)
  const isOwnTurn = Boolean(currentPlayerId) && boardState.currentTurnPlayerId === currentPlayerId
  const canPlaceCell = interactionEnabled && !isSpectator && isOwnTurn
  const activePlayerLabel = getPlayerLabel(players, boardState.currentTurnPlayerId)

  const turnHeadline = isSpectator
    ? 'Spectator mode'
    : isOwnTurn
      ? 'Your turn'
      : 'Opponents turn'

  const turnDetail = isSpectator
    ? `${activePlayerLabel} is playing. You can pan and zoom, but only active players can place cells.`
    : isOwnTurn
      ? `Place ${boardState.placementsRemaining} more ${boardState.placementsRemaining === 1 ? 'cell' : 'cells'}.`
      : `Waiting for the other player to finish ${boardState.placementsRemaining} ${boardState.placementsRemaining === 1 ? 'move' : 'moves'}.`

  useEffect(() => {
    previousBoardStateRef.current = null
    previousCellCountRef.current = boardState.cells.length
    ongoingOpponentTurnKeysRef.current = []
    lastOpponentTurnKeysRef.current = []
    lastCountdownWarningSecondRef.current = null
    setHighlightedCellKeys([])
  }, [currentPlayerId, participantRole])

  useEffect(() => {
    if (!interactionEnabled || isSpectator || !currentPlayerId) {
      previousBoardStateRef.current = boardState
      ongoingOpponentTurnKeysRef.current = []
      lastOpponentTurnKeysRef.current = []
      setHighlightedCellKeys([])
      return
    }

    const previousBoardState = previousBoardStateRef.current
    if (!previousBoardState || boardState.cells.length < previousBoardState.cells.length) {
      previousBoardStateRef.current = boardState
      ongoingOpponentTurnKeysRef.current = []
      lastOpponentTurnKeysRef.current = []
      setHighlightedCellKeys([])
      return
    }

    const previousCellKeys = new Set(previousBoardState.cells.map(cell => getCellKey(cell.x, cell.y)))
    const addedOpponentCellKeys = boardState.cells.reduce<string[]>((addedKeys, cell) => {
      const cellKey = getCellKey(cell.x, cell.y)
      if (!previousCellKeys.has(cellKey) && cell.occupiedBy !== currentPlayerId) {
        addedKeys.push(cellKey)
      }
      return addedKeys
    }, [])
    const wasOpponentTurn = Boolean(previousBoardState.currentTurnPlayerId) && previousBoardState.currentTurnPlayerId !== currentPlayerId
    const isOpponentTurn = Boolean(boardState.currentTurnPlayerId) && boardState.currentTurnPlayerId !== currentPlayerId

    if (addedOpponentCellKeys.length > 0) {
      if (isOpponentTurn) {
        ongoingOpponentTurnKeysRef.current = mergeCellKeys(
          wasOpponentTurn ? ongoingOpponentTurnKeysRef.current : [],
          addedOpponentCellKeys
        )
        setHighlightedCellKeys(ongoingOpponentTurnKeysRef.current)
      } else {
        const completedOpponentTurnKeys = mergeCellKeys(
          wasOpponentTurn ? ongoingOpponentTurnKeysRef.current : [],
          addedOpponentCellKeys
        )
        ongoingOpponentTurnKeysRef.current = []
        lastOpponentTurnKeysRef.current = completedOpponentTurnKeys
        setHighlightedCellKeys(completedOpponentTurnKeys)
      }
    } else if (!isOpponentTurn && wasOpponentTurn && ongoingOpponentTurnKeysRef.current.length > 0) {
      lastOpponentTurnKeysRef.current = ongoingOpponentTurnKeysRef.current
      ongoingOpponentTurnKeysRef.current = []
      setHighlightedCellKeys(lastOpponentTurnKeysRef.current)
    } else if (isOpponentTurn && ongoingOpponentTurnKeysRef.current.length > 0) {
      setHighlightedCellKeys(ongoingOpponentTurnKeysRef.current)
    } else {
      setHighlightedCellKeys(lastOpponentTurnKeysRef.current)
    }

    previousBoardStateRef.current = boardState
  }, [boardState, currentPlayerId, interactionEnabled, isSpectator])

  const {
    canvasRef,
    canvasClassName,
    canvasHandlers,
    renderableCellCount,
    resetView
  } = useGameBoard({
    boardState,
    players,
    interactionEnabled,
    canPlaceCell,
    isOwnTurn,
    isSpectator,
    highlightedCellKeys,
    onPlaceCell
  })

  useEffect(() => {
    const previousCellCount = previousCellCountRef.current
    if (interactionEnabled && boardState.cells.length > previousCellCount) {
      playTilePlacedSound()
    }

    previousCellCountRef.current = boardState.cells.length
  }, [boardState.cells.length, interactionEnabled])

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
    if (!interactionEnabled || isSpectator || !isOwnTurn || turnCountdownMs === null || turnCountdownMs > 10_000) {
      lastCountdownWarningSecondRef.current = null
      return
    }

    const remainingWarningSecond = Math.floor(turnCountdownMs / 1000)
    if (remainingWarningSecond < 1 || remainingWarningSecond > 9) {
      return
    }

    if (lastCountdownWarningSecondRef.current === remainingWarningSecond) {
      return
    }

    lastCountdownWarningSecondRef.current = remainingWarningSecond
    playCountdownWarningSound()
  }, [interactionEnabled, isOwnTurn, isSpectator, turnCountdownMs])

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950 text-white">
      <GameBoardCanvas
        canvasRef={canvasRef}
        className={canvasClassName}
        handlers={canvasHandlers}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="flex h-full flex-col justify-between gap-4">
          {interactionEnabled && (
            <GameScreenStatus
              canPlaceCell={canPlaceCell}
              isSpectator={isSpectator}
              placementsRemaining={boardState.placementsRemaining}
              turnCountdownMs={turnCountdownMs}
              turnHeadline={turnHeadline}
              turnDetail={turnDetail}
            />
          )}

          {interactionEnabled && (
            <GameScreenHud
              isSpectator={isSpectator}
              occupiedCellCount={boardState.cells.length}
              ownColor={ownColor}
              renderableCellCount={renderableCellCount}
              shutdown={shutdown}
              onLeave={onLeave}
              onResetView={resetView}
            />
          )}
        </div>
      </div>

      {overlay && (
        <div className="absolute inset-0">
          {overlay}
        </div>
      )}
    </div>
  )
}

export default GameScreen
