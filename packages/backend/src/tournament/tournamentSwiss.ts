import type {
    TournamentMatch,
    TournamentMatchSlot,
    TournamentParticipant,
    TournamentSeriesSettings,
    TournamentStanding,
} from '@ih3t/shared';

type SeededSwissParticipant = TournamentParticipant & {
    seed: number;
};

type StandingEntry = {
    participant: TournamentParticipant;
    matchPoints: number;
    wins: number;
    losses: number;
    buchholz: number;
    sonnebornBerger: number;
    hadBye: boolean;
    rank: number;
};

function createSwissSlot(participant: SeededSwissParticipant | null): TournamentMatchSlot {
    if (!participant) {
        return {
            source: null,
            profileId: null,
            displayName: `BYE`,
            image: null,
            seed: null,
            isBye: true,
        };
    }

    return {
        source: null,
        profileId: participant.profileId,
        displayName: participant.displayName,
        image: participant.image,
        seed: participant.seed,
        isBye: false,
    };
}

function createSwissMatch(
    round: number,
    order: number,
    bestOf: 1 | 3 | 5 | 7,
    slots: [TournamentMatchSlot, TournamentMatchSlot],
): TournamentMatch {
    return {
        id: `match-swiss-${round}-${order}`,
        bracket: `swiss`,
        round,
        order,
        state: `pending`,
        bestOf,
        slots,
        leftWins: 0,
        rightWins: 0,
        gameIds: [],
        sessionId: null,
        winnerProfileId: null,
        loserProfileId: null,
        resultType: null,
        currentGameNumber: 1,
        startedAt: null,
        resolvedAt: null,
        advanceWinnerTo: null,
        advanceLoserTo: null,
    };
}

function getPairingKey(leftProfileId: string, rightProfileId: string) {
    return [leftProfileId, rightProfileId].sort()
        .join(`:`);
}

function buildPlayedPairings(matches: TournamentMatch[]): Set<string> {
    const playedPairings = new Set<string>();
    for (const match of matches) {
        if (match.bracket !== `swiss` || match.state !== `completed`) {
            continue;
        }

        const [leftProfileId, rightProfileId] = match.slots.map((slot) => slot.profileId);
        if (!leftProfileId || !rightProfileId) {
            continue;
        }

        playedPairings.add(getPairingKey(leftProfileId, rightProfileId));
    }

    return playedPairings;
}

function pairParticipants(
    participants: SeededSwissParticipant[],
    playedPairings: Set<string>,
): [SeededSwissParticipant, SeededSwissParticipant][] | null {
    if (participants.length === 0) {
        return [];
    }

    const [firstParticipant, ...remainingParticipants] = participants;
    const sortedCandidates = remainingParticipants
        .map((participant, index) => ({
            participant,
            index,
        }))
        .sort((left, right) =>
            Math.abs((left.participant.seed ?? 0) - (firstParticipant.seed ?? 0))
            - Math.abs((right.participant.seed ?? 0) - (firstParticipant.seed ?? 0))
            || (left.participant.seed ?? Number.MAX_SAFE_INTEGER) - (right.participant.seed ?? Number.MAX_SAFE_INTEGER));

    for (const candidate of sortedCandidates) {
        if (playedPairings.has(getPairingKey(firstParticipant.profileId, candidate.participant.profileId))) {
            continue;
        }

        const nextParticipants = remainingParticipants.filter((_, index) => index !== candidate.index);
        const remainingPairings = pairParticipants(nextParticipants, playedPairings);
        if (!remainingPairings) {
            continue;
        }

        return [
            [firstParticipant, candidate.participant],
            ...remainingPairings,
        ];
    }

    return null;
}

