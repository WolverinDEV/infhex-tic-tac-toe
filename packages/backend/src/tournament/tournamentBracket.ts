import type {
    TournamentBracket,
    TournamentBracketSize,
    TournamentMatch,
    TournamentMatchSlot,
    TournamentSeriesSettings,
} from '@ih3t/shared';

type SeededTournamentParticipant = {
    profileId: string;
    displayName: string;
    image: string | null;
    seed: number;
};

type RoundMatch = {
    id: string;
    bracket: TournamentBracket;
    round: number;
    order: number;
};

export function buildSeedOrder(bracketSize: TournamentBracketSize): number[] {
    let order = [
        1, 2,
    ];

    while (order.length < bracketSize) {
        const nextBracketSize = order.length * 2;
        order = order.flatMap((seed) => [
            seed,
            nextBracketSize + 1 - seed,
        ]);
    }

    return order;
}

function createByeSlot(seed: number): TournamentMatchSlot {
    return {
        source: {
            type: `seed`,
            seed,
        },
        profileId: null,
        displayName: `BYE`,
        image: null,
        seed,
        isBye: true,
    };
}

function createSeedSlot(participant: SeededTournamentParticipant | null, seed: number): TournamentMatchSlot {
    if (!participant) {
        return createByeSlot(seed);
    }

    return {
        source: {
            type: `seed`,
            seed,
        },
        profileId: participant.profileId,
        displayName: participant.displayName,
        image: participant.image,
        seed,
        isBye: false,
    };
}

function createEmptySourceSlot(source: TournamentMatchSlot[`source`]): TournamentMatchSlot {
    return {
        source,
        profileId: null,
        displayName: null,
        image: null,
        seed: null,
        isBye: false,
    };
}

