import { useState } from 'react'
import { useParams } from 'react-router'
import ProfileScreen from '../components/ProfileScreen'
import {
  useQueryAccount,
  useQueryAccountStatistics,
  useQueryPublicAccount,
  useQueryPublicAccountStatistics
} from '../query/accountClient'
import { useQueryPublicProfileGames } from '../query/finishedGamesClient'
import { useQueryAvailableSessions } from '../query/sessionClient'
import { getInitialRenderTimestamp } from '../ssrState'

function ProfileRoute() {
  const { profileId } = useParams<{ profileId: string }>()
  const isPublicProfileRoute = Boolean(profileId)
  const [recentGamesBaseTimestamp] = useState(() => getInitialRenderTimestamp())

  const accountQuery = useQueryAccount({ enabled: true })
  const accountStatisticsQuery = useQueryAccountStatistics({
    enabled: !isPublicProfileRoute && !accountQuery.isLoading && Boolean(accountQuery.data?.user)
  })
  const publicAccountQuery = useQueryPublicAccount(profileId ?? null, {
    enabled: isPublicProfileRoute
  })
  const publicAccountStatisticsQuery = useQueryPublicAccountStatistics(profileId ?? null, {
    enabled: isPublicProfileRoute && !publicAccountQuery.isLoading && Boolean(publicAccountQuery.data?.user)
  })

  const account = isPublicProfileRoute
    ? publicAccountQuery.data?.user ?? null
    : accountQuery.data?.user ?? null
  const recentGamesQuery = useQueryPublicProfileGames(account?.id ?? null, recentGamesBaseTimestamp, {
    enabled: Boolean(account?.id)
  })
  const availableSessionsQuery = useQueryAvailableSessions({
    enabled: Boolean(account?.id)
  })
  const statistics = isPublicProfileRoute
    ? publicAccountStatisticsQuery.data?.statistics ?? null
    : accountStatisticsQuery.data?.statistics ?? null
  const liveGame = (availableSessionsQuery.data ?? []).find((session) =>
    session.startedAt !== null && session.players.some((player) => player.profileId === account?.id)
  ) ?? null
  const isLoading = isPublicProfileRoute ? publicAccountQuery.isLoading : accountQuery.isLoading
  const isStatisticsLoading = Boolean(account) && (
    isPublicProfileRoute
      ? publicAccountStatisticsQuery.isLoading || publicAccountStatisticsQuery.isRefetching
      : accountStatisticsQuery.isLoading || accountStatisticsQuery.isRefetching
  )
  const error = isPublicProfileRoute ? publicAccountQuery.error : accountQuery.error
  const statisticsError = isPublicProfileRoute ? publicAccountStatisticsQuery.error : accountStatisticsQuery.error

  return (
    <ProfileScreen
      account={account}
      statistics={statistics}
      recentGames={recentGamesQuery.data ?? null}
      liveGame={liveGame}
      isLoading={isLoading}
      isStatisticsLoading={isStatisticsLoading}
      isRecentGamesLoading={Boolean(account) && (recentGamesQuery.isLoading || recentGamesQuery.isRefetching)}
      errorMessage={error instanceof Error ? error.message : null}
      statisticsErrorMessage={statisticsError instanceof Error ? statisticsError.message : null}
      recentGamesErrorMessage={recentGamesQuery.error instanceof Error ? recentGamesQuery.error.message : null}
      isPublicView={isPublicProfileRoute}
    />
  )
}

export default ProfileRoute
