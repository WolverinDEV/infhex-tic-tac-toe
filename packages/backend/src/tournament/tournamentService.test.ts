import 'reflect-metadata';

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
    TournamentMatch,
    TournamentMatchSlot,
    TournamentParticipant,
} from '@ih3t/shared';

import type { AccountUserProfile } from '../auth/authRepository';
import { SessionError } from '../session/sessionManager';
import type { TournamentRecord } from './tournamentRepository';
import { TournamentService } from './tournamentService';

function createParticipant(overrides: Partial<TournamentParticipant> & Pick<TournamentParticipant, `profileId` | `displayName`>): TournamentParticipant {
    return {
        profileId: overrides.profileId,
        displayName: overrides.displayName,
        image: overrides.image ?? null,
        registeredAt: overrides.registeredAt ?? 1,
        checkedInAt: overrides.checkedInAt ?? null,
        seed: overrides.seed ?? null,
        status: overrides.status ?? `registered`,
        checkInState: overrides.checkInState ?? `not-open`,
        isManual: overrides.isManual ?? false,
        removedAt: overrides.removedAt ?? null,
        eliminatedAt: overrides.eliminatedAt ?? null,
        replacedByProfileId: overrides.replacedByProfileId ?? null,
        replacesProfileId: overrides.replacesProfileId ?? null,
    };
}

function createSlot(overrides: Partial<TournamentMatchSlot> = {}): TournamentMatchSlot {
    return {
        source: overrides.source ?? null,
        profileId: overrides.profileId ?? null,
        displayName: overrides.displayName ?? null,
        image: overrides.image ?? null,
        seed: overrides.seed ?? null,
        isBye: overrides.isBye ?? false,
    };
}

function createMatch(overrides: Partial<TournamentMatch> & Pick<TournamentMatch, `id` | `bracket` | `round` | `order`>): TournamentMatch {
    return {
        id: overrides.id,
        bracket: overrides.bracket,
        round: overrides.round,
        order: overrides.order,
        state: overrides.state ?? `pending`,
        bestOf: overrides.bestOf ?? 1,
        slots: overrides.slots ?? [createSlot(), createSlot()],
        leftWins: overrides.leftWins ?? 0,
        rightWins: overrides.rightWins ?? 0,
        gameIds: overrides.gameIds ?? [],
        sessionId: overrides.sessionId ?? null,
        winnerProfileId: overrides.winnerProfileId ?? null,
        loserProfileId: overrides.loserProfileId ?? null,
        resultType: overrides.resultType ?? null,
        currentGameNumber: overrides.currentGameNumber ?? 1,
        startedAt: overrides.startedAt ?? null,
        resolvedAt: overrides.resolvedAt ?? null,
        advanceWinnerTo: overrides.advanceWinnerTo ?? null,
        advanceLoserTo: overrides.advanceLoserTo ?? null,
    };
}