function createMatch(
    bracket: TournamentBracket,
    round: number,
    order: number,
    bestOf: 1 | 3 | 5 | 7,
    slots: [TournamentMatchSlot, TournamentMatchSlot],
): TournamentMatch {
    return {
        id: `match-${bracket}-${round}-${order}`,
        bracket,
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

function getBestOf(
    bracket: TournamentBracket,
    round: number,
    winnerRoundCount: number,
    loserRoundCount: number,
    seriesSettings: TournamentSeriesSettings,
): 1 | 3 | 5 | 7 {
    if (bracket === `grand-final` || bracket === `grand-final-reset`) {
        return seriesSettings.grandFinalBestOf;
    }

    const isWinnerFinal = bracket === `winners` && round === winnerRoundCount;
    const isLoserFinal = bracket === `losers` && round === loserRoundCount;
    if (isWinnerFinal || isLoserFinal) {
        return seriesSettings.finalsBestOf;
    }

    return seriesSettings.earlyRoundsBestOf;
}

function indexMatches(matches: TournamentMatch[]) {
    return new Map(matches.map((match) => [match.id, match] as const));
}

export function buildSingleEliminationMatches(
    participants: SeededTournamentParticipant[],
    bracketSize: TournamentBracketSize,
    seriesSettings: TournamentSeriesSettings,
    thirdPlaceMatchEnabled = false,
): TournamentMatch[] {
    const matches: TournamentMatch[] = [];
    const participantBySeed = new Map(participants.map((p) => [p.seed, p] as const));
    const roundCount = Math.log2(bracketSize);
    const rounds: RoundMatch[][] = [];

    const seedOrder = buildSeedOrder(bracketSize);
    const roundOneMatches: RoundMatch[] = [];
    for (let i = 0; i < bracketSize / 2; i += 1) {
        const leftSeed = seedOrder[i * 2]!;
        const rightSeed = seedOrder[i * 2 + 1]!;
        const bo = i === 0 && roundCount === 1 ? seriesSettings.finalsBestOf : seriesSettings.earlyRoundsBestOf;
        const match = createMatch(
            `winners`, 1, i + 1, bo,
            [createSeedSlot(participantBySeed.get(leftSeed) ?? null, leftSeed), createSeedSlot(participantBySeed.get(rightSeed) ?? null, rightSeed)],
        );
        matches.push(match);
        roundOneMatches.push(match);
    }
    rounds.push(roundOneMatches);

    for (let round = 2; round <= roundCount; round += 1) {
        const prev = rounds[round - 2]!;
        const current: RoundMatch[] = [];
        const bo = round === roundCount ? seriesSettings.finalsBestOf : seriesSettings.earlyRoundsBestOf;
        for (let i = 0; i < prev.length / 2; i += 1) {
            const match = createMatch(
                `winners`, round, i + 1, bo,
                [
                    createEmptySourceSlot({ type: `winner`, matchId: prev[i * 2]!.id }),
                    createEmptySourceSlot({ type: `winner`, matchId: prev[i * 2 + 1]!.id }),
                ],
            );
            matches.push(match);
            current.push(match);
        }
        rounds.push(current);
    }

    // Wire advanceWinnerTo
    const matchById = indexMatches(matches);
    for (let ri = 0; ri < rounds.length - 1; ri += 1) {
        const curr = rounds[ri]!;
        const next = rounds[ri + 1]!;
        for (let mi = 0; mi < curr.length; mi += 1) {
            matchById.get(curr[mi]!.id)!.advanceWinnerTo = {
                matchId: next[Math.floor(mi / 2)]!.id,
                slotIndex: (mi % 2) as 0 | 1,
            };
        }
    }

    // Third-place match: semifinal losers play for 3rd/4th
    if (thirdPlaceMatchEnabled && roundCount >= 2) {
        const semiFinalRound = rounds[roundCount - 2]!;
        const thirdPlaceMatch = createMatch(
            `third-place`, roundCount, 1, seriesSettings.finalsBestOf,
            [
                createEmptySourceSlot({ type: `loser`, matchId: semiFinalRound[0]!.id }),
                createEmptySourceSlot({ type: `loser`, matchId: semiFinalRound[1]!.id }),
            ],
        );
        matches.push(thirdPlaceMatch);

        // Wire advanceLoserTo on semifinal matches
        matchById.get(semiFinalRound[0]!.id)!.advanceLoserTo = {
            matchId: thirdPlaceMatch.id,
            slotIndex: 0,
        };
        matchById.get(semiFinalRound[1]!.id)!.advanceLoserTo = {
            matchId: thirdPlaceMatch.id,
            slotIndex: 1,
        };
    }

    return matches;
}

export function buildDoubleEliminationMatches(
    participants: SeededTournamentParticipant[],
    bracketSize: TournamentBracketSize,
    seriesSettings: TournamentSeriesSettings,
): TournamentMatch[] {
    const matches: TournamentMatch[] = [];
    const participantBySeed = new Map(participants.map((participant) => [participant.seed, participant] as const));
    const winnerRoundCount = Math.log2(bracketSize);
    const loserRoundCount = Math.max(0, (winnerRoundCount - 1) * 2);

    const winnerRounds: RoundMatch[][] = [];
    const loserRounds: RoundMatch[][] = [];

    const seedOrder = buildSeedOrder(bracketSize);
    const roundOneWinnerMatches: RoundMatch[] = [];
    for (let matchIndex = 0; matchIndex < bracketSize / 2; matchIndex += 1) {
        const leftSeed = seedOrder[matchIndex * 2]!;
        const rightSeed = seedOrder[matchIndex * 2 + 1]!;
        const leftSlot = createSeedSlot(participantBySeed.get(leftSeed) ?? null, leftSeed);
        const rightSlot = createSeedSlot(participantBySeed.get(rightSeed) ?? null, rightSeed);
        const match = createMatch(
            `winners`,
            1,
            matchIndex + 1,
            getBestOf(`winners`, 1, winnerRoundCount, loserRoundCount, seriesSettings),
            [leftSlot, rightSlot],
        );

        matches.push(match);
        roundOneWinnerMatches.push(match);
    }
    winnerRounds.push(roundOneWinnerMatches);

    for (let winnerRound = 2; winnerRound <= winnerRoundCount; winnerRound += 1) {
        const previousRound = winnerRounds[winnerRound - 2]!;
        const currentRound: RoundMatch[] = [];
        for (let matchIndex = 0; matchIndex < previousRound.length / 2; matchIndex += 1) {
            const leftSource = previousRound[matchIndex * 2]!;
            const rightSource = previousRound[matchIndex * 2 + 1]!;
            const match = createMatch(
                `winners`,
                winnerRound,
                matchIndex + 1,
                getBestOf(`winners`, winnerRound, winnerRoundCount, loserRoundCount, seriesSettings),
                [
                    createEmptySourceSlot({
                        type: `winner`,
                        matchId: leftSource.id,
                    }),
                    createEmptySourceSlot({
                        type: `winner`,
                        matchId: rightSource.id,
                    }),
                ],
            );

            matches.push(match);
            currentRound.push(match);
        }

        winnerRounds.push(currentRound);
    }

    for (let loserRound = 1; loserRound <= loserRoundCount; loserRound += 1) {
        const currentRound: RoundMatch[] = [];
        if (loserRound === 1) {
            const sourceRound = winnerRounds[0] ?? [];
            for (let matchIndex = 0; matchIndex < sourceRound.length / 2; matchIndex += 1) {
                const leftSource = sourceRound[matchIndex * 2]!;
                const rightSource = sourceRound[matchIndex * 2 + 1]!;
                const match = createMatch(
                    `losers`,
                    loserRound,
                    matchIndex + 1,
                    getBestOf(`losers`, loserRound, winnerRoundCount, loserRoundCount, seriesSettings),
                    [
                        createEmptySourceSlot({
                            type: `loser`,
                            matchId: leftSource.id,
                        }),
                        createEmptySourceSlot({
                            type: `loser`,
                            matchId: rightSource.id,
                        }),
                    ],
                );

                matches.push(match);
                currentRound.push(match);
            }
        } else if (loserRound % 2 === 1) {
            const previousRound = loserRounds[loserRound - 2] ?? [];
            for (let matchIndex = 0; matchIndex < previousRound.length / 2; matchIndex += 1) {
                const leftSource = previousRound[matchIndex * 2]!;
                const rightSource = previousRound[matchIndex * 2 + 1]!;
                const match = createMatch(
                    `losers`,
                    loserRound,
                    matchIndex + 1,
                    getBestOf(`losers`, loserRound, winnerRoundCount, loserRoundCount, seriesSettings),
                    [
                        createEmptySourceSlot({
                            type: `winner`,
                            matchId: leftSource.id,
                        }),
                        createEmptySourceSlot({
                            type: `winner`,
                            matchId: rightSource.id,
                        }),
                    ],
                );

                matches.push(match);
                currentRound.push(match);
            }
        } else {
            const previousLoserRound = loserRounds[loserRound - 2] ?? [];
            const sourceWinnerRound = winnerRounds[(loserRound / 2)] ?? [];
            for (let matchIndex = 0; matchIndex < sourceWinnerRound.length; matchIndex += 1) {
                const loserSource = sourceWinnerRound[matchIndex]!;
                const previousWinner = previousLoserRound[matchIndex]!;
                const match = createMatch(
                    `losers`,
                    loserRound,
                    matchIndex + 1,
                    getBestOf(`losers`, loserRound, winnerRoundCount, loserRoundCount, seriesSettings),
                    [
                        createEmptySourceSlot({
                            type: `winner`,
                            matchId: previousWinner.id,
                        }),
                        createEmptySourceSlot({
                            type: `loser`,
                            matchId: loserSource.id,
                        }),
                    ],
                );

                matches.push(match);
                currentRound.push(match);
            }
        }

        loserRounds.push(currentRound);
    }

    const winnerFinal = winnerRounds[winnerRounds.length - 1]?.[0];
    const loserFinal = loserRounds[loserRounds.length - 1]?.[0] ?? null;
    if (!winnerFinal || !loserFinal) {
        throw new Error(`Double-elimination brackets require at least four entrants.`);
    }

    matches.push(createMatch(
        `grand-final`,
        1,
        1,
        getBestOf(`grand-final`, 1, winnerRoundCount, loserRoundCount, seriesSettings),
        [
            createEmptySourceSlot({
                type: `winner`,
                matchId: winnerFinal.id,
            }),
            createEmptySourceSlot({
                type: `winner`,
                matchId: loserFinal.id,
            }),
        ],
    ));

    const matchById = indexMatches(matches);

    for (let roundIndex = 0; roundIndex < winnerRounds.length - 1; roundIndex += 1) {
        const currentRound = winnerRounds[roundIndex]!;
        const nextRound = winnerRounds[roundIndex + 1]!;
        for (let matchIndex = 0; matchIndex < currentRound.length; matchIndex += 1) {
            const match = matchById.get(currentRound[matchIndex]!.id)!;
            match.advanceWinnerTo = {
                matchId: nextRound[Math.floor(matchIndex / 2)]!.id,
                slotIndex: (matchIndex % 2) as 0 | 1,
            };
        }
    }

    for (let matchIndex = 0; matchIndex < winnerRounds[0]!.length; matchIndex += 1) {
        const match = matchById.get(winnerRounds[0]![matchIndex]!.id)!;
        match.advanceLoserTo = {
            matchId: loserRounds[0]![Math.floor(matchIndex / 2)]!.id,
            slotIndex: (matchIndex % 2) as 0 | 1,
        };
    }

    for (let winnerRound = 2; winnerRound <= winnerRounds.length; winnerRound += 1) {
        const sourceRound = winnerRounds[winnerRound - 1]!;
        const targetRound = loserRounds[(winnerRound - 1) * 2 - 1];
        if (!targetRound) {
            continue;
        }

        for (let matchIndex = 0; matchIndex < sourceRound.length; matchIndex += 1) {
            const match = matchById.get(sourceRound[matchIndex]!.id)!;
            match.advanceLoserTo = {
                matchId: targetRound[matchIndex]!.id,
                slotIndex: 1,
            };
        }
    }

    for (let loserRoundIndex = 0; loserRoundIndex < loserRounds.length; loserRoundIndex += 1) {
        const currentRound = loserRounds[loserRoundIndex]!;
        const displayRound = loserRoundIndex + 1;
        const isOddRound = displayRound % 2 === 1;
        const nextRound = loserRounds[loserRoundIndex + 1] ?? null;
        for (let matchIndex = 0; matchIndex < currentRound.length; matchIndex += 1) {
            const match = matchById.get(currentRound[matchIndex]!.id)!;
            if (!nextRound) {
                match.advanceWinnerTo = {
                    matchId: `match-grand-final-1-1`,
                    slotIndex: 1,
                };
                continue;
            }

            if (isOddRound) {
                match.advanceWinnerTo = {
                    matchId: nextRound[matchIndex]!.id,
                    slotIndex: 0,
                };
            } else {
                match.advanceWinnerTo = {
                    matchId: nextRound[Math.floor(matchIndex / 2)]!.id,
                    slotIndex: (matchIndex % 2) as 0 | 1,
                };
            }
        }
    }

    matchById.get(winnerFinal.id)!.advanceWinnerTo = {
        matchId: `match-grand-final-1-1`,
        slotIndex: 0,
    };

    return matches;
}
