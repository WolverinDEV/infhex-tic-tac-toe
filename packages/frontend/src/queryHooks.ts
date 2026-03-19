import type { FinishedGameRecord, FinishedGameSummary, SessionInfo } from '@ih3t/shared'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from './apiClient'

export const queryKeys = {
  availableSessions: ['sessions', 'available'] as const,
  finishedGames: ['finished-games'] as const,
  finishedGame: (gameId: string) => ['finished-games', gameId] as const
}

async function fetchAvailableSessions() {
  const sessions = await fetchJson<SessionInfo[]>('/api/sessions')
  return sessions.filter(session => session.canJoin)
}

async function fetchFinishedGames() {
  const data = await fetchJson<{ games: FinishedGameSummary[] }>('/api/finished-games')
  return data.games
}

async function fetchFinishedGame(gameId: string) {
  return await fetchJson<FinishedGameRecord>(`/api/finished-games/${encodeURIComponent(gameId)}`)
}

export function useQueryAvailableSessions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.availableSessions,
    queryFn: fetchAvailableSessions,
    enabled: options?.enabled
  })
}

export function useQueryFinishedGames(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.finishedGames,
    queryFn: fetchFinishedGames,
    enabled: options?.enabled
  })
}

export function useQueryFinishedGame(gameId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: gameId ? queryKeys.finishedGame(gameId) : ['finished-games', 'unknown'],
    queryFn: () => {
      if (!gameId) {
        throw new Error('Missing finished game id.')
      }

      return fetchFinishedGame(gameId)
    },
    enabled: Boolean(gameId) && options?.enabled
  })
}
