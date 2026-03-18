import { formatCountdown } from './gameBoardUtils'

interface GameScreenStatusProps {
  canPlaceCell: boolean
  isSpectator: boolean
  placementsRemaining: number
  turnCountdownMs: number | null
  turnHeadline: string
  turnDetail: string
}

function GameScreenStatus({
  canPlaceCell,
  isSpectator,
  placementsRemaining,
  turnCountdownMs,
  turnHeadline,
  turnDetail
}: Readonly<GameScreenStatusProps>) {
  return (
    <div className="absolute left-3 right-3 top-3 flex justify-center md:left-0 md:right-0">
      <div className="pointer-events-none shadow-xxl w-full max-w-md rounded-md bg-slate-800/95 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${canPlaceCell ? 'bg-emerald-500' : isSpectator ? 'bg-sky-400' : 'bg-slate-400'}`} />
          <div className="min-w-0 flex-1 spacing">
            <div className={`text-sm font-bold uppercase tracking-[0.16em] ${canPlaceCell
              ? 'bg-emerald-400/16 text-emerald-500'
              : isSpectator
                ? 'bg-sky-400/16 text-sky-300'
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
              const isFilled = index >= 2 - placementsRemaining
              const color = isFilled
                ? canPlaceCell
                  ? 'bg-emerald-500'
                  : isSpectator
                    ? 'bg-sky-300'
                    : 'bg-white/90'
                : 'bg-white/40'

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
  )
}

export default GameScreenStatus
