import { useEffect, useState } from 'react'
import type { ShutdownState } from '@ih3t/shared'

export type HudPlayerInfo = {
  playerId: string,
  displayColor: string,
  displayName: string,
}

interface GameScreenHudProps {
  sessionId: string
  localPlayerId: string | null
  players: HudPlayerInfo[]

  occupiedCellCount: number
  renderableCellCount: number

  shutdown: ShutdownState | null

  leaveLabel?: string
  onLeave: () => void
  onResetView: () => void
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function GameScreenHud({
  sessionId,
  players,
  localPlayerId,

  occupiedCellCount,
  renderableCellCount,

  shutdown,

  leaveLabel = 'Leave Game',
  onLeave,
  onResetView
}: Readonly<GameScreenHudProps>) {
  const [isHudOpen, setIsHudOpen] = useState(true)
  const [shutdownCountdownMs, setShutdownCountdownMs] = useState<number | null>(
    shutdown ? Math.max(0, shutdown.shutdownAt - Date.now()) : null
  )

  useEffect(() => {
    if (!shutdown) {
      setShutdownCountdownMs(null)
      return
    }

    const updateCountdown = () => {
      setShutdownCountdownMs(Math.max(0, shutdown.shutdownAt - Date.now()))
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 250)
    return () => window.clearInterval(interval)
  }, [shutdown])

  return (
    <>
      {!isHudOpen && (
        <div className="pointer-events-auto absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2 md:bottom-4 md:left-4 md:right-auto md:items-start">
          {shutdown && shutdownCountdownMs !== null && (
            <div className="rounded-full border border-amber-200/30 bg-slate-950/92 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-lg">
              Restarting {formatRemainingTime(shutdownCountdownMs)}
            </div>
          )}
          <button
            onClick={() => setIsHudOpen(true)}
            aria-label="Open HUD"
            title="Open HUD"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/95 shadow-lg transition hover:bg-slate-600"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 8h14" />
              <path d="M5 12h14" />
              <path d="M5 16h14" />
            </svg>
          </button>
        </div>
      )}

      {isHudOpen && (
        <div
          className="
            pointer-events-auto absolute bottom-0 left-0 right-0 w-auto rounded-t-[1.5rem] bg-slate-800 px-4 py-4 pb-4 text-left
            shadow-[0_12px_45px_rgba(15,23,42,0.22)] backdrop-blur-md
            md:left-0 md:w-full md:max-w-sm md:rounded-tl-none md:rounded-tr-[1.5rem]
          "
        >
          <div className="pointer-events-auto absolute right-3 top-3 z-10">
            <button
              onClick={() => setIsHudOpen(false)}
              aria-expanded={isHudOpen}
              aria-label="Close HUD"
              title="Close HUD"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/95 shadow-lg transition hover:bg-slate-600"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6 18 18" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="text-sm uppercase tracking-[0.25em] text-sky-300">Live Match {sessionId}</div>
          <h1 className="mt-1 text-2xl font-bold">Infinite Hex Tic-Tac-Toe</h1>
          <div className="mt-2 text-sm text-slate-300">
            Connect 6 hexagons in a row.<br />
            {localPlayerId ? 'Tap to place, drag to pan, pinch to zoom.' : 'Drag to pan and pinch to zoom while the players battle it out.'}
          </div>

          {shutdown && shutdownCountdownMs !== null && (
            <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">Shutdown Scheduled</div>
              <div className="mt-1">New games are disabled. This server restarts in {formatRemainingTime(shutdownCountdownMs)}.</div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-1">
            <div className="border-l border-white/18 pl-3">
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Cells</div>
              <div className="mt-1 text-white">{renderableCellCount} active</div>
              <div className="text-slate-300">{occupiedCellCount} occupied</div>
            </div>

            <div className="border-l border-white/18 pl-3">
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Players</div>
              {players.map(({ playerId, displayColor, displayName }) => (
                <div key={playerId} className="mt-1 flex items-center gap-2.5 text-white">
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-white/20 flex-shrink-0"
                    style={{ backgroundColor: displayColor }}
                  />
                  <span>{displayName}</span>
                  {playerId === localPlayerId && (
                    <span className="rounded-md border border-white/10 bg-white/6 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      You
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pointer-events-auto mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={onLeave}
              className="min-w-[9rem] flex-1 rounded-full bg-red-500 px-4 py-2 font-medium shadow-lg hover:bg-red-400 md:flex-none"
            >
              {leaveLabel}
            </button>
            <button
              onClick={onResetView}
              className="min-w-[9rem] flex-1 rounded-full bg-sky-600 px-4 py-2 font-medium shadow-lg hover:bg-sky-500 md:flex-none"
            >
              Reset View
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default GameScreenHud