function createTournament(overrides: Partial<TournamentRecord> = {}): TournamentRecord {
    return {
        version: 1,
        id: overrides.id ?? `tournament-1`,
        name: overrides.name ?? `Tournament Test`,
        description: overrides.description ?? null,
        kind: overrides.kind ?? `community`,
        format: overrides.format ?? `single-elimination`,
        visibility: overrides.visibility ?? `public`,
        status: overrides.status ?? `registration-open`,
        isPublished: overrides.isPublished ?? true,
        scheduledStartAt: overrides.scheduledStartAt ?? Date.now() + 60_000,
        checkInWindowMinutes: overrides.checkInWindowMinutes ?? 15,
        checkInOpensAt: overrides.checkInOpensAt ?? Date.now() - 60_000,
        checkInClosesAt: overrides.checkInClosesAt ?? Date.now() + 60_000,
        maxPlayers: overrides.maxPlayers ?? 4,
        swissRoundCount: overrides.swissRoundCount ?? null,
        createdAt: overrides.createdAt ?? 1,
        updatedAt: overrides.updatedAt ?? 1,
        startedAt: overrides.startedAt ?? null,
        completedAt: overrides.completedAt ?? null,
        cancelledAt: overrides.cancelledAt ?? null,
        createdByProfileId: overrides.createdByProfileId ?? `organizer-1`,
        createdByDisplayName: overrides.createdByDisplayName ?? `Organizer`,
        timeControl: overrides.timeControl ?? { mode: `unlimited` },
        seriesSettings: overrides.seriesSettings ?? {
            earlyRoundsBestOf: 1,
            finalsBestOf: 1,
            grandFinalBestOf: 1,
            grandFinalResetEnabled: false,
        },
        matchJoinTimeoutMinutes: overrides.matchJoinTimeoutMinutes ?? 5,
        matchExtensionMinutes: overrides.matchExtensionMinutes ?? overrides.matchJoinTimeoutMinutes ?? 5,
        lateRegistrationEnabled: overrides.lateRegistrationEnabled ?? false,
        thirdPlaceMatchEnabled: overrides.thirdPlaceMatchEnabled ?? false,
        roundDelayMinutes: overrides.roundDelayMinutes ?? 0,
        waitlistEnabled: overrides.waitlistEnabled ?? false,
        waitlistCheckInMinutes: overrides.waitlistCheckInMinutes ?? 5,
        waitlistOpensAt: overrides.waitlistOpensAt ?? null,
        waitlistClosesAt: overrides.waitlistClosesAt ?? null,
        participants: overrides.participants ? structuredClone(overrides.participants) : [],
        matches: overrides.matches ? structuredClone(overrides.matches) : [],
        activity: overrides.activity ? structuredClone(overrides.activity) : [],
        extensionRequests: overrides.extensionRequests ? structuredClone(overrides.extensionRequests) : [],
        subscriberProfileIds: overrides.subscriberProfileIds ? [...overrides.subscriberProfileIds] : [],
        organizers: overrides.organizers ? [...overrides.organizers] : [],
        whitelist: overrides.whitelist ? structuredClone(overrides.whitelist) : [],
        blacklist: overrides.blacklist ? structuredClone(overrides.blacklist) : [],
    };
}

class FakeTournamentRepository {
    private readonly tournaments = new Map<string, TournamentRecord>();

    constructor(initialTournament?: TournamentRecord) {
        if (initialTournament) {
            this.saveSync(initialTournament);
        }
    }

    saveSync(tournament: TournamentRecord) {
        this.tournaments.set(tournament.id, structuredClone(tournament));
    }

    getSync(tournamentId: string): TournamentRecord {
        const tournament = this.tournaments.get(tournamentId);
        assert.ok(tournament, `Tournament ${tournamentId} not found in fake repository.`);
        return structuredClone(tournament);
    }

    async createTournament(tournament: TournamentRecord): Promise<void> {
        this.saveSync(tournament);
    }

    async saveTournament(tournament: TournamentRecord): Promise<void> {
        this.saveSync(tournament);
    }

    async getTournament(tournamentId: string): Promise<TournamentRecord | null> {
        const tournament = this.tournaments.get(tournamentId);
        return tournament ? structuredClone(tournament) : null;
    }

    async listReconciliableTournaments(): Promise<TournamentRecord[]> {
        return [...this.tournaments.values()].map((tournament) => structuredClone(tournament));
    }

    async addSubscriber(): Promise<void> { }

    async removeSubscriber(): Promise<void> { }
}

type FakeSession = {
    id: string;
    players: Array<{
        id: string;
        profileId: string | null;
        connection: { status: `connected` | `disconnected` };
    }>;
    state: {
        status: `lobby` | `in-game` | `finished`;
        gameId?: string;
        winningPlayerId?: string | null;
    };
    tournament: Record<string, unknown> | null;
};

class FakeSessionManager {
    readonly sessions = new Map<string, FakeSession>();
    private nextSessionId = 1;

    createSession(params: {
        reservedPlayerProfileIds?: string[];
        tournament?: Record<string, unknown> | null;
    }): { sessionId: string } {
        const sessionId = `session-${this.nextSessionId++}`;
        const players = (params.reservedPlayerProfileIds ?? []).map((profileId, index) => ({
            id: `${sessionId}-player-${index + 1}`,
            profileId,
            connection: { status: `connected` as const },
        }));
        this.sessions.set(sessionId, {
            id: sessionId,
            players,
            state: { status: `lobby` },
            tournament: params.tournament ?? null,
        });
        return { sessionId };
    }

    getSessionInfo(sessionId: string): FakeSession | null {
        return this.sessions.get(sessionId) ?? null;
    }

    updateSessionTournamentInfo(sessionId: string, update: Record<string, unknown>) {
        const session = this.sessions.get(sessionId);
        if (session?.tournament) {
            Object.assign(session.tournament, update);
        }
    }
}

