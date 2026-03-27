import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import FinishedGamesScreen from '../components/FinishedGamesScreen'
import { useQueryAccount } from '../query/accountClient'
import { useQueryFinishedGames } from '../query/finishedGamesClient'
import { buildFinishedGamePath, buildFinishedGamesPath, useArchiveRouteState } from './archiveRouteState'
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata'

function FinishedGamesRoute() {
  const navigate = useNavigate()
  const archiveRouteState = useArchiveRouteState()
  const accountQuery = useQueryAccount({ enabled: Boolean(archiveRouteState) })
  const isOwnArchive = archiveRouteState?.archiveView === 'mine'
  const finishedGamesQuery = useQueryFinishedGames(
    archiveRouteState?.archivePage ?? 1,
    archiveRouteState?.archiveBaseTimestamp ?? Date.now(),
    archiveRouteState?.archiveView ?? 'all',
    { enabled: Boolean(archiveRouteState) && (!isOwnArchive || Boolean(accountQuery.data?.user)) }
  )

  useEffect(() => {
    if (!archiveRouteState || !finishedGamesQuery.data) {
      return
    }

    if (archiveRouteState.archivePage > finishedGamesQuery.data.pagination.totalPages) {
      void navigate(
        buildFinishedGamesPath(
          finishedGamesQuery.data.pagination.totalPages,
          archiveRouteState.archiveBaseTimestamp,
          archiveRouteState.archiveView
        ),
        { replace: true }
      )
    }
  }, [archiveRouteState, finishedGamesQuery.data, navigate])

  if (!archiveRouteState) {
    return null
  }

  return (
    <>
      <PageMetadata
        {...(isOwnArchive
          ? {
            title: `My Match History • ${DEFAULT_PAGE_TITLE}`,
            description: 'Review your own finished Infinity Hexagonal Tic-Tac-Toe matches while signed in.',
            robots: 'noindex, nofollow' as const
          }
          : {
            title: `Finished Games Archive • ${DEFAULT_PAGE_TITLE}`,
            description: 'Browse finished Infinity Hexagonal Tic-Tac-Toe matches and review their move history.'
          })}
      />
      <FinishedGamesScreen
        archive={finishedGamesQuery.data ?? null}
        isLoading={isOwnArchive ? accountQuery.isLoading || finishedGamesQuery.isLoading : finishedGamesQuery.isLoading}
        errorMessage={finishedGamesQuery.error instanceof Error ? finishedGamesQuery.error.message : null}
        archiveView={archiveRouteState.archiveView}
        currentProfileId={accountQuery.data?.user?.id ?? null}
        requiresSignIn={isOwnArchive && !accountQuery.data?.user}
        showSignInHint={!isOwnArchive && !accountQuery.isLoading && !accountQuery.data?.user}
        onOpenGame={(gameId) => void navigate(
          buildFinishedGamePath(
            gameId,
            archiveRouteState.archiveView
          )
        )}
        onChangePage={(nextArchivePage) => void navigate(
          buildFinishedGamesPath(nextArchivePage, archiveRouteState.archiveBaseTimestamp, archiveRouteState.archiveView),
          { replace: true }
        )}
        onRefresh={() => void navigate(
          buildFinishedGamesPath(1, Date.now(), archiveRouteState.archiveView),
          { replace: true }
        )}
      />
    </>
  )
}

export default FinishedGamesRoute
