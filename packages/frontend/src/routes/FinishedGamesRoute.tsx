import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import FinishedGamesScreen from '../components/FinishedGamesScreen'
import { useQueryAccount, useQueryFinishedGames } from '../queryHooks'
import { buildFinishedGamePath, buildFinishedGamesPath, useArchiveRouteState } from './archiveRouteState'

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
    <FinishedGamesScreen
      archive={finishedGamesQuery.data ?? null}
      isLoading={isOwnArchive ? accountQuery.isLoading || finishedGamesQuery.isLoading : finishedGamesQuery.isLoading}
      errorMessage={finishedGamesQuery.error instanceof Error ? finishedGamesQuery.error.message : null}
      archiveView={archiveRouteState.archiveView}
      requiresSignIn={isOwnArchive && !accountQuery.data?.user}
      showSignInHint={!isOwnArchive && !accountQuery.isLoading && !accountQuery.data?.user}
      onBack={() => void navigate('/')}
      onOpenGame={(gameId) => void navigate(
        buildFinishedGamePath(
          gameId,
          archiveRouteState.archivePage,
          archiveRouteState.archiveBaseTimestamp,
          archiveRouteState.archiveView
        )
      )}
      onChangePage={(nextArchivePage) => void navigate(
        buildFinishedGamesPath(nextArchivePage, archiveRouteState.archiveBaseTimestamp, archiveRouteState.archiveView)
      )}
      onRefresh={() => void navigate(buildFinishedGamesPath(1, Date.now(), archiveRouteState.archiveView))}
    />
  )
}

export default FinishedGamesRoute
