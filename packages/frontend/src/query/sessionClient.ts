import type { CreateSessionRequest, CreateSessionResponse, LobbyInfo, SessionInfo } from '@ih3t/shared';
import { useQuery } from '@tanstack/react-query';

import { sortLobbySessions } from '../utils/lobby';
import { fetchJson, fetchOptionalJson } from './apiClient';
import { queryKeys } from './queryDefinitions';

async function fetchAvailableSessions() {
    const sessions = await fetchJson<LobbyInfo[]>(`/api/sessions`);
    return sortLobbySessions(sessions);
}

async function fetchSessionInfo(sessionId: string) {
    return await fetchOptionalJson<SessionInfo>(`/api/session/${encodeURIComponent(sessionId)}`);
}

export async function hostGame(request: CreateSessionRequest) {
    const data = await fetchJson<CreateSessionResponse>(`/api/sessions`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(request),
    });

    return data.sessionId;
}

export function useQueryAvailableSessions(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.availableSessions,
        queryFn: fetchAvailableSessions,
        enabled: options?.enabled,
        staleTime: 10_000,
    });
}

export function useQuerySessionInfo(sessionId: string | null, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.session(sessionId),
        queryFn: () => {
            if (!sessionId) {
                throw new Error(`Missing session id.`);
            }

            return fetchSessionInfo(sessionId);
        },
        enabled: Boolean(sessionId) && options?.enabled,
        staleTime: 10_000,
    });
}
