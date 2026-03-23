import type { FinishedGameSummary, FinishedGamesPage } from '@ih3t/shared'
import type { FinishedGamesArchiveView } from '../query/queryDefinitions'
import { formatDateTime } from '../utils/dateTime'
import { formatCompactDuration } from '../utils/duration'
import {
  getNeutralResultLabel,
  getPersonalResultLabel,
  type PersonalResultTone
} from '../utils/finishedGames'
import { getPlayerLabel, getPlayerTileColor } from '../utils/gameBoard'
import { getVisiblePageNumbers } from '../utils/pagination'
import PageCorpus from './PageCorpus'

interface FinishedGamesScreenProps {
  archive: FinishedGamesPage | null
  archiveView: FinishedGamesArchiveView
  currentProfileId: string | null
  requiresSignIn: boolean
  showSignInHint: boolean
  isLoading: boolean
  errorMessage: string | null
  onOpenGame: (gameId: string) => void
  onChangePage: (page: number) => void
  onRefresh: () => void
}

function getResultPresentation(
  game: FinishedGameSummary,
  isOwnArchive: boolean,
  currentProfileId: string | null
): {
  label: string
  tone: PersonalResultTone
  cardClassName: string
  titleClassName: string
  sessionClassName: string
} {
  const result = isOwnArchive
    ? getPersonalResultLabel(game, currentProfileId)
    : { label: getNeutralResultLabel(game), tone: 'neutral' as const }
  const sharedCardClassName = 'border-white/10 bg-white/6 hover:border-sky-300/30 hover:bg-white/10'

  if (result.tone === 'win') {
    return {
      ...result,
      cardClassName: `${sharedCardClassName} pl-6 shadow-[inset_3px_0_0_rgba(16,185,129,1),inset_22px_0_28px_-24px_rgba(16,185,129,0.95)]`,
      titleClassName: 'text-white',
      sessionClassName: 'text-sky-200/75',
    }
  } else if (result.tone === 'loss') {
    return {
      ...result,
      cardClassName: `${sharedCardClassName} pl-6 shadow-[inset_3px_0_0_rgba(244,63,94,1),inset_22px_0_28px_-24px_rgba(244,63,94,0.95)]`,
      titleClassName: 'text-white',
      sessionClassName: 'text-sky-200/75',
    }
  }

  return {
    ...result,
    cardClassName: `${sharedCardClassName} ${isOwnArchive ? "pl-6" : ""}`,
    titleClassName: 'text-white',
    sessionClassName: 'text-sky-200/75',
  }
}

function FinishedGamesScreen({
  archive,
  archiveView,
  currentProfileId,
  requiresSignIn,
  showSignInHint,
  isLoading,
  errorMessage,
  onOpenGame,
  onChangePage,
  onRefresh
}: Readonly<FinishedGamesScreenProps>) {
  const isOwnArchive = archiveView === 'mine'
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
    <PageCorpus
      category={"Finished Games"}
      title={isOwnArchive ? 'My Match History' : 'Match Archive'}
      description={isOwnArchive
        ? 'Review the finished matches you played while signed in and open any replay move by move.'
        : 'Browse completed matches and open any game to step through every move on the board.'}

      onRefresh={onRefresh}
    >
      <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-[auto_auto_1fr] px-4 sm:px-6">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 sm:px-4 sm:py-2 sm:text-sm">
          <span className="uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.22em]">Games</span>
          <span className="ml-2 text-base font-black text-white sm:ml-3 sm:text-lg">{totalGames}</span>
        </div>
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 sm:px-4 sm:py-2 sm:text-sm">
          <span className="uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.22em]">Moves</span>
          <span className="ml-2 text-base font-black text-white sm:ml-3 sm:text-lg">{totalMoves}</span>
        </div>

        {showSignInHint && (
          <div className="mt-2 col-span-2 lg:col-span-1 ml-auto lg:mt-[-2em] w-full lg:text-right lg:max-w-md rounded-[1.35rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50 sm:px-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/90">
              Personal Match History
            </div>
            <div className="mt-2 leading-6 text-amber-50/85">
              Sign in with Discord to unlock your own match history.
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 sm:px-6">
        <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0 sm:rounded-[2rem] sm:border sm:border-white/10 sm:bg-slate-950/55 sm:p-6 sm:shadow-[0_20px_80px_rgba(15,23,42,0.45)] sm:backdrop-blur">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-slate-300">
              Loading finished games...
            </div>
          ) : requiresSignIn ? (
            <div className="flex flex-1 items-center justify-center rounded-3xl border border-amber-300/20 bg-amber-400/10 px-6 py-8 text-center text-amber-50">
              <div>
                <p className="text-lg font-semibold text-white">Sign in to view your own match history.</p>
                <p className="mt-3 text-sm leading-6 text-amber-50/80">
                  You have to login in order to view your personal match history.
                </p>
              </div>
            </div>
          ) : errorMessage ? (
            <div className="flex flex-1 items-center justify-center rounded-3xl border border-rose-300/20 bg-rose-500/10 px-6 py-8 text-center text-rose-100">
              <p className="text-lg font-semibold">Could not load finished games.</p>
              <p className="mt-3 text-sm leading-6 text-rose-100/85">{errorMessage}</p>
            </div>
          ) : games.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-slate-300">
              <div>
                <p className="text-lg font-semibold text-white">
                  {isOwnArchive ? 'You have not finished any signed-in matches yet.' : 'No finished games are stored yet.'}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {isOwnArchive
                    ? 'Once you complete a match while logged in, it will appear here automatically.'
                    : 'Once MongoDB-backed history is available and matches finish, they will show up here automatically.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
                {games.map((game) => {
                  const presentation = getResultPresentation(game, isOwnArchive, currentProfileId)
                  return (
                    <button
                      key={game.id}
                      onClick={() => onOpenGame(game.id)}
                      className={`w-full rounded-[1.2rem] border px-4 py-3.5 text-left transition hover:-translate-y-0.5 sm:rounded-[1.5rem] sm:px-4.5 sm:py-4 ${presentation.cardClassName}`}
                    >
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <div className={`break-all text-[11px] uppercase tracking-[0.24em] sm:text-xs sm:tracking-[0.28em] ${presentation.sessionClassName}`}>
                              Session {game.sessionId}
                            </div>
                          </div>
                          <div className={`mt-1.5 text-lg font-bold sm:text-[1.45rem] ${presentation.titleClassName}`}>{presentation.label}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-300 sm:text-xs">
                            <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">Moves: {game.moveCount}</span>
                            <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">
                              {game.players.flatMap((player, index) => [
                                index > 0 && (<span className="mx-1.5" key={`vs-${index}`}>vs</span>),
                                <span
                                  key={player.playerId}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/60"
                                >
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: getPlayerTileColor(game.playerTiles, player.playerId) }}
                                  />
                                  <span>{getPlayerLabel(game.players, player.playerId)}</span>
                                </span>
                              ])}
                            </span>
                            <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">
                              Duration: {formatCompactDuration(game.gameResult?.durationMs ?? 0)}
                            </span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-300 sm:text-right sm:text-xs">
                          <div className="font-semibold text-white">
                            {formatDateTime(game.finishedAt ?? game.startedAt)}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
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
                  Showing {pageStart}-{pageEnd} of {totalGames} {isOwnArchive ? 'personal matches' : 'archived matches'}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageCorpus>
  )
}

export default FinishedGamesScreen
