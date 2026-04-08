import type { AccountProfile } from '@ih3t/shared';
import type { TournamentDetail } from '@ih3t/shared';

import { reconnectSocket } from '../liveGameClient';
import { fetchJson } from './apiClient';
import { queryClient } from './queryClient';
import { queryKeys } from './queryDefinitions';

type DevAuthUsersResponse = {
    users: AccountProfile[];
};

type DevLoginResponse = {
    user: AccountProfile | null;
};

type DevTournamentSeedResponse = {
    addedCount: number;
};

type DevQuickBotTournamentResponse = {
    tournament: TournamentDetail;
};

export type DevTournamentSeedRequest = {
    count: number;
    state: `registered` | `checked-in`;
};

async function invalidateUserCaches() {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.account }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accountPreferences }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tournaments }),
    ]);
}

export async function listDevAuthUsers() {
    return await fetchJson<DevAuthUsersResponse>(`/api/dev-auth/users`);
}

export async function signInWithDevUser(userId: string) {
    const response = await fetchJson<DevLoginResponse>(`/api/dev-auth/login`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ userId }),
    });

    await invalidateUserCaches();
    reconnectSocket();
    return response;
}

export async function signOutDevUser() {
    const response = await fetchJson<{ ok: boolean }>(`/api/dev-auth/logout`, {
        method: `POST`,
    });

    queryClient.removeQueries({ queryKey: queryKeys.account, exact: true });
    queryClient.removeQueries({ queryKey: queryKeys.accountPreferences, exact: true });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    reconnectSocket();
    return response;
}

export async function seedTournamentWithDevUsers(tournamentId: string, request: DevTournamentSeedRequest) {
    return await fetchJson<DevTournamentSeedResponse>(`/api/dev/tournaments/${encodeURIComponent(tournamentId)}/seed`, {
        method: `POST`,
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify(request),
    });
}

type DevResolveResponse = { resolved: number };

export async function devResolveCurrentRound(tournamentId: string) {
    const result = await fetchJson<DevResolveResponse>(`/api/dev/tournaments/${encodeURIComponent(tournamentId)}/resolve-round`, { method: `POST` });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    return result;
}

export async function devResolveAll(tournamentId: string) {
    const result = await fetchJson<DevResolveResponse>(`/api/dev/tournaments/${encodeURIComponent(tournamentId)}/resolve-all`, { method: `POST` });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    return result;
}

export async function devResolveN(tournamentId: string, count: number) {
    const result = await fetchJson<DevResolveResponse>(`/api/dev/tournaments/${encodeURIComponent(tournamentId)}/resolve-n`, {
        method: `POST`,
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify({ count }),
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    return result;
}

export async function createQuickSealBotTournament() {
    const response = await fetchJson<DevQuickBotTournamentResponse>(`/api/dev/tournaments/quick-seal-bot`, {
        method: `POST`,
    });

    queryClient.setQueryData(queryKeys.tournament(response.tournament.id), response.tournament);
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tournaments }),
        queryClient.invalidateQueries({ queryKey: queryKeys.ownTournaments }),
    ]);

    return response.tournament;
}
