import type { Leaderboard } from '@ih3t/shared';

import { LeaderboardSection } from './LeaderboardPanel';
import PageCorpus from './PageCorpus';

type LeaderboardScreenProps = {
    leaderboard: Leaderboard | null
    isLoading: boolean
    errorMessage: string | null
    currentUsername: string | null
};

function LeaderboardScreen({
    leaderboard,
    isLoading,
    errorMessage,
}: Readonly<LeaderboardScreenProps>) {
    let inner;
    if (leaderboard) {
        inner = (
            <LeaderboardSection
                leaderboard={leaderboard}
                isUpdating={isLoading}
            />
        );
    } else if (isLoading) {
        inner = (
            <div className="mt-6 pb-6 rounded-[1.75rem] border border-white/10 bg-white/6 px-6 py-10 text-center text-slate-300">
                Loading leaderboard...
            </div>
        );
    }

    return (
        <PageCorpus
            category="Player Leaderboard"
            title="Highest rated players"
            description="Top 10 players ranked by ELO from rated games and refreshed every 10 minutes."
        >
            {errorMessage && (
                <div className="mt-6 rounded-3xl border border-rose-300/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                    {errorMessage}
                </div>
            )}

            {inner}
        </PageCorpus >
    );
}

export default LeaderboardScreen;
