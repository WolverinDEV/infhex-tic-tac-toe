import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardState, GameTimeControl, PlayerNames, SessionParticipantRole, ShutdownState } from '@ih3t/shared'
import { playTilePlacedSound } from '../soundEffects'
import GameBoardCanvas from './game-screen/GameBoardCanvas'
import GameScreenHud, { HudPlayerInfo } from './game-screen/GameScreenHud'
import TurnTimerHud from './game-screen/TurnTimerHud'
import { getCellKey, getPlayerColor, getPlayerLabel } from './game-screen/gameBoardUtils'
import useGameBoard from './game-screen/useGameBoard'

interface GameScreenProps {
  sessionId: string
  players: string[]
  playerNames: PlayerNames
  participantRole: SessionParticipantRole
  currentPlayerId: string
  boardState: BoardState
  timeControl?: GameTimeControl
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
  sessionId,
  players,
  playerNames,
  participantRole,
  currentPlayerId,
  boardState,
  timeControl,
  shutdown,
  onPlaceCell,
  onLeave,
  overlay,
  interactionEnabled = true
}: Readonly<GameScreenProps>) {
  const [highlightedCellKeys, setHighlightedCellKeys] = useState<string[]>([])
  const previousBoardStateRef = useRef<BoardState | null>(null)
  const previousCellCountRef = useRef(boardState.cells.length)
  const ongoingHighlightedTurnKeysRef = useRef<string[]>([])
  const ongoingHighlightedTurnPlayerIdRef = useRef<string | null>(null)
  const lastHighlightedTurnKeysRef = useRef<string[]>([])

  const effectiveTimeControl: GameTimeControl = timeControl ?? { mode: 'unlimited' }
  const isSpectator = participantRole === 'spectator'
  const isOwnTurn = Boolean(currentPlayerId) && boardState.currentTurnPlayerId === currentPlayerId
  const canPlaceCell = interactionEnabled && !isSpectator && isOwnTurn

  const hudPlayerInfo = useMemo(() => {
    return players.map(playerId => ({
      playerId,
      displayName: getPlayerLabel(players, playerId, playerNames),
      displayColor: getPlayerColor(players, playerId)
    } satisfies HudPlayerInfo))
  }, [players, currentPlayerId, playerNames]);

  useEffect(() => {
    previousBoardStateRef.current = null
    previousCellCountRef.current = boardState.cells.length
    ongoingHighlightedTurnKeysRef.current = []
    ongoingHighlightedTurnPlayerIdRef.current = null
    lastHighlightedTurnKeysRef.current = []
    setHighlightedCellKeys([])
  }, [currentPlayerId, participantRole])

  useEffect(() => {
    if (!interactionEnabled || (!isSpectator && !currentPlayerId)) {
      previousBoardStateRef.current = boardState
      ongoingHighlightedTurnKeysRef.current = []
      ongoingHighlightedTurnPlayerIdRef.current = null
      lastHighlightedTurnKeysRef.current = []
      setHighlightedCellKeys([])
      return
    }

    const previousBoardState = previousBoardStateRef.current
    if (!previousBoardState || boardState.cells.length < previousBoardState.cells.length) {
      previousBoardStateRef.current = boardState
      ongoingHighlightedTurnKeysRef.current = []
      ongoingHighlightedTurnPlayerIdRef.current = null
      lastHighlightedTurnKeysRef.current = []
      setHighlightedCellKeys([])
      return
    }

    const isTrackedTurnPlayer = (playerId: string | null): playerId is string => {
      if (!playerId) {
        return false
      }

      return isSpectator || playerId !== currentPlayerId
    }

    const previousCellKeys = new Set(previousBoardState.cells.map(cell => getCellKey(cell.x, cell.y)))
    const addedHighlightedTurnCells = boardState.cells.reduce<BoardState['cells']>((addedCells, cell) => {
      const cellKey = getCellKey(cell.x, cell.y)
      if (!previousCellKeys.has(cellKey) && (isSpectator || cell.occupiedBy !== currentPlayerId)) {
        addedCells.push(cell)
      }
      return addedCells
    }, [])

    if (addedHighlightedTurnCells.length > 0) {
      const addedHighlightedTurnPlayerId = addedHighlightedTurnCells[0]?.occupiedBy ?? null
      if (ongoingHighlightedTurnPlayerIdRef.current !== addedHighlightedTurnPlayerId) {
        if (ongoingHighlightedTurnKeysRef.current.length > 0) {
          lastHighlightedTurnKeysRef.current = ongoingHighlightedTurnKeysRef.current
        }

        ongoingHighlightedTurnPlayerIdRef.current = addedHighlightedTurnPlayerId
        ongoingHighlightedTurnKeysRef.current = []
      }

      ongoingHighlightedTurnKeysRef.current = mergeCellKeys(
        ongoingHighlightedTurnKeysRef.current,
        addedHighlightedTurnCells.map(cell => getCellKey(cell.x, cell.y))
      )
    }

    const currentHighlightedTurnPlayerId = isTrackedTurnPlayer(boardState.currentTurnPlayerId)
      ? boardState.currentTurnPlayerId
      : null

    if (
      ongoingHighlightedTurnPlayerIdRef.current !== null &&
      ongoingHighlightedTurnPlayerIdRef.current !== currentHighlightedTurnPlayerId &&
      ongoingHighlightedTurnKeysRef.current.length > 0
    ) {
      lastHighlightedTurnKeysRef.current = ongoingHighlightedTurnKeysRef.current
      ongoingHighlightedTurnKeysRef.current = []
    }

    ongoingHighlightedTurnPlayerIdRef.current = currentHighlightedTurnPlayerId

    if (ongoingHighlightedTurnKeysRef.current.length > 0) {
      setHighlightedCellKeys(ongoingHighlightedTurnKeysRef.current)
    } else {
      setHighlightedCellKeys(lastHighlightedTurnKeysRef.current)
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
            <TurnTimerHud
              effectiveTimeControl={effectiveTimeControl}
              players={players}
              playerNames={playerNames}
              currentTurnPlayerId={boardState.currentTurnPlayerId}
              localPlayerId={isSpectator ? null : currentPlayerId}
            />
          )}

          {interactionEnabled && (
            <GameScreenHud
              sessionId={sessionId}
              players={hudPlayerInfo}
              localPlayerId={currentPlayerId}

              occupiedCellCount={boardState.cells.length}
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
