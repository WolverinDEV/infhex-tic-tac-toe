import type { FinishedGameRecord, FinishedGamesPage, SessionInfo } from '@ih3t/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchJson } from './apiClient'

export const FINISHED_GAMES_PAGE_SIZE = 20

export const queryKeys = {
  availableSessions: ['sessions', 'available'] as const,
  finishedGames: ['finished-games'] as const,
  finishedGamesPage: (page: number, pageSize: number, baseTimestamp: number) =>
    ['finished-games', page, pageSize, baseTimestamp] as const,
  finishedGame: (gameId: string) => ['finished-games', gameId] as const
}

export function sortLobbySessions(sessions: SessionInfo[]) {
  return [...sessions].sort((leftSession, rightSession) => {
    if (leftSession.canJoin !== rightSession.canJoin) {
      return leftSession.canJoin ? -1 : 1
    }

    return rightSession.createdAt - leftSession.createdAt
  })
}

async function fetchAvailableSessions() {
  const sessions = await fetchJson<SessionInfo[]>('/api/sessions')
  return sortLobbySessions(sessions.filter(session => session.state !== 'finished'))
}

async function fetchFinishedGames(page: number, pageSize: number, baseTimestamp: number) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    baseTimestamp: String(baseTimestamp)
  })

  return await fetchJson<FinishedGamesPage>(`/api/finished-games?${params.toString()}`)
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

export function useQueryFinishedGames(page: number, baseTimestamp: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.finishedGamesPage(page, FINISHED_GAMES_PAGE_SIZE, baseTimestamp),
    queryFn: () => fetchFinishedGames(page, FINISHED_GAMES_PAGE_SIZE, baseTimestamp),
    placeholderData: keepPreviousData,
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
