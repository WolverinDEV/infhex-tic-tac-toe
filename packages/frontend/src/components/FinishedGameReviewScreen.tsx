import type { BoardState, FinishedGameRecord } from '@ih3t/shared'
import { useEffect, useMemo, useState } from 'react'
import GameBoardCanvas from './game-screen/GameBoardCanvas'
import useGameBoard from './game-screen/useGameBoard'
import { getCellKey, getPlayerColor, getPlayerLabel } from './game-screen/gameBoardUtils'

interface FinishedGameReviewScreenProps {
  game: FinishedGameRecord | null
  isLoading: boolean
  errorMessage: string | null
  onBack: () => void
  onRetry: () => void
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(new Date(timestamp))
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getFinishReasonLabel(reason: FinishedGameRecord['reason']) {
  if (reason === 'six-in-a-row') {
    return 'Six in a row'
  }

  if (reason === 'timeout') {
    return 'Timeout'
  }

  if (reason === 'disconnect') {
    return 'Disconnect'
  }

  return 'Terminated'
}

function buildReplayBoardState(game: FinishedGameRecord | null, visibleMoveCount: number): BoardState {
  if (!game) {
    return {
      cells: [],
      currentTurnPlayerId: null,
      placementsRemaining: 0,
      currentTurnExpiresAt: null,
      playerTimeRemainingMs: {}
    }
  }

  return {
    cells: game.moves.slice(0, visibleMoveCount).map((move) => ({
      x: move.x,
      y: move.y,
      occupiedBy: move.playerId
    })),
    currentTurnPlayerId: null,
    placementsRemaining: 0,
    currentTurnExpiresAt: null,
    playerTimeRemainingMs: {}
  }
}

function getLastVisibleTurnCellKeys(game: FinishedGameRecord | null, visibleMoveCount: number): string[] {
  if (!game || visibleMoveCount <= 0) {
    return []
  }

  const lastVisibleMove = game.moves[visibleMoveCount - 1]
  if (!lastVisibleMove) {
    return []
  }

  const highlightedMoveKeys: string[] = []
  for (let moveIndex = visibleMoveCount - 1; moveIndex >= 0; moveIndex -= 1) {
    const move = game.moves[moveIndex]
    if (!move || move.playerId !== lastVisibleMove.playerId) {
      break
    }

    highlightedMoveKeys.push(getCellKey(move.x, move.y))
  }

  return highlightedMoveKeys
}

function FinishedGameReviewScreen({
  game,
  isLoading,
  errorMessage,
  onBack,
  onRetry
}: Readonly<FinishedGameReviewScreenProps>) {
  const [visibleMoveCount, setVisibleMoveCount] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)

  useEffect(() => {
    if (!game) {
      setVisibleMoveCount(0)
      setIsAutoPlaying(false)
      return
    }

    setVisibleMoveCount(game.moves.length)
    setIsAutoPlaying(false)
  }, [game])

  useEffect(() => {
    if (!game || !isAutoPlaying) {
      return
    }

    if (visibleMoveCount >= game.moves.length) {
      setIsAutoPlaying(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setVisibleMoveCount((currentCount) => Math.min(game.moves.length, currentCount + 1))
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [game, isAutoPlaying, visibleMoveCount])

  const boardState = useMemo(
    () => buildReplayBoardState(game, visibleMoveCount),
    [game, visibleMoveCount]
  )

  const activeMove = game && visibleMoveCount > 0
    ? game.moves[visibleMoveCount - 1]
    : null
  const highlightedCellKeys = useMemo(
    () => getLastVisibleTurnCellKeys(game, visibleMoveCount),
    [game, visibleMoveCount]
  )

  const {
    canvasRef,
    canvasClassName,
    canvasHandlers,
    renderableCellCount,
    resetView
  } = useGameBoard({
    boardState,
    players: game?.players ?? [],
    interactionEnabled: true,
    canPlaceCell: false,
    isOwnTurn: true,
    isSpectator: true,
    highlightedCellKeys,
    onPlaceCell: () => { }
  })

  const startPlayback = () => {
    if (!game) {
      return
    }

    if (visibleMoveCount >= game.moves.length) {
      setVisibleMoveCount(0)
    }

    setIsAutoPlaying(true)
  }

  return (
    <div className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.16),_transparent_22%),linear-gradient(135deg,_#020617,_#0f172a_45%,_#111827)] text-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[92rem] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-sky-200/80">Replay Viewer</p>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
              Finished Match Review
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRetry}
              className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
            >
              Refresh
            </button>
            <button
              onClick={onBack}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
            >
              Back To Archive
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-white/10 bg-white/6 text-lg text-slate-200 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur">
            Loading replay...
          </div>
        ) : errorMessage ? (
          <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-rose-300/20 bg-rose-500/10 px-6 text-center text-rose-100 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur">
            <div>
              <p className="text-2xl font-bold">Could not load this replay.</p>
              <p className="mt-3 max-w-xl text-sm leading-6 text-rose-100/85">{errorMessage}</p>
            </div>
          </div>
        ) : !game ? (
          <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-white/10 bg-white/6 text-lg text-slate-200 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur">
            This replay could not be found.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1.5fr)_24rem]">
            <section className="relative min-h-[34rem] overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/75 shadow-[0_20px_80px_rgba(15,23,42,0.45)] xl:min-h-0">
              <GameBoardCanvas
                canvasRef={canvasRef}
                className={canvasClassName}
                handlers={canvasHandlers}
              />

              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
                <div className="pointer-events-auto flex flex-wrap items-start justify-between gap-3">
                  <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Session</div>
                    <div className="mt-1 text-xl font-bold text-white">{game.sessionId}</div>
                    <div className="mt-2 text-sm text-slate-300">
                      Move {visibleMoveCount}/{game.moves.length}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={resetView}
                      className="rounded-full border border-white/15 bg-slate-950/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-900"
                    >
                      Reset View
                    </button>
                    <div className="rounded-full border border-white/15 bg-slate-950/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                      Rendered Cells {renderableCellCount}
                    </div>
                  </div>
                </div>

