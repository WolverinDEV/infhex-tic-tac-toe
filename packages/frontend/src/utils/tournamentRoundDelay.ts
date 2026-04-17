import type { TournamentDetail, TournamentMatch } from '@ih3t/shared';

export type TournamentRoundDelayCountdownState = {
    matchId: string
    readyAt: number
    remainingMs: number
};

function getRoundDelayDependencyMatches(matches: TournamentMatch[], match: TournamentMatch): TournamentMatch[] {
    if (match.bracket === `grand-final-reset`) {
        return matches.filter((entry) => entry.bracket === `grand-final`);
    }

    const dependencyIds = new Set(match.slots.flatMap((slot) => {
        const source = slot.source;
        if (!source || source.type === `seed`) {
            return [];
        }

        return [source.matchId];
    }));
    if (dependencyIds.size > 0) {
        return matches.filter((entry) => dependencyIds.has(entry.id));
    }

    if (match.round <= 1) {
        return [];
    }

    return matches.filter((entry) => entry.bracket === match.bracket && entry.round === match.round - 1);
}

export function getRoundDelayCountdownState(
    tournament: Pick<TournamentDetail, `status` | `roundDelayMinutes` | `matches`>,
    now = Date.now(),
): TournamentRoundDelayCountdownState | null {
    if (tournament.status !== `live` || tournament.roundDelayMinutes <= 0) {
        return null;
    }

    const delayMs = tournament.roundDelayMinutes * 60_000;
    let bestCountdown: TournamentRoundDelayCountdownState | null = null;

    for (const match of tournament.matches) {
        if (match.state !== `pending`) {
            continue;
        }

        const dependencyMatches = getRoundDelayDependencyMatches(tournament.matches, match);
        if (dependencyMatches.length === 0 || !dependencyMatches.every((entry) => entry.state === `completed`)) {
            continue;
        }

        const latestResolvedAt = Math.max(...dependencyMatches.map((entry) => entry.resolvedAt ?? 0));
        const readyAt = latestResolvedAt + delayMs;
        if (readyAt <= now) {
            continue;
        }

        if (
            !bestCountdown
            || readyAt < bestCountdown.readyAt
            || (readyAt === bestCountdown.readyAt && match.id < bestCountdown.matchId)
        ) {
            bestCountdown = {
                matchId: match.id,
                readyAt,
                remainingMs: readyAt - now,
            };
        }
    }

    return bestCountdown;
}
