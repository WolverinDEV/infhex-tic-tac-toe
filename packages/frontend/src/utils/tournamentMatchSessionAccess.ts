import type { TournamentMatch, TournamentStatus } from '@ih3t/shared';

export type TournamentMatchSessionAccess = {
    isParticipant: boolean
    canJoin: boolean
    canSpectate: boolean
};

export function getTournamentMatchSessionAccess(
    tournamentStatus: TournamentStatus,
    match: TournamentMatch,
    viewerProfileId: string | null,
): TournamentMatchSessionAccess {
    const isParticipant = Boolean(viewerProfileId && match.slots.some((slot) => slot.profileId === viewerProfileId));
    const canAccessSession = tournamentStatus === `live` && Boolean(match.sessionId);
    const canJoin = canAccessSession && isParticipant && (match.state === `ready` || match.state === `in-progress`);
    const canSpectate = canAccessSession && !isParticipant && match.state === `in-progress` && match.startedAt !== null;

    return {
        isParticipant,
        canJoin,
        canSpectate,
    };
}
