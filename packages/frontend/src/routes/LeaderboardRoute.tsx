import LeaderboardScreen from '../components/LeaderboardScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { useQueryAccount } from '../query/accountClient';
import { useQueryLeaderboard } from '../query/leaderboardClient';

function LeaderboardRoute() {
    const accountQuery = useQueryAccount({ enabled: true });
    const leaderboardQuery = useQueryLeaderboard({ enabled: true });

    return (
        <>
            <PageMetadata
                title={`Leaderboard • ${DEFAULT_PAGE_TITLE}`}
                description="See the highest rated HeXO players and current standings."
            />

            <LeaderboardScreen
                leaderboard={leaderboardQuery.data ?? null}
                isLoading={leaderboardQuery.isLoading || leaderboardQuery.isRefetching}
                errorMessage={leaderboardQuery.error instanceof Error ? leaderboardQuery.error.message : null}
                currentUsername={accountQuery.data?.user?.username ?? null}
            />
        </>
    );
}

export default LeaderboardRoute;
