import type {
    CreateSandboxPositionRequest,
    CreateSandboxPositionResponse,
    SandboxGamePosition,
    SandboxPositionResponse,
} from '@ih3t/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchJson } from './apiClient';
import { queryKeys } from './queryDefinitions';

export async function fetchSandboxPosition(positionId: string) {
    return await fetchJson<SandboxPositionResponse>(`/api/sandbox-positions/${encodeURIComponent(positionId)}`);
}

export async function createSandboxPosition(name: string, gamePosition: SandboxGamePosition) {
    return await fetchJson<CreateSandboxPositionResponse>(`/api/sandbox-positions`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({
            name,
            gamePosition,
        } satisfies CreateSandboxPositionRequest),
    });
}

export function useQuerySandboxPosition(positionId: string | null, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.sandboxPosition(positionId),
        queryFn: () => {
            if (!positionId) {
                throw new Error(`Missing sandbox position id.`);
            }

            return fetchSandboxPosition(positionId);
        },
        enabled: Boolean(positionId) && options?.enabled,
        staleTime: 60 * 60 * 1000,
    });
}
