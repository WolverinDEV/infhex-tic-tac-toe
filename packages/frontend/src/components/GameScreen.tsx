import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { BoardState, SessionParticipantRole } from '@ih3t/shared'
import GameBoardCanvas from './game-screen/GameBoardCanvas'
import GameScreenHud from './game-screen/GameScreenHud'
import GameScreenStatus from './game-screen/GameScreenStatus'
import { TURN_TIMEOUT_MS, getPlayerColor, getPlayerLabel } from './game-screen/gameBoardUtils'
import useGameBoard from './game-screen/useGameBoard'

interface GameScreenProps {
  players: string[]
  participantRole: SessionParticipantRole
  currentPlayerId: string
  boardState: BoardState
  onPlaceCell: (x: number, y: number) => void
  onLeave: () => void
  overlay?: ReactNode
  interactionEnabled?: boolean
}

function GameScreen({
  players,
  participantRole,
  currentPlayerId,
  boardState,
  onPlaceCell,
  onLeave,
  overlay,
  interactionEnabled = true
}: Readonly<GameScreenProps>) {
  const [turnCountdownMs, setTurnCountdownMs] = useState<number | null>(TURN_TIMEOUT_MS)

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
    onPlaceCell
  })

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