class FakeGameHistoryRepository {
    async getFinishedGame(): Promise<null> {
        return null;
    }

    async getFinishedGameBySessionId(): Promise<null> {
        return null;
    }
}

class FakeTournamentEventSink {
    readonly tournamentNotifications: Array<{ profileId: string; kind: string }> = [];

    tournamentUpdated(): void { }

    tournamentNotification(profileId: string, event: { kind: string }): void {
        this.tournamentNotifications.push({ profileId, kind: event.kind });
    }

    sessionClaimWin(): void { }

    sessionUpdated(): void { }
}

function createAccountUser(overrides: Partial<AccountUserProfile> & Pick<AccountUserProfile, `id` | `username`>): AccountUserProfile {
    return {
        id: overrides.id,
        username: overrides.username,
        email: overrides.email ?? null,
        image: overrides.image ?? null,
        role: overrides.role ?? `user`,
        permissions: overrides.permissions ?? [],
        registeredAt: overrides.registeredAt ?? 1,
        lastActiveAt: overrides.lastActiveAt ?? 1,
    };
}

function createService(initialTournament: TournamentRecord) {
    const repository = new FakeTournamentRepository(initialTournament);
    const sessionManager = new FakeSessionManager();
    const eventSink = new FakeTournamentEventSink();
    const service = new TournamentService(
        repository as never,
        {} as never,
        sessionManager as never,
        new FakeGameHistoryRepository() as never,
    );
    service.setEventHandlers(eventSink);

    return {
        repository,
        sessionManager,
        eventSink,
        service,
    };
}

test(`registerCurrentUser reuses a dropped participant record instead of creating duplicates`, async () => {
    const user = createAccountUser({ id: `player-1`, username: `Player One` });
    const tournament = createTournament({
        status: `registration-open`,
        participants: [
            createParticipant({
                profileId: user.id,
                displayName: `Old Name`,
                status: `dropped`,
                removedAt: 123,
                checkInState: `missed`,
                registeredAt: 5,
            }),
        ],
    });
    const { service } = createService(tournament);

    const detail = await service.registerCurrentUser(tournament.id, user);
    const matchingParticipants = detail.participants.filter((participant) => participant.profileId === user.id);

    assert.equal(matchingParticipants.length, 1);
    assert.equal(matchingParticipants[0]?.displayName, user.username);
    assert.equal(matchingParticipants[0]?.status, `registered`);
    assert.equal(matchingParticipants[0]?.removedAt, null);
    assert.equal(matchingParticipants[0]?.checkInState, `not-open`);
});

test(`awardWalkover rejects winners that are not assigned to the match`, async () => {
    const organizer = createAccountUser({ id: `organizer-1`, username: `Organizer` });
    const tournament = createTournament({
        status: `live`,
        format: `swiss`,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, status: `checked-in`, checkedInAt: 1, checkInState: `checked-in`, seed: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, status: `checked-in`, checkedInAt: 2, checkInState: `checked-in`, seed: 2 }),
        ],
        matches: [
            createMatch({
                id: `match-swiss-1-1`,
                bracket: `swiss`,
                round: 1,
                order: 1,
                state: `ready`,
                slots: [
                    createSlot({ profileId: `player-1`, displayName: `Player 1`, seed: 1 }),
                    createSlot({ profileId: `player-2`, displayName: `Player 2`, seed: 2 }),
                ],
            }),
        ],
    });
    const { service, repository } = createService(tournament);

    await assert.rejects(
        () => service.awardWalkover(tournament.id, `match-swiss-1-1`, `intruder`, organizer),
        SessionError,
    );

    const stored = repository.getSync(tournament.id);
    assert.equal(stored.matches[0]?.winnerProfileId, null);
    assert.equal(stored.matches[0]?.state, `ready`);
});

