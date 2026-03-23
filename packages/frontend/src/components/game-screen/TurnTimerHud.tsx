import { useEffect, useRef, useState } from 'react'
import type { GameState, LobbyOptions, SessionParticipant } from '@ih3t/shared'
import { playCountdownWarningSound } from '../../soundEffects'
import { formatMinutesSeconds } from '../../utils/duration'
import { getPlayerLabel, getPlayerTileColor } from '../../utils/gameBoard'

interface TurnTimerHudProps {
  gameOptions: LobbyOptions
  players: SessionParticipant[]
  gameState: GameState
  localPlayerId: string | null
}

function TurnTimerHud({
  gameOptions,
  players,
  gameState,
  localPlayerId
}: Readonly<TurnTimerHudProps>) {
  const [activeClockCountdownMs, setActiveClockCountdownMs] = useState<number | null>(null)
  const lastCountdownWarningSecondRef = useRef<number | null>(null)
  const effectiveTimeControl = gameOptions.timeControl
  const playerIds = players.map(player => player.id)
  const playerNames = Object.fromEntries(players.map(player => [player.id, player.displayName]))
  const currentTurnPlayerId = gameState.currentTurnPlayerId
  const currentTurnExpiresAt = gameState.currentTurnExpiresAt
  const placementsRemaining = gameState.placementsRemaining
  const playerTimeRemainingMs = gameState.playerTimeRemainingMs

  const isSpectator = localPlayerId === null
  const canPlaceCell = localPlayerId !== null && currentTurnPlayerId === localPlayerId
  const firstPlayerId = playerIds[0]!
  const secondPlayerId = playerIds[1]!
  const playerSlots = [firstPlayerId, secondPlayerId] as const
  const activePlayerColor = currentTurnPlayerId ? getPlayerTileColor(gameState.playerTiles, currentTurnPlayerId) : '#7dd3fc'
  const spectatorAccentTextStyle = isSpectator ? { color: activePlayerColor } : undefined
  const spectatorAccentDotStyle = isSpectator ? { backgroundColor: activePlayerColor } : undefined

  const turnHeadline = isSpectator
    ? 'Spectating'
    : canPlaceCell
      ? "It's your turn"
      : 'Opponents turn'

  const spectatorTurnDetail = !currentTurnPlayerId
    ? 'Waiting for the next player to move.'
    : `${getPlayerLabel(playerIds, currentTurnPlayerId, playerNames)} to move.`

  const turnDetail = isSpectator
    ? spectatorTurnDetail
    : canPlaceCell
      ? `${placementsRemaining} ${placementsRemaining === 1 ? 'placement' : 'placements'} left.`
      : `${placementsRemaining} ${placementsRemaining === 1 ? 'placement' : 'placements'} left for the opponent.`

  const getDisplayedPlayerClockMs = (playerId: string) => {
    if (effectiveTimeControl.mode !== 'match') {
      return null
    }

    if (playerId === currentTurnPlayerId && activeClockCountdownMs !== null) {
      return activeClockCountdownMs
    }

    return playerTimeRemainingMs[playerId] ?? effectiveTimeControl.mainTimeMs
  }

  const placementIndicator = (
    <div className="inline-flex items-center justify-end gap-1 px-1.5 py-1 sm:gap-1.5 sm:px-2">
      <div className="flex w-8 gap-1 sm:w-10">
        {Array.from({ length: 2 }, (_, index) => {
          const isFilled = index >= 2 - placementsRemaining
          const color = isFilled
            ? canPlaceCell
              ? 'bg-emerald-500'
              : isSpectator
                ? ''
                : 'bg-white/90'
            : 'bg-white/30'

          return (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${color}`}
              style={isFilled && isSpectator ? { backgroundColor: activePlayerColor } : undefined}
            />
          )
        })}
      </div>
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {placementsRemaining} left
      </span>
    </div>
  )

  const singleClockCard = (
    <div className="rounded-md border border-white/10 bg-white/6 px-2.5 py-1.5 sm:px-3 sm:py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[10px]">
          {effectiveTimeControl.mode === 'unlimited' ? 'Clock' : 'Turn Timeout'}
        </div>
        {effectiveTimeControl.mode === 'unlimited' ? (
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-200 sm:text-sm">Unlimited</div>
        ) : (
          <div
            className={`text-base font-black tabular-nums leading-none sm:text-lg ${canPlaceCell ? 'text-emerald-100' : 'text-white'}`}
          >
            {formatMinutesSeconds(activeClockCountdownMs)}
          </div>
        )}
      </div>
    </div>
  )

  useEffect(() => {
    if (!currentTurnExpiresAt) {
      setActiveClockCountdownMs(null)
      return
    }

    const updateCountdown = () => {
      setActiveClockCountdownMs(Math.max(0, currentTurnExpiresAt - Date.now()))
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 250)
    return () => window.clearInterval(interval)
  }, [currentTurnExpiresAt])

  useEffect(() => {
    if (isSpectator || !canPlaceCell || activeClockCountdownMs === null || activeClockCountdownMs > 10_000) {
      lastCountdownWarningSecondRef.current = null
      return
    }

    const remainingWarningSecond = Math.floor(activeClockCountdownMs / 1000)
    if (remainingWarningSecond < 1 || remainingWarningSecond > 9) {
      return
    }

    if (lastCountdownWarningSecondRef.current === remainingWarningSecond) {
      return
    }

    lastCountdownWarningSecondRef.current = remainingWarningSecond
    playCountdownWarningSound()
  }, [activeClockCountdownMs, canPlaceCell, isSpectator])

  return (
    <div className="absolute left-3 right-3 top-3 flex justify-center md:left-0 md:right-0">
      <div className="pointer-events-none shadow-xxl w-full max-w-xl rounded-md bg-slate-800/95 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className={`flex min-w-0 items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] leading-tight ${canPlaceCell
                ? 'text-emerald-500'
                : isSpectator
                  ? 'text-sky-300'
                  : 'text-slate-300'
                }`}
                style={spectatorAccentTextStyle}
              >
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${canPlaceCell ? 'bg-emerald-500' : isSpectator ? '' : 'bg-slate-400'}`}
                  style={isSpectator ? spectatorAccentDotStyle : undefined}
                />
                <span className="min-w-0 truncate">{turnHeadline}</span>
              </div>
              <div className="mt-0.5 truncate text-xs leading-tight text-slate-300">{turnDetail}</div>
            </div>
            <div className="shrink-0 pt-0.5">{placementIndicator}</div>
          </div>

          <div className={`mt-2 grid gap-1.5 sm:gap-2 ${effectiveTimeControl.mode === 'match' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {effectiveTimeControl.mode === 'match' ? (
              playerSlots.map((playerId) => {
                const isActivePlayer = playerId === currentTurnPlayerId
                const isLocalPlayer = playerId === localPlayerId
                const displayedClockMs = getDisplayedPlayerClockMs(playerId)

                return (
                  <div
                    key={playerId}
                    className={`rounded-md border px-2 py-1.5 sm:px-2.5 sm:py-2 ${isActivePlayer
                      ? 'border-emerald-300/35 bg-emerald-400/12 shadow-[0_0_0_1px_rgba(110,231,183,0.12)]'
                      : 'border-white/10 bg-white/6'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: getPlayerTileColor(gameState.playerTiles, playerId) }}
                        />
                        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 sm:text-[11px]">
                          {getPlayerLabel(playerIds, playerId, playerNames)}
                        </span>
                        {isLocalPlayer && !isSpectator && (
                          <div className="rounded bg-white/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-200 sm:text-[9px]">
                            You
                          </div>
                        )}
                      </div>
                      <div className={`text-base font-black tabular-nums leading-none sm:text-lg ${isActivePlayer ? 'text-emerald-100' : 'text-white'}`}>
                        {formatMinutesSeconds(displayedClockMs)}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              singleClockCard
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TurnTimerHud
