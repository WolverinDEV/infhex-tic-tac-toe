import type {
  AccountPreferences,
  AccountPreferencesResponse,
  AccountResponse,
  ProfileStatisticsResponse,
  ProfileResponse,
  UpdateAccountPreferencesRequest,
  UpdateAccountProfileRequest
} from '@ih3t/shared'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from './apiClient'
import { queryClient } from './queryClient'
import { queryKeys } from './queryDefinitions'

async function fetchAccount() {
  return await fetchJson<AccountResponse>('/api/account')
}

async function fetchPublicAccount(profileId: string) {
  return await fetchJson<ProfileResponse>(`/api/profiles/${encodeURIComponent(profileId)}`)
}

async function fetchAccountPreferences() {
  return await fetchJson<AccountPreferencesResponse>('/api/account/preferences')
}

async function fetchAccountStatistics() {
  return await fetchJson<ProfileStatisticsResponse>('/api/account/statistics')
}

async function fetchPublicAccountStatistics(profileId: string) {
  return await fetchJson<ProfileStatisticsResponse>(`/api/profiles/${encodeURIComponent(profileId)}/statistics`)
}

export async function updateAccountProfile(update: UpdateAccountProfileRequest) {
  return await fetchJson<AccountResponse>('/api/account', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(update)
  })
}

export async function updateAccountUsername(username: string) {
  return await updateAccountProfile({ username } satisfies UpdateAccountProfileRequest)
}

export async function updateAccountPreferences(preferences: AccountPreferences) {
  const previousResponse = queryClient.getQueryData<AccountPreferencesResponse>(queryKeys.accountPreferences)
  queryClient.setQueryData(queryKeys.accountPreferences, { preferences })

  try {
    const response = await fetchJson<AccountPreferencesResponse>('/api/account/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ preferences } satisfies UpdateAccountPreferencesRequest)
    })

    queryClient.setQueryData(queryKeys.accountPreferences, response)
    return response
  } catch (error) {
    if (previousResponse) {
      queryClient.setQueryData(queryKeys.accountPreferences, previousResponse)
    } else {
      queryClient.removeQueries({ queryKey: queryKeys.accountPreferences, exact: true })
    }

    throw error
  }
}

export function useQueryAccount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: fetchAccount,
    enabled: options?.enabled,
    staleTime: 10 * 60 * 1000
  })
}

export function useQueryPublicAccount(profileId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.profile(profileId),
    queryFn: () => {
      if (!profileId) {
        throw new Error('Missing profile id.')
      }

      return fetchPublicAccount(profileId)
    },
    enabled: Boolean(profileId) && options?.enabled,
    staleTime: 10 * 60 * 1000
  })
}

export function useQueryAccountPreferences(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.accountPreferences,
    queryFn: fetchAccountPreferences,
    enabled: options?.enabled,
    staleTime: 10 * 60 * 1000
  })
}

export function useQueryAccountStatistics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.accountStatistics,
    queryFn: fetchAccountStatistics,
    enabled: options?.enabled,
    staleTime: 60 * 1000
  })
}

export function useQueryPublicAccountStatistics(profileId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.profileStatistics(profileId),
    queryFn: () => {
      if (!profileId) {
        throw new Error('Missing profile id.')
      }

      return fetchPublicAccountStatistics(profileId)
    },
    enabled: Boolean(profileId) && options?.enabled,
    staleTime: 60 * 1000
  })
}
