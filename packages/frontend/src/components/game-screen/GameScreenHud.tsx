import { useState } from 'react'

interface GameScreenHudProps {
  isSpectator: boolean
  occupiedCellCount: number
  ownColor: string
  renderableCellCount: number
  onLeave: () => void
  onResetView: () => void
}

function GameScreenHud({
  isSpectator,
  occupiedCellCount,
  ownColor,
  renderableCellCount,
  onLeave,
  onResetView
}: Readonly<GameScreenHudProps>) {
  const [isMobileHudOpen, setIsMobileHudOpen] = useState(true)

  return (
    <>
      {!isMobileHudOpen && (
        <div className="pointer-events-auto absolute bottom-3 right-3 z-10 md:hidden">
          <button
            onClick={() => setIsMobileHudOpen(true)}
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

      <div
        className={`
          pointer-events-auto absolute bottom-0 left-0 right-0 w-auto rounded-t-[1.5rem] bg-slate-800 px-4 py-4 pb-4 text-left
          shadow-[0_12px_45px_rgba(15,23,42,0.22)] backdrop-blur-md transition-transform duration-300 ease-out
          ${isMobileHudOpen ? 'translate-y-0' : 'translate-y-full'}
          md:left-0 md:w-full md:max-w-sm md:translate-y-0 md:rounded-tl-none md:rounded-tr-[1.5rem]
        `}
      >
        <div className="pointer-events-auto absolute right-3 top-3 z-10 md:hidden">
          <button
            onClick={() => setIsMobileHudOpen(false)}
            aria-expanded={isMobileHudOpen}
            aria-label={isMobileHudOpen ? 'Close HUD' : 'Open HUD'}
            title={isMobileHudOpen ? 'Close HUD' : 'Open HUD'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/95 shadow-lg transition hover:bg-slate-600"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6 18 18" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="text-sm uppercase tracking-[0.25em] text-sky-300">Live Match</div>
        <h1 className="mt-1 text-2xl font-bold">Infinite Hex Tic-Tac-Toe</h1>
        <div className="mt-2 text-sm text-slate-300">
          Connect 6 hexagons in a row.<br />
          {isSpectator ? 'Drag to pan and pinch to zoom while the players battle it out.' : 'Tap to place, drag to pan, pinch to zoom.'}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-1">
          <div className="border-l border-white/18 pl-3">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Cells</div>
            <div className="mt-1 text-white">{renderableCellCount} active</div>
            <div className="text-slate-300">{occupiedCellCount} occupied</div>
          </div>

          <div className="border-l border-white/18 pl-3">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{isSpectator ? 'Viewing Mode' : 'Your Color'}</div>
            {isSpectator ? (
              <div className="mt-1 text-white">Read-only spectator</div>
            ) : (
              <div className="mt-1 flex items-center gap-2.5 text-white">
                <span>{ownColor}</span>
                <span
                  className="h-3.5 w-3.5 rounded-full border border-white/20"
                  style={{ backgroundColor: ownColor }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="pointer-events-auto mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onLeave}
            className="min-w-[9rem] flex-1 rounded-full bg-red-500 px-4 py-2 font-medium shadow-lg hover:bg-red-400 md:flex-none"
          >
            Leave Game
          </button>
          <button
            onClick={onResetView}
            className="min-w-[9rem] flex-1 rounded-full bg-sky-600 px-4 py-2 font-medium shadow-lg hover:bg-sky-500 md:flex-none"
          >
            Reset View
          </button>
        </div>
      </div>
    </>
  )
}

export default GameScreenHud