test(`reopenMatch rejects pending matches that do not have an active session to reopen`, async () => {
    const organizer = createAccountUser({ id: `organizer-1`, username: `Organizer` });
    const tournament = createTournament({
        status: `live`,
        format: `single-elimination`,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, status: `checked-in`, checkedInAt: 1, checkInState: `checked-in`, seed: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, status: `checked-in`, checkedInAt: 2, checkInState: `checked-in`, seed: 2 }),
        ],
        matches: [
            createMatch({
                id: `match-winners-2-1`,
                bracket: `winners`,
                round: 2,
                order: 1,
                state: `pending`,
                slots: [
                    createSlot({ source: { type: `winner`, matchId: `match-winners-1-1` } }),
                    createSlot({ source: { type: `winner`, matchId: `match-winners-1-2` } }),
                ],
            }),
        ],
    });
    const { service, repository } = createService(tournament);

    await assert.rejects(
        () => service.reopenMatch(tournament.id, `match-winners-2-1`, organizer),
        SessionError,
    );

    const stored = repository.getSync(tournament.id);
    assert.equal(stored.matches[0]?.state, `pending`);
    assert.equal(stored.matches[0]?.sessionId, null);
});

test(`single-elimination completion keeps the champion completed`, async () => {
    const organizer = createAccountUser({ id: `organizer-1`, username: `Organizer` });
    const participants = [
        createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 11, status: `checked-in`, checkInState: `checked-in` }),
        createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 12, status: `checked-in`, checkInState: `checked-in` }),
        createParticipant({ profileId: `player-3`, displayName: `Player 3`, registeredAt: 3, checkedInAt: 13, status: `checked-in`, checkInState: `checked-in` }),
        createParticipant({ profileId: `player-4`, displayName: `Player 4`, registeredAt: 4, checkedInAt: 14, status: `checked-in`, checkInState: `checked-in` }),
    ];
    const tournament = createTournament({
        status: `check-in-open`,
        format: `single-elimination`,
        participants,
    });
    const { service } = createService(tournament);

    let detail = await service.startTournament(tournament.id, organizer);
    const semiFinals = detail.matches
        .filter((match) => match.bracket === `winners` && match.round === 1)
        .sort((left, right) => left.order - right.order);
    assert.equal(semiFinals.length, 2);

    const firstFinalist = semiFinals[0]?.slots[0].profileId;
    const secondFinalist = semiFinals[1]?.slots[0].profileId;
    assert.ok(firstFinalist);
    assert.ok(secondFinalist);

    detail = await service.awardWalkover(tournament.id, semiFinals[0]!.id, firstFinalist, organizer);
    detail = await service.awardWalkover(tournament.id, semiFinals[1]!.id, secondFinalist, organizer);

    const finalMatch = detail.matches.find((match) => match.bracket === `winners` && match.round === 2);
    assert.ok(finalMatch);

    detail = await service.awardWalkover(tournament.id, finalMatch.id, firstFinalist, organizer);

    const champion = detail.participants.find((participant) => participant.profileId === firstFinalist);
    const runnerUp = detail.participants.find((participant) => participant.profileId === secondFinalist);
    assert.equal(detail.status, `completed`);
    assert.equal(champion?.status, `completed`);
    assert.equal(runnerUp?.status, `eliminated`);
});

test(`single-elimination standings rank the third-place winner ahead of the loser`, async () => {
    const organizer = createAccountUser({ id: `organizer-1`, username: `Organizer` });
    const participants = [
        createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 11, status: `checked-in`, checkInState: `checked-in` }),
        createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 12, status: `checked-in`, checkInState: `checked-in` }),
        createParticipant({ profileId: `player-3`, displayName: `Player 3`, registeredAt: 3, checkedInAt: 13, status: `checked-in`, checkInState: `checked-in` }),
        createParticipant({ profileId: `player-4`, displayName: `Player 4`, registeredAt: 4, checkedInAt: 14, status: `checked-in`, checkInState: `checked-in` }),
    ];
    const tournament = createTournament({
        status: `check-in-open`,
        format: `single-elimination`,
        thirdPlaceMatchEnabled: true,
        participants,
    });
    const { service } = createService(tournament);

    let detail = await service.startTournament(tournament.id, organizer);
    const semiFinals = detail.matches
        .filter((match) => match.bracket === `winners` && match.round === 1)
        .sort((left, right) => left.order - right.order);
    assert.equal(semiFinals.length, 2);

    const firstFinalist = semiFinals[0]?.slots[0].profileId;
    const secondFinalist = semiFinals[1]?.slots[0].profileId;
    const thirdPlaceWinner = semiFinals[0]?.slots[1].profileId;
    const fourthPlaceFinisher = semiFinals[1]?.slots[1].profileId;
    assert.ok(firstFinalist);
    assert.ok(secondFinalist);
    assert.ok(thirdPlaceWinner);
    assert.ok(fourthPlaceFinisher);

    detail = await service.awardWalkover(tournament.id, semiFinals[0]!.id, firstFinalist, organizer);
    detail = await service.awardWalkover(tournament.id, semiFinals[1]!.id, secondFinalist, organizer);

    const thirdPlaceMatch = detail.matches.find((match) => match.bracket === `third-place`);
    const finalMatch = detail.matches.find((match) => match.bracket === `winners` && match.round === 2);
    assert.ok(thirdPlaceMatch);
    assert.ok(finalMatch);

    detail = await service.awardWalkover(tournament.id, thirdPlaceMatch.id, thirdPlaceWinner, organizer);
    detail = await service.awardWalkover(tournament.id, finalMatch.id, firstFinalist, organizer);

    const thirdPlaceStanding = detail.standings.find((standing) => standing.profileId === thirdPlaceWinner);
    const fourthPlaceStanding = detail.standings.find((standing) => standing.profileId === fourthPlaceFinisher);

    assert.equal(detail.status, `completed`);
    assert.equal(thirdPlaceStanding?.rank, 3);
    assert.equal(fourthPlaceStanding?.rank, 4);
});