                <div className="pointer-events-auto rounded-[1.75rem] border border-white/10 bg-slate-950/78 p-4 backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Current Step</div>
                      <div className="mt-1 text-2xl font-bold text-white">
                        {activeMove
                          ? `${getPlayerLabel(game.players, activeMove.playerId, game.playerNames)} at (${activeMove.x}, ${activeMove.y})`
                          : 'Board setup'}
                      </div>
                      <div className="mt-1 text-sm text-slate-300">
                        {activeMove
                          ? `${formatDateTime(activeMove.timestamp)} • +${formatElapsed(activeMove.timestamp - game.startedAt)}`
                          : `Started ${formatDateTime(game.startedAt)}`}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setIsAutoPlaying(false)
                          setVisibleMoveCount(0)
                        }}
                        className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/14"
                      >
                        Start
                      </button>
                      <button
                        onClick={() => {
                          setIsAutoPlaying(false)
                          setVisibleMoveCount((currentCount) => Math.max(0, currentCount - 1))
                        }}
                        disabled={visibleMoveCount === 0}
                        className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => {
                          if (isAutoPlaying) {
                            setIsAutoPlaying(false)
                            return
                          }

                          startPlayback()
                        }}
                        className="rounded-full bg-sky-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-300"
                      >
                        {isAutoPlaying ? 'Pause' : 'Play'}
                      </button>
                      <button
                        onClick={() => {
                          setIsAutoPlaying(false)
                          setVisibleMoveCount((currentCount) => Math.min(game.moves.length, currentCount + 1))
                        }}
                        disabled={visibleMoveCount >= game.moves.length}
                        className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => {
                          setIsAutoPlaying(false)
                          setVisibleMoveCount(game.moves.length)
                        }}
                        className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/14"
                      >
                        End
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <aside className="flex min-h-[34rem] min-w-0 flex-col gap-4 overflow-hidden xl:min-h-0">
              <section className="min-w-0 shrink-0 rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="text-sm uppercase tracking-[0.3em] text-slate-300">Match Summary</div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Result</div>
                    <div className="mt-1 text-xl font-bold text-white">{getFinishReasonLabel(game.reason)}</div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Duration</div>
                    <div className="mt-1 text-xl font-bold text-white">{formatElapsed(game.gameDurationMs)}</div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Winner</div>
                    <div className="mt-1 text-xl font-bold text-white">
                      {game.winningPlayerId ? getPlayerLabel(game.players, game.winningPlayerId, game.playerNames) : 'No winner'}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Finished</div>
                    <div className="mt-1 text-sm leading-6 text-slate-200">{formatDateTime(game.finishedAt)}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {game.players.map((playerId) => (
                    <div
                      key={playerId}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: getPlayerColor(game.players, playerId) }}
                      />
                      <span>{getPlayerLabel(game.players, playerId, game.playerNames)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm uppercase tracking-[0.3em] text-slate-300">Move Timeline</div>
                  <div className="text-sm text-slate-400">{game.moves.length} logged moves</div>
                </div>

                <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                  <button
                    onClick={() => {
                      setIsAutoPlaying(false)
                      setVisibleMoveCount(0)
                    }}
                    className={`w-full min-w-0 overflow-hidden rounded-[1.5rem] border p-4 text-left transition ${visibleMoveCount === 0
                      ? 'border-sky-300/30 bg-sky-400/12'
                      : 'border-white/10 bg-white/6 hover:bg-white/10'
                      }`}
                  >
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Move 0</div>
                    <div className="mt-1 text-lg font-semibold text-white">Initial board</div>
                    <div className="mt-1 text-sm text-slate-300">Before the first placement.</div>
                  </button>

                  {game.moves.map((move, index) => {
                    const isActive = visibleMoveCount === index + 1

                    return (
                      <button
                        key={`${move.moveNumber}-${move.timestamp}`}
                        onClick={() => {
                          setIsAutoPlaying(false)
                          setVisibleMoveCount(index + 1)
                        }}
                        className={`w-full min-w-0 overflow-hidden rounded-[1.5rem] border p-4 text-left transition ${isActive
                          ? 'border-sky-300/30 bg-sky-400/12'
                          : 'border-white/10 bg-white/6 hover:bg-white/10'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Move {move.moveNumber}</div>
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: getPlayerColor(game.players, move.playerId) }}
                          />
                        </div>
                        <div className="mt-2 break-words text-lg font-semibold text-white">
                          {getPlayerLabel(game.players, move.playerId, game.playerNames)} placed at ({move.x}, {move.y})
                        </div>
                        <div className="mt-1 break-words text-sm text-slate-300">
                          {formatDateTime(move.timestamp)} • +{formatElapsed(move.timestamp - game.startedAt)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

export default FinishedGameReviewScreen
