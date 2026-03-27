import type {
    AdminBroadcastMessageRequest,
    AdminBroadcastMessageResponse,
    AdminScheduleShutdownRequest,
    AdminServerSettingsResponse,
    AdminShutdownControlResponse,
    AdminStatsResponse,
    AdminTerminateSessionResponse,
    AdminUpdateServerSettingsRequest,
} from '@ih3t/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchJson } from './apiClient';
import { queryClient } from './queryClient';
import { queryKeys } from './queryDefinitions';

async function fetchAdminServerSettings() {
    return await fetchJson<AdminServerSettingsResponse>(`/api/admin/server-settings`);
}

export async function updateAdminServerSettings(maxConcurrentGames: number | null) {
    const response = await fetchJson<AdminServerSettingsResponse>(`/api/admin/server-settings`, {
        method: `PUT`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({
            settings: {
                maxConcurrentGames,
            },
        } satisfies AdminUpdateServerSettingsRequest),
    });

    queryClient.setQueryData(queryKeys.serverSettings, response);
    return response;
}

export async function scheduleShutdown(delayMinutes: number) {
    const { shutdown } = await fetchJson<AdminShutdownControlResponse>(`/api/admin/shutdown`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ delayMinutes } satisfies AdminScheduleShutdownRequest),
    });
    queryClient.setQueryData(queryKeys.serverShutdown, shutdown);
    return shutdown;
}

export async function cancelShutdownSchedule() {
    return await fetchJson<AdminShutdownControlResponse>(`/api/admin/shutdown`, {
        method: `DELETE`,
    }).then(() => {
        queryClient.setQueryData(queryKeys.serverShutdown, null);
    });
}

export async function broadcastAdminMessage(message: string) {
    return await fetchJson<AdminBroadcastMessageResponse>(`/api/admin/broadcast`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ message } satisfies AdminBroadcastMessageRequest),
    });
}

export async function terminateAdminGame(sessionId: string) {
    const response = await fetchJson<AdminTerminateSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/terminate`, {
        method: `POST`,
    });

    await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.availableSessions }),
        queryClient.invalidateQueries({ queryKey: [`admin`] }),
    ]);

    return response;
}

async function fetchAdminStats(timezoneOffsetMinutes: number) {
    return await fetchJson<AdminStatsResponse>(`/api/admin/stats?tzOffsetMinutes=${timezoneOffsetMinutes}`);
}

export function useQueryAdminStats(timezoneOffsetMinutes: number, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.adminStats(timezoneOffsetMinutes),
        queryFn: () => fetchAdminStats(timezoneOffsetMinutes),
        enabled: options?.enabled,
        refetchInterval: 60_000,
        refetchIntervalInBackground: true,
    });
}

export function useQueryAdminServerSettings(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.serverSettings,
        queryFn: fetchAdminServerSettings,
        enabled: options?.enabled,
        staleTime: 10_000,
    });
}