test(`swiss tournaments can start with two checked-in players`, async () => {
    const organizer = createAccountUser({ id: `organizer-1`, username: `Organizer` });
    const tournament = createTournament({
        status: `check-in-open`,
        format: `swiss`,
        maxPlayers: 2,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 11, status: `checked-in`, checkInState: `checked-in` }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 12, status: `checked-in`, checkInState: `checked-in` }),
        ],
    });
    const { service } = createService(tournament);

    const detail = await service.startTournament(tournament.id, organizer);

    assert.equal(detail.status, `live`);
    assert.equal(detail.matches.length, 1);
    assert.equal(detail.matches[0]?.bracket, `swiss`);
});

test(`viewer state hides register and waitlist actions for ineligible users`, async () => {
    const outsider = createAccountUser({ id: `player-out`, username: `Outsider` });
    const whitelistTournament = createTournament({
        status: `registration-open`,
        visibility: `private`,
        whitelist: [{ profileId: `allowed-player`, displayName: `Allowed` }],
    });
    const fullBlacklistedTournament = createTournament({
        id: `tournament-2`,
        status: `registration-open`,
        visibility: `private`,
        waitlistEnabled: true,
        maxPlayers: 2,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, status: `registered`, checkInState: `not-open`, registeredAt: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, status: `registered`, checkInState: `not-open`, registeredAt: 2 }),
        ],
        blacklist: [{ profileId: outsider.id, displayName: outsider.username }],
    });

    const whitelistService = createService(whitelistTournament).service;
    const blacklistService = createService(fullBlacklistedTournament).service;

    const whitelistDetail = await whitelistService.getTournamentDetail(whitelistTournament.id, outsider);
    const blacklistDetail = await blacklistService.getTournamentDetail(fullBlacklistedTournament.id, outsider);

    assert.equal(whitelistDetail?.viewer.canRegister, false);
    assert.equal(blacklistDetail?.viewer.canJoinWaitlist, false);
});

test(`getTournamentDetail refreshes double-elimination participant statuses when a live tournament completes during eager reconciliation`, async () => {
    const tournament = createTournament({
        status: `live`,
        format: `double-elimination`,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 11, status: `checked-in`, checkInState: `checked-in`, seed: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 12, status: `checked-in`, checkInState: `checked-in`, seed: 2 }),
        ],
        matches: [
            createMatch({
                id: `match-grand-final-1-1`,
                bracket: `grand-final`,
                round: 1,
                order: 1,
                state: `completed`,
                winnerProfileId: `player-1`,
                loserProfileId: `player-2`,
                resolvedAt: 123,
                slots: [
                    createSlot({ profileId: `player-1`, displayName: `Player 1`, seed: 1 }),
                    createSlot({ profileId: `player-2`, displayName: `Player 2`, seed: 2 }),
                ],
            }),
        ],
    });
    const { service } = createService(tournament);

    const detail = await service.getTournamentDetail(tournament.id, null);
    const champion = detail?.participants.find((participant) => participant.profileId === `player-1`);
    const runnerUp = detail?.participants.find((participant) => participant.profileId === `player-2`);

    assert.equal(detail?.status, `completed`);
    assert.equal(champion?.status, `completed`);
    assert.equal(runnerUp?.status, `eliminated`);
});

