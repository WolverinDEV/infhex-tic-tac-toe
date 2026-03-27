import { useParams } from 'react-router'
import ProfileScreen from '../components/ProfileScreen'
import {
  useQueryAccount,
  useQueryProfile,
  useQueryProfileStatistics
} from '../query/accountClient'
import { useQueryPublicProfileGames as useQueryProfileGames } from '../query/finishedGamesClient'
import { useQueryAvailableSessions } from '../query/sessionClient'
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata'

function ProfileRoute() {
  const { profileId } = useParams<{ profileId: string }>()
  const isPublicProfileRoute = Boolean(profileId)

  const accountQuery = useQueryAccount({ enabled: true })
  const targetProfileId = profileId ?? accountQuery.data?.user?.id ?? null;

  const profileQuery = useQueryProfile(targetProfileId)
  const profileStatisticsQuery = useQueryProfileStatistics(targetProfileId)
  const recentGamesQuery = useQueryProfileGames(targetProfileId)

  const availableSessionsQuery = useQueryAvailableSessions()

  const liveGame = availableSessionsQuery.data?.find((session) =>
    session.startedAt !== null && session.players.some((player) => player.profileId === targetProfileId)
  ) ?? null

  const error = profileQuery.error
  const statisticsError = profileStatisticsQuery.error
  return (
    <>
      <PageMetadata
        {...(isPublicProfileRoute
          ? profileQuery.data?.user
            ? {
              title: `${profileQuery.data.user.username} • Player Profile • ${DEFAULT_PAGE_TITLE}`,
              description: `View ${profileQuery.data.user.username}'s public Infinity Hexagonal Tic-Tac-Toe profile and competitive standing.`,
              ogType: 'article' as const
            }
            : !profileQuery.isLoading
              ? {
                title: `Profile Not Found • ${DEFAULT_PAGE_TITLE}`,
                description: 'The requested player profile could not be found.',
                ogType: 'article' as const,
                robots: 'noindex, nofollow' as const
              }
              : {
                title: `Player Profile • ${DEFAULT_PAGE_TITLE}`,
                description: 'View a public Infinity Hexagonal Tic-Tac-Toe player profile.',
                ogType: 'article' as const
              }
          : {
            title: `My Profile • ${DEFAULT_PAGE_TITLE}`,
            description: 'Sign in to open your own Infinity Hexagonal Tic-Tac-Toe profile.',
            robots: 'noindex, nofollow' as const
          })}
      />
      <ProfileScreen
        account={profileQuery.data?.user ?? null}
        statistics={profileStatisticsQuery.data?.statistics ?? null}
        recentGames={recentGamesQuery.data ?? null}
        liveGame={liveGame}
        isLoading={profileQuery.isLoading}
        isStatisticsLoading={profileStatisticsQuery.isLoading}
        isRecentGamesLoading={recentGamesQuery.isLoading || recentGamesQuery.isRefetching}
        errorMessage={error instanceof Error ? error.message : null}
        statisticsErrorMessage={statisticsError instanceof Error ? statisticsError.message : null}
        recentGamesErrorMessage={recentGamesQuery.error instanceof Error ? recentGamesQuery.error.message : null}
        isPublicView={isPublicProfileRoute}
      />
    </>
  )
}

export default ProfileRoute