export function calculateSwissStandings(
    participants: TournamentParticipant[],
    matches: TournamentMatch[],
): TournamentStanding[] {
    const activeParticipants = participants.filter((participant) => participant.status !== `removed` && participant.status !== `dropped`);
    const statsByProfileId = new Map<string, {
        participant: TournamentParticipant;
        wins: number;
        losses: number;
        opponents: string[];
        defeatedOpponents: string[];
        hadBye: boolean;
    }>(activeParticipants.map((participant) => [
        participant.profileId,
        {
            participant,
            wins: 0,
            losses: 0,
            opponents: [],
            defeatedOpponents: [],
            hadBye: false,
        },
    ]));

    for (const match of matches) {
        if (match.bracket !== `swiss` || match.state !== `completed`) {
            continue;
        }

        const slotProfileIds = match.slots.map((slot) => slot.profileId).filter((profileId): profileId is string => Boolean(profileId));
        if (slotProfileIds.length === 2) {
            const [leftProfileId, rightProfileId] = slotProfileIds;
            statsByProfileId.get(leftProfileId)?.opponents.push(rightProfileId);
            statsByProfileId.get(rightProfileId)?.opponents.push(leftProfileId);
        }

        if (match.resultType === `bye` && match.winnerProfileId) {
            const stats = statsByProfileId.get(match.winnerProfileId);
            if (stats) {
                stats.hadBye = true;
            }
        }

        if (match.winnerProfileId) {
            const winnerStats = statsByProfileId.get(match.winnerProfileId);
            if (winnerStats) {
                winnerStats.wins += 1;
                if (match.loserProfileId) {
                    winnerStats.defeatedOpponents.push(match.loserProfileId);
                }
            }
        }

        if (match.loserProfileId) {
            const loserStats = statsByProfileId.get(match.loserProfileId);
            if (loserStats) {
                loserStats.losses += 1;
            }
        }
    }

    const standings = activeParticipants.map((participant) => {
        const stats = statsByProfileId.get(participant.profileId);
        const wins = stats?.wins ?? 0;
        const losses = stats?.losses ?? 0;
        const opponents = stats?.opponents ?? [];
        const defeatedOpponents = stats?.defeatedOpponents ?? [];

        const buchholz = opponents.reduce((sum, opponentProfileId) =>
            sum + (statsByProfileId.get(opponentProfileId)?.wins ?? 0), 0);
        const sonnebornBerger = defeatedOpponents.reduce((sum, opponentProfileId) =>
            sum + (statsByProfileId.get(opponentProfileId)?.wins ?? 0), 0);

        return {
            participant,
            matchPoints: wins,
            wins,
            losses,
            buchholz,
            sonnebornBerger,
            hadBye: stats?.hadBye ?? false,
            rank: 0,
        } satisfies StandingEntry;
    }).sort((left, right) =>
        right.matchPoints - left.matchPoints
        || right.buchholz - left.buchholz
        || right.sonnebornBerger - left.sonnebornBerger
        || right.wins - left.wins
        || (left.participant.seed ?? Number.MAX_SAFE_INTEGER) - (right.participant.seed ?? Number.MAX_SAFE_INTEGER)
        || left.participant.registeredAt - right.participant.registeredAt
        || left.participant.displayName.localeCompare(right.participant.displayName));

    return standings.map((entry, index) => ({
        rank: index + 1,
        profileId: entry.participant.profileId,
        displayName: entry.participant.displayName,
        image: entry.participant.image,
        matchPoints: entry.matchPoints,
        wins: entry.wins,
        losses: entry.losses,
        buchholz: entry.buchholz,
        sonnebornBerger: entry.sonnebornBerger,
        hadBye: entry.hadBye,
    }));
}

export function buildSwissRoundMatches(options: {
    participants: SeededSwissParticipant[];
    existingMatches: TournamentMatch[];
    round: number;
    totalRounds: number;
    seriesSettings: TournamentSeriesSettings;
}): TournamentMatch[] {
    const standings = calculateSwissStandings(options.participants, options.existingMatches);
    const standingByProfileId = new Map(standings.map((standing) => [standing.profileId, standing] as const));
    const playedPairings = buildPlayedPairings(options.existingMatches);

    const orderedParticipants = [...options.participants].sort((left, right) => {
        if (options.round === 1) {
            return left.seed - right.seed;
        }

        const leftStanding = standingByProfileId.get(left.profileId);
        const rightStanding = standingByProfileId.get(right.profileId);
        return (leftStanding?.rank ?? Number.MAX_SAFE_INTEGER) - (rightStanding?.rank ?? Number.MAX_SAFE_INTEGER)
            || left.seed - right.seed;
    });

    const byeEligibleParticipantIndex = orderedParticipants.length % 2 === 1
        ? (() => {
            for (let index = orderedParticipants.length - 1; index >= 0; index -= 1) {
                const participant = orderedParticipants[index];
                const standing = standingByProfileId.get(participant.profileId);
                if (!standing?.hadBye) {
                    return index;
                }
            }

            return orderedParticipants.length - 1;
        })()
        : -1;

    const participantsForPairing = byeEligibleParticipantIndex >= 0
        ? orderedParticipants.filter((_, index) => index !== byeEligibleParticipantIndex)
        : orderedParticipants;
    const byeParticipant = byeEligibleParticipantIndex >= 0
        ? orderedParticipants[byeEligibleParticipantIndex] ?? null
        : null;

    const pairings = pairParticipants(participantsForPairing, playedPairings);
    if (!pairings) {
        const relaxedPairings = pairParticipants(participantsForPairing, new Set());
        if (!relaxedPairings) {
            return [];
        }

        return relaxedPairings.map(([leftParticipant, rightParticipant], index) => createSwissMatch(
            options.round,
            index + 1,
            options.round >= options.totalRounds
                ? options.seriesSettings.finalsBestOf
                : options.seriesSettings.earlyRoundsBestOf,
            [
                createSwissSlot(leftParticipant),
                createSwissSlot(rightParticipant),
            ],
        )).concat(byeParticipant ? [createSwissMatch(
            options.round,
            relaxedPairings.length + 1,
            options.round >= options.totalRounds
                ? options.seriesSettings.finalsBestOf
                : options.seriesSettings.earlyRoundsBestOf,
            [
                createSwissSlot(byeParticipant),
                createSwissSlot(null),
            ],
        )] : []);
    }

    const bestOf = options.round >= options.totalRounds
        ? options.seriesSettings.finalsBestOf
        : options.seriesSettings.earlyRoundsBestOf;

    const matches = pairings.map(([leftParticipant, rightParticipant], index) => createSwissMatch(
        options.round,
        index + 1,
        bestOf,
        [
            createSwissSlot(leftParticipant),
            createSwissSlot(rightParticipant),
        ],
    ));

    if (byeParticipant) {
        matches.push(createSwissMatch(
            options.round,
            matches.length + 1,
            bestOf,
            [
                createSwissSlot(byeParticipant),
                createSwissSlot(null),
            ],
        ));
    }

    return matches;
}