test(`reconcileAllTournaments only records one timeout warning per timeout window`, async () => {
    const matchStartedAt = Date.now() - 10 * 60_000;
    const tournament = createTournament({
        status: `live`,
        format: `swiss`,
        matchJoinTimeoutMinutes: 5,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 11, status: `checked-in`, checkInState: `checked-in`, seed: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 12, status: `checked-in`, checkInState: `checked-in`, seed: 2 }),
        ],
        matches: [
            createMatch({
                id: `match-swiss-1-1`,
                bracket: `swiss`,
                round: 1,
                order: 1,
                state: `in-progress`,
                startedAt: matchStartedAt,
                sessionId: `session-timeout-1`,
                slots: [
                    createSlot({ profileId: `player-1`, displayName: `Player 1`, seed: 1 }),
                    createSlot({ profileId: `player-2`, displayName: `Player 2`, seed: 2 }),
                ],
            }),
        ],
    });
    const { service, repository, sessionManager } = createService(tournament);
    sessionManager.sessions.set(`session-timeout-1`, {
        id: `session-timeout-1`,
        players: [
            { id: `p1`, profileId: `player-1`, connection: { status: `connected` } },
            { id: `p2`, profileId: `player-2`, connection: { status: `disconnected` } },
        ],
        state: { status: `lobby` },
        tournament: null,
    });

    await service.reconcileAllTournaments();
    await service.reconcileAllTournaments();

    const stored = repository.getSync(tournament.id);
    const timeoutWarnings = stored.activity.filter((entry) => entry.type === `timeout-warning`);
    assert.equal(timeoutWarnings.length, 1);
});

test(`best-of follow-up games reset startedAt and the session tournament timer`, async () => {
    const tournament = createTournament({
        status: `live`,
        format: `single-elimination`,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 1, status: `checked-in`, checkInState: `checked-in`, seed: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 2, status: `checked-in`, checkInState: `checked-in`, seed: 2 }),
        ],
        matches: [
            createMatch({
                id: `match-winners-1-1`,
                bracket: `winners`,
                round: 1,
                order: 1,
                state: `ready`,
                bestOf: 3,
                slots: [
                    createSlot({ profileId: `player-1`, displayName: `Player 1`, seed: 1 }),
                    createSlot({ profileId: `player-2`, displayName: `Player 2`, seed: 2 }),
                ],
            }),
        ],
    });
    const { service, repository, sessionManager } = createService(tournament);

    await service.reconcileAllTournaments();
    let stored = repository.getSync(tournament.id);
    assert.ok(stored.matches[0]?.sessionId);
    const gameOneSessionId = stored.matches[0]!.sessionId!;

    // Force a known stale timer so the next game's reset is easy to prove.
    stored.matches[0]!.startedAt = 1;
    repository.saveSync(stored);

    const gameOneSession = sessionManager.sessions.get(gameOneSessionId);
    assert.ok(gameOneSession?.players[0]);
    gameOneSession.state = {
        status: `finished`,
        gameId: `game-1`,
        winningPlayerId: gameOneSession.players[0].id,
    };

    await service.reconcileAllTournaments();
    stored = repository.getSync(tournament.id);
    assert.equal(stored.matches[0]?.state, `ready`);
    assert.equal(stored.matches[0]?.currentGameNumber, 2);
    assert.equal(stored.matches[0]?.startedAt, null);

    await service.reconcileAllTournaments();
    stored = repository.getSync(tournament.id);
    const gameTwoMatch = stored.matches[0]!;
    const gameTwoSession = sessionManager.sessions.get(gameTwoMatch.sessionId!);

    assert.ok(gameTwoMatch.sessionId);
    assert.notEqual(gameTwoMatch.startedAt, 1);
    assert.equal(gameTwoSession?.tournament?.matchStartedAt, gameTwoMatch.startedAt);
    assert.equal(gameTwoSession?.tournament?.currentGameNumber, 2);
    assert.equal(gameTwoSession?.tournament?.leftWins, 1);
    assert.equal(gameTwoSession?.tournament?.rightWins, 0);
});

