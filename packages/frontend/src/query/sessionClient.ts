import type { CreateSessionRequest, CreateSessionResponse, LobbyInfo } from '@ih3t/shared'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from './apiClient'
import { sortLobbySessions } from '../utils/lobby'
import { queryKeys } from './queryDefinitions'

async function fetchAvailableSessions() {
  const sessions = await fetchJson<LobbyInfo[]>('/api/sessions')
  return sortLobbySessions(sessions)
}

export async function hostGame(request: CreateSessionRequest) {
  const data = await fetchJson<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  })

  return data.sessionId
}

export function useQueryAvailableSessions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.availableSessions,
    queryFn: fetchAvailableSessions,
    enabled: options?.enabled,
    staleTime: 10_000
  })
}
