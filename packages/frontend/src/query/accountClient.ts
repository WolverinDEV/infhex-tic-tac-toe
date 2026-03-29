import type {
    AccountBotResponse,
    AccountBotsResponse,
    AccountPreferences,
    AccountPreferencesResponse,
    AccountResponse,
    CreateAccountBotRequest,
    ProfileResponse,
    ProfileStatisticsResponse,
    UpdateAccountBotRequest,
    UpdateAccountPreferencesRequest,
    UpdateAccountProfileRequest,
} from '@ih3t/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchJson } from './apiClient';
import { queryClient } from './queryClient';
import { queryKeys } from './queryDefinitions';

async function fetchAccount() {
    return await fetchJson<AccountResponse>(`/api/account`);
}

async function fetchProfile(profileId: string) {
    return await fetchJson<ProfileResponse>(`/api/profiles/${encodeURIComponent(profileId)}`);
}

async function fetchAccountPreferences() {
    return await fetchJson<AccountPreferencesResponse>(`/api/account/preferences`);
}

async function fetchAccountBots() {
    return await fetchJson<AccountBotsResponse>(`/api/account/bots`);
}

async function fetchProfileStatistics(profileId: string) {
    return await fetchJson<ProfileStatisticsResponse>(`/api/profiles/${encodeURIComponent(profileId)}/statistics`);
}

export async function updateAccountProfile(update: UpdateAccountProfileRequest) {
    return await fetchJson<AccountResponse>(`/api/account`, {
        method: `PATCH`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(update),
    });
}

export async function updateAccountUsername(username: string) {
    return await updateAccountProfile({ username } satisfies UpdateAccountProfileRequest);
}

export async function updateAccountPreferences(preferences: AccountPreferences) {
    const previousResponse = queryClient.getQueryData<AccountPreferencesResponse>(queryKeys.accountPreferences);
    queryClient.setQueryData(queryKeys.accountPreferences, { preferences });

    try {
        const response = await fetchJson<AccountPreferencesResponse>(`/api/account/preferences`, {
            method: `PATCH`,
            headers: {
                'Content-Type': `application/json`,
            },
            body: JSON.stringify({ preferences } satisfies UpdateAccountPreferencesRequest),
        });

        queryClient.setQueryData(queryKeys.accountPreferences, response);
        return response;
    } catch (error) {
        if (previousResponse) {
            queryClient.setQueryData(queryKeys.accountPreferences, previousResponse);
        } else {
            queryClient.removeQueries({ queryKey: queryKeys.accountPreferences, exact: true });
        }

        throw error;
    }
}

export async function createAccountBot(bot: CreateAccountBotRequest[`bot`]) {
    const response = await fetchJson<AccountBotResponse>(`/api/account/bots`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ bot } satisfies CreateAccountBotRequest),
    });

    queryClient.setQueryData<AccountBotsResponse>(queryKeys.accountBots, (previous) => ({
        bots: [response.bot, ...(previous?.bots ?? [])],
    }));
    return response;
}

export async function updateAccountBot(botId: string, bot: UpdateAccountBotRequest[`bot`]) {
    const response = await fetchJson<AccountBotResponse>(`/api/account/bots/${encodeURIComponent(botId)}`, {
        method: `PUT`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ bot } satisfies UpdateAccountBotRequest),
    });

    queryClient.setQueryData<AccountBotsResponse>(queryKeys.accountBots, (previous) => ({
        bots: (previous?.bots ?? []).map((existingBot) => existingBot.id === response.bot.id ? response.bot : existingBot),
    }));
    return response;
}

export async function deleteAccountBot(botId: string) {
    const response = await fetchJson<AccountBotsResponse>(`/api/account/bots/${encodeURIComponent(botId)}`, {
        method: `DELETE`,
    });

    queryClient.setQueryData(queryKeys.accountBots, response);
    return response;
}

export function useQueryAccount(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.account,
        queryFn: fetchAccount,
        enabled: options?.enabled,
        staleTime: 10 * 60 * 1000,
    });
}

export function useQueryAccountPreferences(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.accountPreferences,
        queryFn: fetchAccountPreferences,
        enabled: options?.enabled,
        staleTime: 10 * 60 * 1000,
    });
}

export function useQueryAccountBots(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.accountBots,
        queryFn: fetchAccountBots,
        enabled: options?.enabled,
        staleTime: 10 * 60 * 1000,
    });
}

export function useQueryProfile(profileId: string | null, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.profile(profileId),
        queryFn: () => {
            if (!profileId) {
                throw new Error(`Missing profile id.`);
            }

            return fetchProfile(profileId);
        },
        enabled: Boolean(profileId) && options?.enabled,
        staleTime: 10 * 60 * 1000,
    });
}

export function useQueryProfileStatistics(profileId: string | null, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.profileStatistics(profileId),
        queryFn: () => {
            if (!profileId) {
                throw new Error(`Missing profile id.`);
            }

            return fetchProfileStatistics(profileId);
        },
        enabled: Boolean(profileId) && options?.enabled,
        staleTime: 60 * 1000,
    });
}
