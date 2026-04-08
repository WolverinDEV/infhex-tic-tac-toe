import type {
    CreateTournamentRequest,
    MatchClaimWinState,
    TournamentDetail,
    TournamentListingResponse,
    TournamentMatchResolutionRequest,
    TournamentParticipantMutationRequest,
    TournamentParticipantSwapRequest,
    UpdateTournamentRequest,
    UserSearchResponse,
} from '@ih3t/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchJson, fetchOptionalJson } from './apiClient';
import { queryClient } from './queryClient';
import { queryKeys } from './queryDefinitions';

async function fetchTournaments(pastPage = 1) {
    const params = pastPage > 1 ? `?pastPage=${pastPage}` : ``;
    return await fetchJson<TournamentListingResponse>(`/api/tournaments${params}`);
}

async function fetchTournament(tournamentId: string) {
    return await fetchOptionalJson<TournamentDetail>(`/api/tournaments/${encodeURIComponent(tournamentId)}`);
}

export async function searchTournamentPlayers(query: string) {
    return await fetchJson<UserSearchResponse>(`/api/users/search?q=${encodeURIComponent(query)}`);
}

export async function createTournament(request: CreateTournamentRequest) {
    const tournament = await fetchJson<TournamentDetail>(`/api/tournaments`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(request),
    });

    await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tournaments }),
        queryClient.invalidateQueries({ queryKey: queryKeys.ownTournaments }),
    ]);
    queryClient.setQueryData(queryKeys.tournament(tournament.id), tournament);
    return tournament;
}

async function writeTournamentMutation(path: string, init?: RequestInit) {
    const tournament = await fetchJson<TournamentDetail>(path, init);
    queryClient.setQueryData(queryKeys.tournament(tournament.id), tournament);
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    return tournament;
}

export async function updateTournament(tournamentId: string, request: UpdateTournamentRequest) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}`, {
        method: `PATCH`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(request),
    });
}

export async function registerForTournament(tournamentId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/register`, {
        method: `POST`,
    });
}

export async function withdrawFromTournament(tournamentId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/register`, {
        method: `DELETE`,
    });
}

export async function checkInTournament(tournamentId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/check-in`, {
        method: `POST`,
    });
}

export async function addTournamentParticipant(tournamentId: string, profileId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/participants`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ profileId } satisfies TournamentParticipantMutationRequest),
    });
}

export async function removeTournamentParticipant(tournamentId: string, profileId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/participants/${encodeURIComponent(profileId)}`, {
        method: `DELETE`,
    });
}

export async function swapTournamentParticipant(tournamentId: string, request: TournamentParticipantSwapRequest) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/participants/swap`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(request),
    });
}

export async function startTournament(tournamentId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/start`, {
        method: `POST`,
    });
}

export async function reorderTournamentSeeds(tournamentId: string, orderedProfileIds: string[]) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/seeds`, {
        method: `PATCH`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ orderedProfileIds }),
    });
}

export async function awardTournamentWalkover(tournamentId: string, matchId: string, winnerProfileId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/walkover`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify({ winnerProfileId } satisfies TournamentMatchResolutionRequest),
    });
}

export async function reopenTournamentMatch(tournamentId: string, matchId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/reopen`, {
        method: `POST`,
    });
}

export async function cancelTournament(tournamentId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/cancel`, {
        method: `POST`,
    });
}

export async function requestMatchExtension(tournamentId: string, matchId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/extension`, {
        method: `POST`,
    });
}

export async function claimMatchWin(tournamentId: string, matchId: string) {
    return await fetchJson<MatchClaimWinState>(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/claim-win`, {
        method: `POST`,
    });
}

export async function resolveExtension(tournamentId: string, extensionId: string, approve: boolean) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/extensions/${encodeURIComponent(extensionId)}/resolve`, {
        method: `POST`,
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify({ approve }),
    });
}

export async function unsubscribeFromTournament(tournamentId: string, transferTo?: string) {
    await fetchJson<{ success: boolean }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/unsubscribe`, {
        method: `POST`,
        headers: transferTo ? { 'Content-Type': `application/json` } : undefined,
        body: transferTo ? JSON.stringify({ transferTo }) : undefined,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
}

export async function grantTournamentOrganizer(tournamentId: string, profileId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/organizers`, {
        method: `POST`,
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify({ profileId }),
    });
}

export async function revokeTournamentOrganizer(tournamentId: string, profileId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/organizers/${encodeURIComponent(profileId)}`, {
        method: `DELETE`,
    });
}

export async function addToAccessList(tournamentId: string, list: `whitelist` | `blacklist`, profileId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/${list}`, {
        method: `POST`,
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify({ profileId }),
    });
}

export async function bulkAddToAccessList(tournamentId: string, list: `whitelist` | `blacklist`, names: string[]) {
    const result = await fetchJson<{ matched: string[]; unmatched: string[] }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/${list}/bulk`, {
        method: `POST`,
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify({ names }),
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    if (tournamentId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.tournament(tournamentId) });
    }
    return result;
}

export async function removeFromAccessList(tournamentId: string, list: `whitelist` | `blacklist`, profileId: string) {
    return await writeTournamentMutation(`/api/tournaments/${encodeURIComponent(tournamentId)}/${list}/${encodeURIComponent(profileId)}`, {
        method: `DELETE`,
    });
}

export function useQueryTournaments(options?: { enabled?: boolean; pastPage?: number }) {
    const pastPage = options?.pastPage ?? 1;
    return useQuery({
        queryKey: [
            ...queryKeys.tournaments, `list`, pastPage,
        ],
        queryFn: () => fetchTournaments(pastPage),
        enabled: options?.enabled,
        staleTime: 30_000,
    });
}

export function useQueryTournament(tournamentId: string | null, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.tournament(tournamentId),
        queryFn: () => {
            if (!tournamentId) {
                throw new Error(`Missing tournament id.`);
            }

            return fetchTournament(tournamentId);
        },
        enabled: Boolean(tournamentId) && options?.enabled,
        staleTime: 10_000,
        refetchInterval: 10_000,
    });
}
