import type { TournamentMatch } from '@ih3t/shared';

export type TournamentBracketRound = {
    round: number
    matches: TournamentMatch[]
};

export type TournamentBracketConnectorEdge = {
    sourceRoundIndex: number
    sourceMatchIndex: number
    targetRoundIndex: number
    targetMatchIndex: number
};

function getSourceMatchIds(rounds: TournamentBracketRound[], match: TournamentMatch): string[] {
    const sourceMatchIds = match.slots.flatMap((slot) => {
        const source = slot.source;
        if (!source || source.type === `seed`) {
            return [];
        }

        return [source.matchId];
    });

    if (sourceMatchIds.length > 0) {
        return [...new Set(sourceMatchIds)];
    }

    if (match.bracket === `grand-final-reset`) {
        const grandFinal = rounds.flatMap((round) => round.matches)
            .find((entry) => entry.bracket === `grand-final`);
        return grandFinal ? [grandFinal.id] : [];
    }

    return [];
}

export function getBracketConnectorEdges(rounds: TournamentBracketRound[]): TournamentBracketConnectorEdge[] {
    const sortedRounds = rounds.map((round) => ({
        round: round.round,
        matches: [...round.matches].sort((left, right) => left.order - right.order),
    }));
    const matchIndexById = new Map<string, { roundIndex: number; matchIndex: number }>();

    sortedRounds.forEach((round, roundIndex) => {
        round.matches.forEach((match, matchIndex) => {
            matchIndexById.set(match.id, {
                roundIndex,
                matchIndex,
            });
        });
    });

    const edges: TournamentBracketConnectorEdge[] = [];
    sortedRounds.forEach((round, targetRoundIndex) => {
        round.matches.forEach((match, targetMatchIndex) => {
            const sourceMatches = getSourceMatchIds(sortedRounds, match);
            sourceMatches.forEach((sourceMatchId) => {
                const sourceIndex = matchIndexById.get(sourceMatchId);
                if (!sourceIndex || sourceIndex.roundIndex >= targetRoundIndex) {
                    return;
                }

                edges.push({
                    sourceRoundIndex: sourceIndex.roundIndex,
                    sourceMatchIndex: sourceIndex.matchIndex,
                    targetRoundIndex,
                    targetMatchIndex,
                });
            });
        });
    });

    return edges;
}