test(`requestExtension is scoped to the current best-of game`, async () => {
    const user = createAccountUser({ id: `player-1`, username: `Player 1` });
    const tournament = createTournament({
        status: `live`,
        format: `single-elimination`,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 1, status: `checked-in`, checkInState: `checked-in`, seed: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 2, status: `checked-in`, checkInState: `checked-in`, seed: 2 }),
        ],
        matches: [
            createMatch({
                id: `match-winners-1-1`,
                bracket: `winners`,
                round: 1,
                order: 1,
                state: `ready`,
                bestOf: 3,
                currentGameNumber: 2,
                leftWins: 1,
                rightWins: 0,
                gameIds: [`game-1`],
                slots: [
                    createSlot({ profileId: `player-1`, displayName: `Player 1`, seed: 1 }),
                    createSlot({ profileId: `player-2`, displayName: `Player 2`, seed: 2 }),
                ],
            }),
        ],
        extensionRequests: [
            {
                id: `extension-g1`,
                matchId: `match-winners-1-1`,
                gameNumber: 1,
                requestedByProfileId: user.id,
                requestedByDisplayName: user.username,
                requestedAt: Date.now() - 60_000,
                status: `denied`,
                resolvedByProfileId: `organizer-1`,
                resolvedAt: Date.now() - 30_000,
            },
        ],
    });
    const { service } = createService(tournament);

    const detail = await service.requestExtension(tournament.id, `match-winners-1-1`, user);
    const currentGameExtensions = detail.extensionRequests.filter((request) =>
        request.matchId === `match-winners-1-1` && request.gameNumber === 2 && request.requestedByProfileId === user.id);

    assert.equal(currentGameExtensions.length, 1);
    assert.equal(currentGameExtensions[0]?.status, `pending`);
});

test(`claimWin ignores approved extensions from earlier best-of games`, async () => {
    const user = createAccountUser({ id: `player-1`, username: `Player 1` });
    const now = Date.now();
    const tournament = createTournament({
        status: `live`,
        format: `single-elimination`,
        matchJoinTimeoutMinutes: 5,
        matchExtensionMinutes: 5,
        participants: [
            createParticipant({ profileId: `player-1`, displayName: `Player 1`, registeredAt: 1, checkedInAt: 1, status: `checked-in`, checkInState: `checked-in`, seed: 1 }),
            createParticipant({ profileId: `player-2`, displayName: `Player 2`, registeredAt: 2, checkedInAt: 2, status: `checked-in`, checkInState: `checked-in`, seed: 2 }),
        ],
        matches: [
            createMatch({
                id: `match-winners-1-1`,
                bracket: `winners`,
                round: 1,
                order: 1,
                state: `in-progress`,
                bestOf: 3,
                currentGameNumber: 2,
                leftWins: 1,
                rightWins: 0,
                gameIds: [`game-1`],
                sessionId: `session-2`,
                startedAt: now - 10 * 60_000,
                slots: [
                    createSlot({ profileId: `player-1`, displayName: `Player 1`, seed: 1 }),
                    createSlot({ profileId: `player-2`, displayName: `Player 2`, seed: 2 }),
                ],
            }),
        ],
        extensionRequests: [
            {
                id: `extension-g1-approved`,
                matchId: `match-winners-1-1`,
                gameNumber: 1,
                requestedByProfileId: `player-2`,
                requestedByDisplayName: `Player 2`,
                requestedAt: now - 60_000,
                status: `approved`,
                resolvedByProfileId: `organizer-1`,
                resolvedAt: now - 10_000,
            },
        ],
    });
    const { service, sessionManager } = createService(tournament);
    sessionManager.sessions.set(`session-2`, {
        id: `session-2`,
        players: [
            { id: `session-2-player-1`, profileId: `player-1`, connection: { status: `connected` } },
            { id: `session-2-player-2`, profileId: `player-2`, connection: { status: `disconnected` } },
        ],
        state: { status: `lobby` },
        tournament: null,
    });

    const claim = await service.claimWin(tournament.id, `match-winners-1-1`, user);
    assert.equal(claim.matchId, `match-winners-1-1`);
    assert.equal(claim.gameNumber, 2);
    assert.ok(claim.expiresAt > claim.startedAt);

    (service as unknown as {
        cancelClaimWin: (matchId: string, sessionId: string) => void;
    }).cancelClaimWin(`match-winners-1-1`, `session-2`);
});
