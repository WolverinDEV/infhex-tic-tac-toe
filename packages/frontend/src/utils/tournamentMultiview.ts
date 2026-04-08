import type { TournamentMatch } from '@ih3t/shared';

export const TOURNAMENT_MULTIVIEW_MAX_TILES = 4;

export function isTournamentMultiviewEligibleMatch(match: TournamentMatch): boolean {
    return match.state === `in-progress`
        && match.sessionId !== null
        && match.startedAt !== null;
}

export function getTournamentMultiviewEligibleMatches(matches: readonly TournamentMatch[]): TournamentMatch[] {
    return matches
        .filter(isTournamentMultiviewEligibleMatch)
        .slice()
        .sort((left, right) => {
            if (left.order !== right.order) {
                return left.order - right.order;
            }

            if (left.round !== right.round) {
                return left.round - right.round;
            }

            return left.id.localeCompare(right.id);
        });
}
