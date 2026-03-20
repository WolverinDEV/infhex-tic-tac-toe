import type { FinishedGameSummary, FinishedGamesPage } from '@ih3t/shared'

interface FinishedGamesScreenProps {
  archive: FinishedGamesPage | null
  isLoading: boolean
  errorMessage: string | null
  onBack: () => void
  onOpenGame: (gameId: string) => void
  onChangePage: (page: number) => void
  onRefresh: () => void
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${seconds}s`
}

function getResultLabel(game: FinishedGameSummary) {
  if (game.reason === 'six-in-a-row') {
    return 'Won by six in a row'
  }

  if (game.reason === 'timeout') {
    return 'Won on time'
  }

  if (game.reason === 'disconnect') {
    return 'Won by disconnect'
  }

  return 'Match terminated'
}

function getVisiblePageNumbers(currentPage: number, totalPages: number) {
  const maxVisiblePages = 5
  const halfVisiblePages = Math.floor(maxVisiblePages / 2)
  let startPage = Math.max(1, currentPage - halfVisiblePages)
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

  startPage = Math.max(1, endPage - maxVisiblePages + 1)

  return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index)
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 4.5v3.7h-3.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
      <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FinishedGamesScreen({
  archive,
  isLoading,
  errorMessage,
  onBack,
  onOpenGame,
  onChangePage,
  onRefresh
}: Readonly<FinishedGamesScreenProps>) {
  const games = archive?.games ?? []
  const pagination = archive?.pagination
  const currentPage = pagination?.page ?? 1
  const totalPages = pagination?.totalPages ?? 1
  const totalGames = pagination?.totalGames ?? 0
  const totalMoves = pagination?.totalMoves ?? 0
  const pageStart = games.length === 0 ? 0 : (currentPage - 1) * (pagination?.pageSize ?? games.length) + 1
  const pageEnd = games.length === 0 ? 0 : pageStart + games.length - 1
  const visiblePageNumbers = getVisiblePageNumbers(currentPage, totalPages)

  return (
    <div className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.16),_transparent_24%),linear-gradient(135deg,_#020617,_#0f172a_45%,_#111827)] text-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[92rem] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <div className="shrink-0 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3 sm:block">
              <div>
                <p className="text-sm uppercase tracking-[0.32em] text-sky-200/80">Finished Games</p>
                <h1 className="mt-2 text-2xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
                  Match Archive
                </h1>
              </div>

              <div className="flex items-center gap-2 sm:hidden">
                <button
                  onClick={onBack}
                  aria-label="Back to lobby"
                  className="inline-flex items-center justify-center rounded-full bg-amber-300 p-2.5 text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
                >
                  <BackIcon />
                </button>
                <button
                  onClick={onRefresh}
                  aria-label="Refresh archive"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 p-2.5 text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                >
                  <RefreshIcon />
                </button>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:mt-4 sm:text-base sm:leading-7">
              Browse completed matches and open any game to step through every move on the board.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 sm:px-4 sm:py-2 sm:text-sm">
                <span className="uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.22em]">Games</span>
                <span className="ml-2 text-base font-black text-white sm:ml-3 sm:text-lg">{totalGames}</span>
              </div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 sm:px-4 sm:py-2 sm:text-sm">
                <span className="uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.22em]">Moves</span>
                <span className="ml-2 text-base font-black text-white sm:ml-3 sm:text-lg">{totalMoves}</span>
              </div>
            </div>
          </div>

          <div className="hidden items-center justify-end gap-3 sm:flex">
            <button
              onClick={onRefresh}
              aria-label="Refresh archive"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
            >
              Refresh
            </button>
            <button
              onClick={onBack}
              className="hidden rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200 sm:inline-flex"
            >
              Back To Lobby
            </button>
          </div>
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-hidden">
          <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0 sm:rounded-[2rem] sm:border sm:border-white/10 sm:bg-slate-950/55 sm:p-6 sm:shadow-[0_20px_80px_rgba(15,23,42,0.45)] sm:backdrop-blur">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-slate-300">
                Loading finished games...
              </div>
            ) : errorMessage ? (
              <div className="flex flex-1 items-center justify-center rounded-3xl border border-rose-300/20 bg-rose-500/10 px-6 py-8 text-center text-rose-100">
                <p className="text-lg font-semibold">Could not load finished games.</p>
                <p className="mt-3 text-sm leading-6 text-rose-100/85">{errorMessage}</p>
              </div>
            ) : games.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-slate-300">
                <p className="text-lg font-semibold text-white">No finished games are stored yet.</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Once MongoDB-backed history is available and matches finish, they will show up here automatically.
                </p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
                  {games.map((game) => (
                    <button
                      key={game.id}
                      onClick={() => onOpenGame(game.id)}
                      className="w-full rounded-[1.35rem] border border-white/10 bg-white/6 p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-300/30 hover:bg-white/10 sm:rounded-[1.75rem] sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="break-all text-[11px] uppercase tracking-[0.24em] text-sky-200/75 sm:text-xs sm:tracking-[0.28em]">Session {game.sessionId}</div>
                          <div className="mt-2 text-xl font-bold text-white sm:text-2xl">{getResultLabel(game)}</div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300 sm:text-sm">
                            <span className="rounded-full bg-slate-900/70 px-3 py-1">Moves: {game.moveCount}</span>
                            <span className="rounded-full bg-slate-900/70 px-3 py-1">Duration: {formatDuration(game.gameDurationMs)}</span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-300 sm:text-right sm:text-sm">
                          <div className="font-semibold text-white">{formatDateTime(game.finishedAt)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="shrink-0">
                  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:gap-3">
                    <button
                      onClick={() => onChangePage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className="shrink-0 rounded-full border border-white/15 bg-white/8 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 sm:px-5 sm:py-3 sm:text-sm sm:tracking-[0.18em]"
                    >
                      Previous
                    </button>

                    <div className="flex flex-1 flex-nowrap justify-center gap-1 sm:gap-2">
                      {visiblePageNumbers.map((pageNumber) => (
                        <button
                          key={pageNumber}
                          onClick={() => onChangePage(pageNumber)}
                          aria-current={pageNumber === currentPage ? 'page' : undefined}
                          className={`min-w-8 shrink-0 rounded-full px-2.5 py-2.5 text-[11px] font-semibold transition sm:min-w-11 sm:px-4 sm:py-3 sm:text-sm ${pageNumber === currentPage
                            ? 'bg-amber-300 text-slate-950'
                            : 'border border-white/15 bg-white/8 text-white hover:-translate-y-0.5 hover:bg-white/14'
                            }`}
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => onChangePage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      className="shrink-0 rounded-full border border-white/15 bg-white/8 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 sm:px-5 sm:py-3 sm:text-sm sm:tracking-[0.18em]"
                    >
                      Next
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-slate-400 sm:text-right sm:text-sm">
                    Showing {pageStart}-{pageEnd} of {totalGames} archived matches
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default FinishedGamesScreen
