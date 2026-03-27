import type { Leaderboard } from '@ih3t/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchJson } from './apiClient';
import { queryKeys } from './queryDefinitions';

async function fetchLeaderboard() {
    return await fetchJson<Leaderboard>(`/api/leaderboard`);
}

export function useQueryLeaderboard(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.leaderboard,
        queryFn: fetchLeaderboard,
        enabled: options?.enabled,
        refetchInterval: (query) => {
            const nextRefreshAt = query.state.data?.nextRefreshAt;
            if (!nextRefreshAt) {
                return 10 * 60 * 1000;
            }

            return Math.max(1_000, nextRefreshAt - Date.now());
        },
        refetchIntervalInBackground: true,
    });
}
