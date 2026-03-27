import { queryKeys, ShutdownState } from "@ih3t/shared";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "./apiClient";

export function useQueryServerShutdown() {
    return useQuery({
        queryKey: queryKeys.serverShutdown,
        queryFn: () => fetchJson<ShutdownState | null>(`/api/server/shutdown`),
        staleTime: 10 * 60 * 1000,
    });
}