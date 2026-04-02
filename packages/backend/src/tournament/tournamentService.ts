import { randomUUID } from 'node:crypto';

import {
    type CreateTournamentRequest,
    type MatchClaimWinState,
    type SessionClaimWinEvent,
    type SessionInfo,
    type TournamentBracketSize,
    type SessionTournamentInfo,
    TOURNAMENT_BRACKET_SIZES,
    type TournamentActivityEntry,
    type TournamentDetail,
    type TournamentExtensionRequest,
    type TournamentFormat,
    type TournamentListingResponse,
    type TournamentMatch,
    type TournamentMatchSlot,
    type TournamentNotificationEvent,
    type TournamentParticipant,
    type TournamentParticipantSwapRequest,
    type TournamentPlayerStats,
    type TournamentStanding,
    type TournamentSummary,
    type TournamentUpcomingMatch,
    type TournamentViewerState,
    type UpdateTournamentRequest,
} from '@ih3t/shared';
import { Mutex } from 'async-mutex';
import { inject, injectable } from 'tsyringe';

import { type AccountUserProfile, AuthRepository } from '../auth/authRepository';
import { type RequestClientInfo } from '../network/clientInfo';
import { SocketServerGateway } from '../network/createSocketServer';
import { GameHistoryRepository } from '../persistence/gameHistoryRepository';
import { SessionError, SessionManager } from '../session/sessionManager';
import type { CreateSessionParams } from '../session/types';
import { buildDoubleEliminationMatches, buildSingleEliminationMatches } from './tournamentBracket';
import { type TournamentRecord,TournamentRepository } from './tournamentRepository';
import { buildSwissRoundMatches, calculateSwissStandings } from './tournamentSwiss';

const kTournamentSystemClient: RequestClientInfo = {
    deviceId: `tournament-system`,
    ip: ``,
    userAgent: `tournament-system`,
    origin: ``,
    referer: null,
};

const kClaimWinCountdownMs = 30_000;

type ActiveClaimWin = {
    tournamentId: string;
    matchId: string;
    sessionId: string;
    claimantProfileId: string;
    startedAt: number;
    expiresAt: number;
    timer: ReturnType<typeof setTimeout>;
};

function canManageTournament(user: AccountUserProfile | null, tournament: TournamentRecord): boolean {
    if (!user) {
        return false;
    }

    if (user.role === `admin`) {
        return true;
    }

    return tournament.createdByProfileId === user.id
        || tournament.organizers?.includes(user.id) === true;
}

function isActiveParticipant(participant: TournamentParticipant): boolean {
    return participant.status !== `removed` && participant.status !== `dropped` && participant.status !== `waitlisted`;
}

function countRegisteredParticipants(tournament: TournamentRecord): number {
    return tournament.participants.filter(isActiveParticipant).length;
}

function countCheckedInParticipants(tournament: TournamentRecord): number {
    return tournament.participants.filter((participant) => isActiveParticipant(participant) && participant.checkedInAt !== null).length;
}

function getMinimumParticipantsToStart(format: TournamentFormat): number {
    return format === `swiss` ? 2 : 4;
}

function canUserAccessTournamentRegistration(tournament: TournamentRecord, userId: string | null): boolean {
    if (!userId) {
        return false;
    }

    if (tournament.whitelist.length > 0 && !tournament.whitelist.some((entry) => entry.profileId === userId)) {
        return false;
    }

    if (tournament.blacklist.some((entry) => entry.profileId === userId)) {
        return false;
    }

    return true;
}

function getWinsRequired(bestOf: 1 | 3 | 5 | 7): number {
    return Math.floor(bestOf / 2) + 1;
}

function normalizeDescription(value: string | null | undefined): string | null {
    const description = value?.trim() ?? ``;
    return description.length > 0 ? description : null;
}

function normalizeSwissRoundCount(
    format: TournamentFormat,
    maxPlayers: number,
    value: number | null | undefined,
): number | null {
    if (format !== `swiss`) {
        return null;
    }

    if (typeof value === `number` && Number.isFinite(value)) {
        return Math.max(1, Math.min(15, Math.floor(value)));
    }

    return Math.max(1, Math.ceil(Math.log2(maxPlayers)));
}

function createTournamentActivity(
    actor: AccountUserProfile | null,
    type: string,
    message: string,
): TournamentActivityEntry {
    return {
        id: randomUUID(),
        timestamp: Date.now(),
        actorProfileId: actor?.id ?? null,
        actorDisplayName: actor?.username ?? `Tournament System`,
        type,
        message,
    };
}

function cloneMatch(match: TournamentMatch): TournamentMatch {
    return {
        ...match,
        slots: match.slots.map((slot) => ({
            ...slot,
            source: slot.source ? { ...slot.source } : null,
        })) as [TournamentMatchSlot, TournamentMatchSlot],
        gameIds: [...match.gameIds],
        advanceWinnerTo: match.advanceWinnerTo ? { ...match.advanceWinnerTo } : null,
        advanceLoserTo: match.advanceLoserTo ? { ...match.advanceLoserTo } : null,
    };
}

function cloneParticipant(participant: TournamentParticipant): TournamentParticipant {
    return {
        ...participant,
    };
}

function cloneActivity(activity: TournamentActivityEntry): TournamentActivityEntry {
    return {
        ...activity,
    };
}

function cloneTournament(tournament: TournamentRecord): TournamentRecord {
    return {
        ...tournament,
        timeControl: { ...tournament.timeControl },
        seriesSettings: { ...tournament.seriesSettings },
        participants: tournament.participants.map(cloneParticipant),
        matches: tournament.matches.map(cloneMatch),
        activity: tournament.activity.map(cloneActivity),
        subscriberProfileIds: [...tournament.subscriberProfileIds],
        organizers: [...tournament.organizers],
    };
}

function getParticipantSnapshot(tournament: TournamentRecord, profileId: string | null): TournamentParticipant | null {
    if (!profileId) {
        return null;
    }

    let fallback: TournamentParticipant | null = null;
    for (let index = tournament.participants.length - 1; index >= 0; index -= 1) {
        const participant = tournament.participants[index];
        if (participant?.profileId !== profileId) {
            continue;
        }

        fallback ??= participant;
        if (isActiveParticipant(participant)) {
            return participant;
        }
    }

    return fallback;
}

function getMatchById(tournament: TournamentRecord, matchId: string): TournamentMatch {
    const match = tournament.matches.find((entry) => entry.id === matchId);
    if (!match) {
        throw new SessionError(`Tournament match not found.`);
    }

    return match;
}

function matchContainsProfileId(match: TournamentMatch, profileId: string): boolean {
    return match.slots.some((slot) => slot.profileId === profileId);
}

function matchHasStarted(match: TournamentMatch): boolean {
    return match.state === `in-progress`
        || match.state === `completed`
        || match.startedAt !== null
        || match.gameIds.length > 0;
}

function getNextMatchForUser(tournament: TournamentRecord, userId: string | null): TournamentViewerState[`nextMatch`] {
    if (!userId) {
        return null;
    }

    const match = tournament.matches
        .filter((entry) => entry.state === `ready` || entry.state === `in-progress`)
        .sort((left, right) => left.round - right.round || left.order - right.order)
        .find((entry) => entry.slots.some((slot) => slot.profileId === userId));
    if (!match) {
        return null;
    }

    const opponent = match.slots.find((slot) => slot.profileId !== userId && !slot.isBye) ?? null;
    return {
        matchId: match.id,
        bracket: match.bracket,
        round: match.round,
        order: match.order,
        bestOf: match.bestOf,
        sessionId: match.sessionId,
        opponentProfileId: opponent?.profileId ?? null,
        opponentDisplayName: opponent?.displayName ?? null,
        leftWins: match.leftWins,
        rightWins: match.rightWins,
    };
}

function buildViewerState(tournament: TournamentRecord, currentUser: AccountUserProfile | null): TournamentViewerState {
    const ownParticipant = currentUser
        ? tournament.participants.find((participant) => participant.profileId === currentUser.id && isActiveParticipant(participant)) ?? null
        : null;
    const waitlistedParticipant = currentUser
        ? tournament.participants.find((p) => p.profileId === currentUser.id && p.status === `waitlisted`) ?? null
        : null;
    const isRegistrationPhase = tournament.status === `registration-open` || (tournament.status === `check-in-open` && tournament.lateRegistrationEnabled);
    const isFull = countRegisteredParticipants(tournament) >= tournament.maxPlayers;
    const canAccessRegistration = canUserAccessTournamentRegistration(tournament, currentUser?.id ?? null);
    return {
        isAuthenticated: Boolean(currentUser),
        canManage: canManageTournament(currentUser, tournament),
        isRegistered: Boolean(ownParticipant),
        isCheckedIn: ownParticipant?.checkedInAt !== null,
        canRegister: Boolean(
            currentUser
            && isRegistrationPhase
            && !ownParticipant
            && !waitlistedParticipant
            && !isFull
            && canAccessRegistration
        ),
        canCheckIn: Boolean(
            currentUser
            && (
                (tournament.status === `check-in-open` && ownParticipant?.checkInState === `pending`)
                || (tournament.status === `waitlist-open` && waitlistedParticipant)
            ),
        ),
        canWithdraw: Boolean(
            currentUser
            && (ownParticipant || waitlistedParticipant)
            && (tournament.status === `registration-open` || tournament.status === `check-in-open` || tournament.status === `waitlist-open` || tournament.status === `live`),
        ),
        isSubscribed: Boolean(currentUser && tournament.subscriberProfileIds?.includes(currentUser.id)),
        isCreator: Boolean(tournament.createdByProfileId === currentUser?.id),
        isWaitlisted: Boolean(waitlistedParticipant),
        canJoinWaitlist: Boolean(
            currentUser
            && isRegistrationPhase
            && !ownParticipant
            && !waitlistedParticipant
            && isFull
            && tournament.waitlistEnabled
            && canAccessRegistration,
        ),
        nextMatch: getNextMatchForUser(tournament, currentUser?.id ?? null),
    };
}

function getTournamentStandings(tournament: TournamentRecord): TournamentStanding[] {
    if (tournament.format === `swiss`) {
        return calculateSwissStandings(
            tournament.participants.filter((participant) => participant.status !== `removed`),
            tournament.matches,
        );
    }

    return calculateEliminationStandings(tournament);
}

function calculateEliminationStandings(tournament: TournamentRecord): TournamentStanding[] {
    const activeParticipants = tournament.participants.filter((p) => p.status !== `removed`);

    // Count wins/losses per player
    const winsByProfile = new Map<string, number>();
    const lossesByProfile = new Map<string, number>();
    // Track the highest round a player lost in (higher round = better placement)
    // For DE: track losers bracket round too
    const eliminationRound = new Map<string, { bracket: string; round: number }>();

    for (const match of tournament.matches) {
        if (match.state !== `completed`) continue;

        if (match.winnerProfileId) {
            winsByProfile.set(match.winnerProfileId, (winsByProfile.get(match.winnerProfileId) ?? 0) + 1);
        }
        if (match.loserProfileId) {
            lossesByProfile.set(match.loserProfileId, (lossesByProfile.get(match.loserProfileId) ?? 0) + 1);
            // Record elimination point (last loss = where they were knocked out)
            eliminationRound.set(match.loserProfileId, { bracket: match.bracket, round: match.round });
        }
    }

    // Find the grand final / final match winner
    const grandFinalReset = tournament.matches.find((m) => m.bracket === `grand-final-reset` && m.state === `completed`);
    const grandFinal = tournament.matches.find((m) => m.bracket === `grand-final` && m.state === `completed`);
    const finalMatch = grandFinalReset ?? grandFinal;

    // For SE: final match is the highest round in winners bracket
    const winnersMatches = tournament.matches.filter((m) => m.bracket === `winners`);
    const maxWinnersRound = winnersMatches.reduce((max, m) => Math.max(max, m.round), 0);
    const seFinal = winnersMatches.find((m) => m.round === maxWinnersRound && m.state === `completed`);

    const championId = tournament.format === `double-elimination`
        ? finalMatch?.winnerProfileId ?? null
        : seFinal?.winnerProfileId ?? null;

    const runnerUpId = tournament.format === `double-elimination`
        ? finalMatch?.loserProfileId ?? null
        : seFinal?.loserProfileId ?? null;
    const thirdPlaceMatch = tournament.matches.find((match) => match.bracket === `third-place` && match.state === `completed`) ?? null;
    const thirdPlaceWinnerId = thirdPlaceMatch?.winnerProfileId ?? null;
    const fourthPlaceId = thirdPlaceMatch?.loserProfileId ?? null;

    // Assign placement scores — higher is better
    // For SE: eliminated in round R of total T rounds → placement group = T - R + 1
    //   Round T (final) loser = 2nd, Round T-1 (semi) losers = 3rd, etc.
    // For DE: losers bracket players are ranked below winners bracket same-round losers
    //   Grand final loser = 2nd
    //   Last losers round loser = 3rd
    //   Then by losers bracket round (descending), then winners bracket round (descending)

    const losersMatches = tournament.matches.filter((m) => m.bracket === `losers`);
    const maxLosersRound = losersMatches.reduce((max, m) => Math.max(max, m.round), 0);

    function getPlacementScore(profileId: string): number {
        if (profileId === championId) return Number.MAX_SAFE_INTEGER;
        if (profileId === runnerUpId) return Number.MAX_SAFE_INTEGER - 1;
        if (profileId === thirdPlaceWinnerId) return Number.MAX_SAFE_INTEGER - 2;
        if (profileId === fourthPlaceId) return Number.MAX_SAFE_INTEGER - 3;

        const elim = eliminationRound.get(profileId);
        if (!elim) return 0; // dropped/DQ'd before playing

        if (tournament.format === `single-elimination`) {
            // Higher round = better placement
            return elim.round;
        }

        // Double elimination: losers bracket finishers ranked below same-level winners bracket
        if (elim.bracket === `losers`) {
            return elim.round; // losers round number
        }
        // Eliminated from winners bracket (sent to losers) — but then eliminated from losers
        // Their final elimination is in losers bracket, handled above
        // If they were only eliminated once from winners (shouldn't happen in DE completed), treat as winners round
        return maxLosersRound + elim.round;
    }

    const standings: TournamentStanding[] = activeParticipants.map((p) => ({
        rank: 0,
        profileId: p.profileId,
        displayName: p.displayName,
        image: p.image,
        matchPoints: 0,
        wins: winsByProfile.get(p.profileId) ?? 0,
        losses: lossesByProfile.get(p.profileId) ?? 0,
        buchholz: 0,
        sonnebornBerger: 0,
        hadBye: false,
    }));

    // Sort by placement score descending, then wins descending
    standings.sort((a, b) => {
        const scoreA = getPlacementScore(a.profileId);
        const scoreB = getPlacementScore(b.profileId);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.wins - a.wins;
    });

    // Assign ranks — tied placement scores get the same rank
    let currentRank = 1;
    for (let i = 0; i < standings.length; i++) {
        if (i > 0) {
            const prevScore = getPlacementScore(standings[i - 1].profileId);
            const currScore = getPlacementScore(standings[i].profileId);
            if (currScore !== prevScore) {
                currentRank = i + 1;
            }
        }
        standings[i].rank = currentRank;
    }

    return standings;
}

function toSummary(tournament: TournamentRecord): TournamentSummary {
    return {
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        kind: tournament.kind,
        format: tournament.format,
        visibility: tournament.visibility,
        status: tournament.status,
        isPublished: tournament.isPublished,
        scheduledStartAt: tournament.scheduledStartAt,
        checkInWindowMinutes: tournament.checkInWindowMinutes,
        checkInOpensAt: tournament.checkInOpensAt,
        checkInClosesAt: tournament.checkInClosesAt,
        maxPlayers: tournament.maxPlayers,
        swissRoundCount: tournament.swissRoundCount,
        registeredCount: countRegisteredParticipants(tournament),
        checkedInCount: countCheckedInParticipants(tournament),
        createdAt: tournament.createdAt,
        updatedAt: tournament.updatedAt,
        startedAt: tournament.startedAt,
        completedAt: tournament.completedAt,
        cancelledAt: tournament.cancelledAt,
        createdByProfileId: tournament.createdByProfileId,
        createdByDisplayName: tournament.createdByDisplayName,
        timeControl: { ...tournament.timeControl },
        seriesSettings: { ...tournament.seriesSettings },
        matchJoinTimeoutMinutes: tournament.matchJoinTimeoutMinutes,
        lateRegistrationEnabled: tournament.lateRegistrationEnabled,
        thirdPlaceMatchEnabled: tournament.thirdPlaceMatchEnabled,
        roundDelayMinutes: tournament.roundDelayMinutes,
        waitlistEnabled: tournament.waitlistEnabled,
        waitlistCheckInMinutes: tournament.waitlistCheckInMinutes,
        waitlistOpensAt: tournament.waitlistOpensAt,
        waitlistClosesAt: tournament.waitlistClosesAt,
        waitlistedCount: tournament.participants.filter((p) => p.status === `waitlisted`).length,
    };
}

function resolveOrganizerNames(tournament: TournamentRecord, profileMap?: Map<string, string>): { profileId: string; displayName: string }[] {
    return tournament.organizers.map((id) => {
        const participant = tournament.participants.find((p) => p.profileId === id);
        const displayName = participant?.displayName ?? profileMap?.get(id) ?? id;
        return { profileId: id, displayName };
    });
}

function toDetail(
    tournament: TournamentRecord,
    currentUser: AccountUserProfile | null,
    profileMap?: Map<string, string>,
): TournamentDetail {
    return {
        ...toSummary(tournament),
        participants: tournament.participants.map(cloneParticipant),
        matches: tournament.matches.map(cloneMatch),
        standings: getTournamentStandings(tournament),
        activity: tournament.activity.map(cloneActivity),
        extensionRequests: tournament.extensionRequests.map((r) => ({ ...r })),
        organizers: resolveOrganizerNames(tournament, profileMap),
        whitelist: tournament.whitelist.map((e) => ({ ...e })),
        blacklist: tournament.blacklist.map((e) => ({ ...e })),
        viewer: buildViewerState(tournament, currentUser),
    };
}

@injectable()
export class TournamentService {
    private readonly tournamentLocks = new Map<string, Mutex>();
    private readonly activeClaimWins = new Map<string, ActiveClaimWin>();

    constructor(
        @inject(TournamentRepository) private readonly tournamentRepository: TournamentRepository,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository,
        @inject(SocketServerGateway) private readonly socketServerGateway: SocketServerGateway,
    ) { }

    async listTournaments(currentUser: AccountUserProfile | null, pastPage = 1): Promise<TournamentListingResponse> {
        const [
            publishedTournaments, ownTournaments, pastResult,
        ] = await Promise.all([
            this.tournamentRepository.listPublishedTournaments(),
            currentUser ? this.tournamentRepository.listTournamentsForPlayer(currentUser.id) : Promise.resolve([]),
            this.tournamentRepository.listPastTournaments(currentUser?.id ?? null, pastPage, 20),
        ]);

        const seen = new Set<string>();
        const active: TournamentSummary[] = [];
        const activeRecords: TournamentRecord[] = [];
        for (const t of [...ownTournaments, ...publishedTournaments]) {
            if (seen.has(t.id) || t.status === `completed` || t.status === `cancelled`) continue;
            seen.add(t.id);
            active.push(toSummary(t));
            activeRecords.push(t);
        }

        let stats: TournamentPlayerStats | null = null;
        let upcomingMatches: TournamentUpcomingMatch[] = [];
        if (currentUser) {
            const [computedStats, matches] = await Promise.all([
                this.computePlayerStats(currentUser.id).catch(() => null),
                Promise.resolve(this.computeUpcomingMatches(activeRecords, currentUser.id)),
            ]);
            stats = computedStats;
            upcomingMatches = matches;
        }

        return {
            tournaments: active,
            past: pastResult.tournaments.map(toSummary),
            pastTotal: pastResult.total,
            stats,
            upcomingMatches,
        };
    }

    async getTournamentDetail(tournamentId: string, currentUser: AccountUserProfile | null): Promise<TournamentDetail | null> {
        let tournament = await this.tournamentRepository.getTournament(tournamentId);
        if (!tournament) {
            return null;
        }

        /* Eagerly reconcile live tournaments so the detail is always fresh */
        if (tournament.status === `live`) {
            const changed = await this.reconcileLiveTournamentRecord(tournament);
            const timeoutChanged = tournament.status === `live`
                ? this.checkMatchTimeouts(tournament)
                : false;
            const participantStatusChanged = this.refreshParticipantStatuses(tournament);
            if (changed) {
                tournament.updatedAt = Date.now();
                await this.tournamentRepository.saveTournament(tournament);
                this.broadcastTournamentUpdate(tournament);
                tournament = await this.tournamentRepository.getTournament(tournamentId) ?? tournament;
            } else if (timeoutChanged || participantStatusChanged) {
                tournament.updatedAt = Date.now();
                await this.tournamentRepository.saveTournament(tournament);
                this.broadcastTournamentUpdate(tournament);
                tournament = await this.tournamentRepository.getTournament(tournamentId) ?? tournament;
            }
        }

        /* Auto-subscribe on view */
        if (currentUser) {
            const subs = tournament.subscriberProfileIds;
            if (!subs.includes(currentUser.id)) {
                subs.push(currentUser.id);
                tournament.subscriberProfileIds = subs;
            }

            this.tournamentRepository.addSubscriber(tournamentId, currentUser.id).catch(() => { /* fire-and-forget */ });
        }

        /* Resolve organizer display names */
        const orgIds = tournament.organizers.filter(
            (id) => !tournament.participants.some((p) => p.profileId === id),
        );
        let profileMap: Map<string, string> | undefined;
        if (orgIds.length > 0) {
            const profiles = await this.authRepository.getUserProfilesByIds(orgIds);
            profileMap = new Map(
                [...profiles.entries()].map(([id, p]) => [id, p.username]),
            );
        }

        return toDetail(tournament, currentUser, profileMap);
    }

    async createCommunityTournament(user: AccountUserProfile, request: CreateTournamentRequest): Promise<TournamentDetail> {
        if (user.role !== `admin`) {
            const activeCount = await this.tournamentRepository.countActiveTournamentsForUser(user.id);
            if (activeCount >= 2) {
                throw new SessionError(`You can have at most 2 active tournaments.`);
            }
        }

        const tournament = this.buildTournamentRecord(`community`, user, request);
        tournament.whitelist = await this.resolveAccessEntries(request.whitelist ?? []);
        tournament.blacklist = await this.resolveAccessEntries(request.blacklist ?? []);
        await this.tournamentRepository.createTournament(tournament);
        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async createOfficialTournament(user: AccountUserProfile, request: CreateTournamentRequest): Promise<TournamentDetail> {
        if (user.role !== `admin`) {
            throw new SessionError(`Admin access is required to create official tournaments.`);
        }

        const tournament = this.buildTournamentRecord(`official`, user, request);
        tournament.whitelist = await this.resolveAccessEntries(request.whitelist ?? []);
        tournament.blacklist = await this.resolveAccessEntries(request.blacklist ?? []);
        await this.tournamentRepository.createTournament(tournament);
        return toDetail(tournament, user);
    }

    async updateTournament(tournamentId: string, user: AccountUserProfile, update: UpdateTournamentRequest): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            if (tournament.status === `live` || tournament.status === `completed` || tournament.status === `cancelled`) {
                throw new SessionError(`Tournament settings can only be changed before the event goes live.`);
            }

            const nextFormat = update.format ?? tournament.format;
            const nextMaxPlayers = update.maxPlayers ?? tournament.maxPlayers;

            if ((nextFormat === `single-elimination` || nextFormat === `double-elimination`) && !(TOURNAMENT_BRACKET_SIZES as readonly number[]).includes(nextMaxPlayers)) {
                throw new SessionError(`Elimination formats require a bracket size of ${TOURNAMENT_BRACKET_SIZES.join(`, `)}.`);
            }

            tournament.name = update.name ?? tournament.name;
            tournament.description = update.description === undefined ? tournament.description : normalizeDescription(update.description);
            tournament.format = nextFormat;
            tournament.visibility = update.visibility ?? tournament.visibility;
            tournament.scheduledStartAt = update.scheduledStartAt ?? tournament.scheduledStartAt;
            tournament.checkInWindowMinutes = update.checkInWindowMinutes ?? tournament.checkInWindowMinutes;
            tournament.checkInOpensAt = Math.max(0, tournament.scheduledStartAt - tournament.checkInWindowMinutes * 60_000);
            tournament.checkInClosesAt = tournament.scheduledStartAt;
            tournament.maxPlayers = nextMaxPlayers;
            tournament.swissRoundCount = normalizeSwissRoundCount(nextFormat, nextMaxPlayers, update.swissRoundCount ?? tournament.swissRoundCount);

            if (update.timeControl) {
                tournament.timeControl = { ...update.timeControl };
            }

            if (update.seriesSettings) {
                tournament.seriesSettings = { ...update.seriesSettings };
            }

            if (update.matchJoinTimeoutMinutes !== undefined) {
                tournament.matchJoinTimeoutMinutes = update.matchJoinTimeoutMinutes ?? tournament.matchJoinTimeoutMinutes;
            }

            if (update.lateRegistrationEnabled !== undefined) {
                tournament.lateRegistrationEnabled = update.lateRegistrationEnabled;
            }

            if (update.thirdPlaceMatchEnabled !== undefined) {
                tournament.thirdPlaceMatchEnabled = update.thirdPlaceMatchEnabled;
            }

            if (update.roundDelayMinutes !== undefined) {
                tournament.roundDelayMinutes = update.roundDelayMinutes;
            }

            if (update.waitlistEnabled !== undefined) {
                tournament.waitlistEnabled = update.waitlistEnabled;
            }

            if (update.waitlistCheckInMinutes !== undefined) {
                tournament.waitlistCheckInMinutes = update.waitlistCheckInMinutes ?? tournament.waitlistCheckInMinutes;
            }

            if (update.whitelist !== undefined) {
                tournament.whitelist = update.whitelist
                    ? await this.resolveAccessEntries(update.whitelist)
                    : [];
            }

            if (update.blacklist !== undefined) {
                tournament.blacklist = update.blacklist
                    ? await this.resolveAccessEntries(update.blacklist)
                    : [];
            }

            if (tournament.kind === `official`) {
                tournament.visibility = `public`;
            } else {
                tournament.isPublished = tournament.visibility === `public`;
            }

            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `tournament-updated`, `Updated tournament settings.`));
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async publishTournament(tournamentId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            if (tournament.kind !== `official`) {
                throw new SessionError(`Only official tournaments require publishing.`);
            }

            if (tournament.status !== `draft`) {
                throw new SessionError(`Only draft tournaments can be published.`);
            }

            tournament.status = `registration-open`;
            tournament.isPublished = true;
            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `tournament-published`, `Published the tournament and opened registration.`));
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async registerCurrentUser(tournamentId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            const canRegister = tournament.status === `registration-open`
                || (tournament.status === `check-in-open` && tournament.lateRegistrationEnabled);
            if (!canRegister) {
                throw new SessionError(`Registration is closed for this tournament.`);
            }

            const existingParticipant = getParticipantSnapshot(tournament, user.id);
            if (existingParticipant && (isActiveParticipant(existingParticipant) || existingParticipant.status === `waitlisted`)) {
                throw new SessionError(`You are already registered for this tournament.`);
            }

            const isFull = countRegisteredParticipants(tournament) >= tournament.maxPlayers;
            if (isFull && !tournament.waitlistEnabled) {
                throw new SessionError(`This tournament is already full.`);
            }

            if (tournament.whitelist.length > 0 && !tournament.whitelist.some((e) => e.profileId === user.id)) {
                throw new SessionError(`You are not on the whitelist for this tournament.`);
            }

            if (tournament.blacklist.some((e) => e.profileId === user.id)) {
                throw new SessionError(`You have been blocked from this tournament.`);
            }

            const isLateReg = tournament.status === `check-in-open` && !isFull;
            const isWaitlist = isFull && tournament.waitlistEnabled;
            const now = Date.now();
            const nextRegistrationState = {
                profileId: user.id,
                displayName: user.username,
                image: user.image,
                registeredAt: now,
                checkedInAt: isLateReg ? now : null,
                seed: null,
                status: isWaitlist ? `waitlisted` : isLateReg ? `checked-in` : `registered`,
                checkInState: isLateReg ? `checked-in` : `not-open`,
                isManual: false,
                removedAt: null,
                eliminatedAt: null,
                replacedByProfileId: null,
                replacesProfileId: null,
            } satisfies TournamentParticipant;

            if (existingParticipant) {
                Object.assign(existingParticipant, nextRegistrationState);
            } else {
                tournament.participants.push(nextRegistrationState);
            }

            tournament.updatedAt = Date.now();
            const activityMessage = isWaitlist
                ? `${user.username} joined the waitlist.`
                : `${user.username} registered for the tournament.`;
            tournament.activity.unshift(createTournamentActivity(user, isWaitlist ? `participant-waitlisted` : `participant-registered`, activityMessage));
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async reorderSeeds(tournamentId: string, orderedProfileIds: string[], user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);

            if (!canManageTournament(user, tournament)) {
                throw new SessionError(`Only organizers can reorder seeds.`);
            }

            if (tournament.status !== `registration-open` && tournament.status !== `check-in-open`) {
                throw new SessionError(`Seeds can only be reordered before the tournament starts.`);
            }

            const activeParticipants = tournament.participants.filter(isActiveParticipant);
            const activeIds = new Set(activeParticipants.map((p) => p.profileId));

            for (const profileId of orderedProfileIds) {
                if (!activeIds.has(profileId)) {
                    throw new SessionError(`Profile ${profileId} is not an active participant.`);
                }
            }

            // Assign seeds based on the provided order
            const orderedSet = new Set<string>();
            for (let i = 0; i < orderedProfileIds.length; i += 1) {
                const profileId = orderedProfileIds[i]!;
                if (orderedSet.has(profileId)) continue;
                orderedSet.add(profileId);
                const participant = tournament.participants.find((p) => p.profileId === profileId);
                if (participant) {
                    participant.seed = i + 1;
                }
            }

            // Clear seeds for participants not in the ordered list
            for (const participant of tournament.participants) {
                if (isActiveParticipant(participant) && !orderedSet.has(participant.profileId)) {
                    participant.seed = null;
                }
            }

            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `seeds-reordered`, `${user.username} reordered the seeds.`));
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async withdrawCurrentUser(tournamentId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            const participant = tournament.participants.find((entry) =>
                entry.profileId === user.id && (isActiveParticipant(entry) || entry.status === `waitlisted`));
            if (!participant) {
                throw new SessionError(`You are not registered for this tournament.`);
            }

            if (!(tournament.status === `registration-open` || tournament.status === `check-in-open` || tournament.status === `waitlist-open` || tournament.status === `live`)) {
                throw new SessionError(`You can no longer withdraw from this tournament.`);
            }

            if (tournament.status === `live`) {
                await this.forfeitAllMatchesForPlayer(tournament, user.id);
            } else {
                const ownMatchesStarted = tournament.matches.some((match) => matchContainsProfileId(match, user.id) && matchHasStarted(match));
                if (ownMatchesStarted) {
                    throw new SessionError(`You cannot withdraw after your tournament run has started.`);
                }
            }

            participant.status = `dropped`;
            participant.removedAt = Date.now();

            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `participant-withdrew`, `${user.username} withdrew from the tournament.`));
            await this.reconcileTournamentRecord(tournament);

            // Clean up any matches created by reconciliation that still reference this player.
            if (tournament.status === `live`) {
                await this.forfeitAllMatchesForPlayer(tournament, user.id);
            }

            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async checkInCurrentUser(tournamentId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);

            // Waitlist check-in: waitlisted player claiming a freed slot
            if (tournament.status === `waitlist-open`) {
                const waitlistedParticipant = tournament.participants.find((p) => p.profileId === user.id && p.status === `waitlisted`);
                if (!waitlistedParticipant) {
                    throw new SessionError(`You are not on the waitlist for this tournament.`);
                }

                if (countCheckedInParticipants(tournament) >= tournament.maxPlayers) {
                    throw new SessionError(`All available spots have been claimed.`);
                }

                waitlistedParticipant.checkedInAt = Date.now();
                waitlistedParticipant.status = `checked-in`;
                waitlistedParticipant.checkInState = `checked-in`;
                tournament.updatedAt = Date.now();
                tournament.activity.unshift(createTournamentActivity(user, `waitlist-checked-in`, `${user.username} checked in from the waitlist.`));
                await this.tournamentRepository.saveTournament(tournament);
                return tournament;
            }

            if (tournament.status !== `check-in-open`) {
                throw new SessionError(`Check-in is not open for this tournament.`);
            }

            const participant = tournament.participants.find((entry) => entry.profileId === user.id && isActiveParticipant(entry));
            if (!participant) {
                throw new SessionError(`You are not registered for this tournament.`);
            }

            participant.checkedInAt = Date.now();
            participant.status = `checked-in`;
            participant.checkInState = `checked-in`;
            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `participant-checked-in`, `${user.username} checked in.`));
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async addParticipant(tournamentId: string, user: AccountUserProfile, profileId: string): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            if (tournament.status === `live`) {
                throw new SessionError(`Use participant replacement once the tournament is live.`);
            }

            if (tournament.status === `completed` || tournament.status === `cancelled`) {
                throw new SessionError(`Participants can no longer be edited for this tournament.`);
            }

            if (countRegisteredParticipants(tournament) >= tournament.maxPlayers) {
                throw new SessionError(`This tournament is already full.`);
            }

            const profile = await this.authRepository.getUserProfileById(profileId);
            if (!profile) {
                throw new SessionError(`Player not found.`);
            }

            if (tournament.participants.some((participant) => participant.profileId === profile.id && isActiveParticipant(participant))) {
                throw new SessionError(`That player is already in the tournament.`);
            }

            tournament.participants.push({
                profileId: profile.id,
                displayName: profile.username,
                image: profile.image,
                registeredAt: Date.now(),
                checkedInAt: null,
                seed: null,
                status: `registered`,
                checkInState: tournament.status === `check-in-open` ? `pending` : `not-open`,
                isManual: true,
                removedAt: null,
                eliminatedAt: null,
                replacedByProfileId: null,
                replacesProfileId: null,
            });

            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `participant-added`, `${profile.username} was added to the tournament.`));
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async removeParticipant(tournamentId: string, user: AccountUserProfile, profileId: string): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            const participant = tournament.participants.find((entry) => entry.profileId === profileId && isActiveParticipant(entry));
            if (!participant) {
                throw new SessionError(`Player is not registered for this tournament.`);
            }

            if (tournament.status === `live`) {
                // Forfeit all current matches, then reconcile, then forfeit any new matches
                // that were created by bracket progression (e.g. losers bracket in DE).
                // Loop until no more matches need forfeiting.
                await this.forfeitAllMatchesForPlayer(tournament, profileId);
            }

            participant.status = `dropped`;
            participant.removedAt = Date.now();

            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `participant-disqualified`, `${participant.displayName} was disqualified from the tournament.`));
            await this.reconcileTournamentRecord(tournament);

            // After final reconcile, bracket progression may have placed the DQ'd
            // player into new matches (e.g. losers bracket slots that were TBD).
            // Run the forfeit cascade again to clean those up.
            if (tournament.status === `live`) {
                await this.forfeitAllMatchesForPlayer(tournament, profileId);
            }

            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async swapParticipant(tournamentId: string, user: AccountUserProfile, request: TournamentParticipantSwapRequest): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            const currentParticipant = tournament.participants.find((entry) => entry.profileId === request.profileId && isActiveParticipant(entry));
            if (!currentParticipant) {
                throw new SessionError(`The original player is not part of this tournament.`);
            }

            const replacementProfile = await this.authRepository.getUserProfileById(request.replacementProfileId);
            if (!replacementProfile) {
                throw new SessionError(`Replacement player not found.`);
            }

            const conflictingParticipant = tournament.participants.find((entry) => entry.profileId === replacementProfile.id && isActiveParticipant(entry));
            if (conflictingParticipant) {
                throw new SessionError(`The replacement player is already active in this tournament.`);
            }

            if (tournament.status === `live`) {
                this.assertParticipantEditable(tournament, request.profileId);
                this.replaceProfileInMatches(
                    tournament,
                    currentParticipant.profileId,
                    replacementProfile.id,
                    replacementProfile.username,
                    replacementProfile.image,
                );
            }

            currentParticipant.status = `removed`;
            currentParticipant.removedAt = Date.now();
            currentParticipant.replacedByProfileId = replacementProfile.id;

            tournament.participants.push({
                profileId: replacementProfile.id,
                displayName: replacementProfile.username,
                image: replacementProfile.image,
                registeredAt: Date.now(),
                checkedInAt: tournament.status === `live` || currentParticipant.checkedInAt ? Date.now() : null,
                seed: currentParticipant.seed,
                status: tournament.status === `live` || currentParticipant.checkedInAt ? `checked-in` : `registered`,
                checkInState: tournament.status === `live` || currentParticipant.checkedInAt ? `checked-in` : tournament.status === `check-in-open` ? `pending` : `not-open`,
                isManual: true,
                removedAt: null,
                eliminatedAt: null,
                replacedByProfileId: null,
                replacesProfileId: currentParticipant.profileId,
            });

            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `participant-swapped`, `${replacementProfile.username} replaced ${currentParticipant.displayName}.`));
            await this.reconcileTournamentRecord(tournament);
            this.socketServerGateway.emitTournamentNotification(replacementProfile.id, {
                tournamentId: tournament.id,
                kind: `participant-replaced`,
                message: `You were added to ${tournament.name}.`,
            } satisfies TournamentNotificationEvent);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async startTournament(tournamentId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);
            await this.startTournamentRecord(tournament, user);
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async awardWalkover(tournamentId: string, matchId: string, winnerProfileId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);
            const match = getMatchById(tournament, matchId);
            if (!(match.state === `ready` || match.state === `in-progress`)) {
                throw new SessionError(`Only unresolved matches can be awarded.`);
            }

            this.completeMatchSet(tournament, match, winnerProfileId, `walkover`);
            tournament.activity.unshift(createTournamentActivity(user, `match-walkover`, `Awarded a walkover in round ${match.round}, match ${match.order}.`));
            await this.reconcileTournamentRecord(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async reopenMatch(tournamentId: string, matchId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);
            const match = getMatchById(tournament, matchId);

            if (match.state === `completed` || match.state === `pending`) {
                throw new SessionError(`Only active matches can be reopened automatically in v1.`);
            }

            match.sessionId = null;
            match.state = `ready`;
            match.startedAt = null;
            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `match-reopened`, `Reopened round ${match.round}, match ${match.order}.`));
            await this.reconcileTournamentRecord(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async cancelTournament(tournamentId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);
            if (tournament.status === `completed`) {
                throw new SessionError(`Completed tournaments cannot be cancelled.`);
            }

            tournament.status = `cancelled`;
            tournament.cancelledAt = Date.now();
            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(user, `tournament-cancelled`, `Cancelled the tournament.`));
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async unsubscribeFromTournament(tournamentId: string, user: AccountUserProfile, transferTo?: string): Promise<void> {
        const tournament = await this.requireTournament(tournamentId);
        const isCreator = tournament.createdByProfileId === user.id;
        const isOrganizer = tournament.organizers?.includes(user.id) === true;

        if (isCreator) {
            const otherOrganizers = (tournament.organizers ?? []).filter((id) => id !== user.id);
            if (otherOrganizers.length === 0 && tournament.status !== `completed` && tournament.status !== `cancelled`) {
                throw new SessionError(`You are the only organizer. Add another organizer before unsubscribing, or cancel the tournament.`);
            }

            if (!transferTo) {
                if (otherOrganizers.length > 0 && tournament.status !== `completed` && tournament.status !== `cancelled`) {
                    throw new SessionError(`Choose a new primary organizer before unsubscribing.`);
                }
            } else {
                if (!otherOrganizers.includes(transferTo)) {
                    throw new SessionError(`The selected user is not an organizer of this tournament.`);
                }

                tournament.createdByProfileId = transferTo;
                tournament.organizers = otherOrganizers.filter((id) => id !== transferTo);
                tournament.updatedAt = Date.now();
                tournament.activity.unshift(createTournamentActivity(
                    user,
                    `organizer-transferred`,
                    `${user.username} transferred tournament ownership.`,
                ));
                await this.tournamentRepository.saveTournament(tournament);
                this.broadcastTournamentUpdate(tournament);
            }
        } else if (isOrganizer) {
            tournament.organizers = (tournament.organizers ?? []).filter((id) => id !== user.id);
            tournament.updatedAt = Date.now();
            await this.tournamentRepository.saveTournament(tournament);
            this.broadcastTournamentUpdate(tournament);
        }

        await this.tournamentRepository.removeSubscriber(tournamentId, user.id);
    }

    async grantTournamentOrganizer(tournamentId: string, user: AccountUserProfile, profileId: string): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            const profile = await this.authRepository.getUserProfileById(profileId);
            if (!profile) {
                throw new SessionError(`User not found.`);
            }

            if (!tournament.organizers.includes(profileId)) {
                tournament.organizers.push(profileId);
                tournament.updatedAt = Date.now();
                tournament.activity.unshift(createTournamentActivity(user, `organizer-added`, `Added ${profile.username} as a tournament organizer.`));
                await this.tournamentRepository.saveTournament(tournament);
            }

            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async revokeTournamentOrganizer(tournamentId: string, user: AccountUserProfile, profileId: string): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            const index = tournament.organizers.indexOf(profileId);
            if (index >= 0) {
                tournament.organizers.splice(index, 1);
                tournament.updatedAt = Date.now();
                tournament.activity.unshift(createTournamentActivity(user, `organizer-removed`, `Removed an organizer from the tournament.`));
                await this.tournamentRepository.saveTournament(tournament);
            }

            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async reconcileAllTournaments(): Promise<void> {
        const tournaments = await this.tournamentRepository.listReconciliableTournaments();
        for (const tournament of tournaments) {
            await this.withTournamentLock(tournament.id, async () => {
                const latest = await this.requireTournament(tournament.id);
                const previousUpdatedAt = latest.updatedAt;
                await this.reconcileTournamentRecord(latest);
                if (latest.updatedAt !== previousUpdatedAt) {
                    this.broadcastTournamentUpdate(latest);
                }
            });
        }
    }

    private buildTournamentRecord(
        kind: TournamentRecord[`kind`],
        user: AccountUserProfile,
        request: CreateTournamentRequest,
    ): TournamentRecord {
        const now = Date.now();
        const format = request.format ?? `double-elimination`;

        if (format === `single-elimination` || format === `double-elimination`) {
            if (!(TOURNAMENT_BRACKET_SIZES as readonly number[]).includes(request.maxPlayers)) {
                throw new SessionError(`Elimination formats require a bracket size of ${TOURNAMENT_BRACKET_SIZES.join(`, `)}.`);
            }
        } else if (request.maxPlayers < 2) {
            throw new SessionError(`At least 2 players are required.`);
        }
        const swissRoundCount = normalizeSwissRoundCount(format, request.maxPlayers, request.swissRoundCount);

        return {
            version: 1,
            id: randomUUID(),
            name: request.name,
            description: normalizeDescription(request.description),
            kind,
            format,
            visibility: kind === `official` ? `public` : request.visibility,
            status: kind === `official` ? `draft` : `registration-open`,
            isPublished: kind === `community` && request.visibility === `public`,
            scheduledStartAt: request.scheduledStartAt,
            checkInWindowMinutes: request.checkInWindowMinutes,
            checkInOpensAt: Math.max(0, request.scheduledStartAt - request.checkInWindowMinutes * 60_000),
            checkInClosesAt: request.scheduledStartAt,
            maxPlayers: request.maxPlayers,
            swissRoundCount,
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null,
            cancelledAt: null,
            createdByProfileId: user.id,
            createdByDisplayName: user.username,
            timeControl: { ...request.timeControl },
            seriesSettings: { ...request.seriesSettings },
            matchJoinTimeoutMinutes: request.matchJoinTimeoutMinutes ?? 5,
            lateRegistrationEnabled: request.lateRegistrationEnabled ?? false,
            thirdPlaceMatchEnabled: request.thirdPlaceMatchEnabled ?? false,
            roundDelayMinutes: request.roundDelayMinutes ?? 0,
            waitlistEnabled: request.waitlistEnabled ?? false,
            waitlistCheckInMinutes: request.waitlistCheckInMinutes ?? 5,
            waitlistOpensAt: null,
            waitlistClosesAt: null,
            participants: [],
            matches: [],
            extensionRequests: [],
            subscriberProfileIds: [],
            organizers: [],
            whitelist: [],
            blacklist: [],
            activity: [
                createTournamentActivity(
                    user,
                    `tournament-created`,
                    kind === `official`
                        ? `Created a new official tournament draft.`
                        : `Created a new community tournament.`,
                ),
            ],
        };
    }

    private getCheckedInParticipants(tournament: TournamentRecord): TournamentParticipant[] {
        return tournament.participants
            .filter((participant) => isActiveParticipant(participant) && participant.checkedInAt !== null)
            .sort((left, right) =>
                (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER)
                || left.registeredAt - right.registeredAt
                || left.displayName.localeCompare(right.displayName));
    }

    private async startTournamentRecord(tournament: TournamentRecord, actor: AccountUserProfile | null): Promise<void> {
        if (tournament.status !== `check-in-open`) {
            throw new SessionError(`Tournament check-in must be open before the event can start.`);
        }

        const checkedInParticipants = this.getCheckedInParticipants(tournament);
        const minimumParticipantsToStart = getMinimumParticipantsToStart(tournament.format);
        if (checkedInParticipants.length < minimumParticipantsToStart) {
            throw new SessionError(`At least ${minimumParticipantsToStart} checked-in player${minimumParticipantsToStart === 1 ? `` : `s`} are required to start the tournament.`);
        }

        const seededParticipants = checkedInParticipants.map((participant, index) => ({
            ...participant,
            seed: index + 1,
        }));

        for (const participant of tournament.participants) {
            const seededParticipant = seededParticipants.find((entry) => entry.profileId === participant.profileId) ?? null;
            participant.seed = seededParticipant?.seed ?? participant.seed;
            if (seededParticipant) {
                participant.status = `checked-in`;
                participant.checkInState = `checked-in`;
            } else if (participant.status !== `removed`) {
                participant.status = `dropped`;
                participant.removedAt ??= Date.now();
                if (participant.checkedInAt === null) {
                    participant.checkInState = `missed`;
                }
            }
        }

        tournament.swissRoundCount = normalizeSwissRoundCount(
            tournament.format,
            tournament.maxPlayers,
            tournament.swissRoundCount ?? checkedInParticipants.length,
        );

        if (tournament.format === `single-elimination` || tournament.format === `double-elimination`) {
            const bracketSize = this.getTournamentBracketSize(checkedInParticipants.length, tournament.maxPlayers) as TournamentBracketSize;
            const seeded = seededParticipants.map((participant) => ({
                profileId: participant.profileId,
                displayName: participant.displayName,
                image: participant.image,
                seed: participant.seed,
            }));
            tournament.matches = tournament.format === `single-elimination`
                ? buildSingleEliminationMatches(seeded, bracketSize, tournament.seriesSettings, tournament.thirdPlaceMatchEnabled)
                : buildDoubleEliminationMatches(seeded, bracketSize, tournament.seriesSettings);
        } else {
            const swissRoundCount = tournament.swissRoundCount ?? 1;
            tournament.matches = buildSwissRoundMatches({
                participants: seededParticipants.map((participant) => ({
                    ...participant,
                    seed: participant.seed ?? 1,
                })),
                existingMatches: [],
                round: 1,
                totalRounds: swissRoundCount,
                seriesSettings: tournament.seriesSettings,
            });
        }

        tournament.status = `live`;
        tournament.startedAt = Date.now();
        tournament.updatedAt = Date.now();
        tournament.activity.unshift(createTournamentActivity(actor, `tournament-started`, `Started the tournament.`));
        await this.reconcileLiveTournamentRecord(tournament);
        this.refreshParticipantStatuses(tournament);

        for (const participant of seededParticipants) {
            this.socketServerGateway.emitTournamentNotification(participant.profileId, {
                tournamentId: tournament.id,
                kind: `tournament-started`,
                message: `${tournament.name} has started.`,
            } satisfies TournamentNotificationEvent);
        }
    }

    private getTournamentBracketSize(entrants: number, maxPlayers: number): number {
        const size = TOURNAMENT_BRACKET_SIZES.find((candidate) => candidate >= entrants) ?? TOURNAMENT_BRACKET_SIZES[TOURNAMENT_BRACKET_SIZES.length - 1];
        return Math.min(size, maxPlayers);
    }

    private async reconcileTournamentRecord(tournament: TournamentRecord): Promise<void> {
        const now = Date.now();
        let changed = false;

        if (tournament.status === `registration-open` && now >= tournament.checkInOpensAt) {
            tournament.status = `check-in-open`;
            tournament.updatedAt = now;
            tournament.activity.unshift(createTournamentActivity(null, `check-in-opened`, `Tournament check-in is now open.`));

            const minimumParticipantsToStart = getMinimumParticipantsToStart(tournament.format);
            const registeredCount = countRegisteredParticipants(tournament);
            if (registeredCount < minimumParticipantsToStart) {
                tournament.activity.unshift(createTournamentActivity(
                    null, `low-registration-warning`,
                    `Only ${registeredCount} player${registeredCount === 1 ? `` : `s`} registered — at least ${minimumParticipantsToStart} ${minimumParticipantsToStart === 1 ? `is` : `are`} needed to start.`,
                ));
                // Notify organizers
                const organizerIds = [tournament.createdByProfileId, ...tournament.organizers];
                for (const orgId of new Set(organizerIds)) {
                    this.socketServerGateway.emitTournamentNotification(orgId, {
                        tournamentId: tournament.id,
                        kind: `low-registration`,
                        message: `"${tournament.name}" has only ${registeredCount} player${registeredCount === 1 ? `` : `s`} registered. At least ${minimumParticipantsToStart} ${minimumParticipantsToStart === 1 ? `is` : `are`} needed.`,
                    } satisfies TournamentNotificationEvent);
                }
            }

            for (const participant of tournament.participants) {
                if (participant.status === `registered`) {
                    participant.checkInState = `pending`;
                }
            }
            changed = true;
        }

        if (tournament.status === `check-in-open` && now >= tournament.scheduledStartAt) {
            // Drop no-shows
            let droppedCount = 0;
            for (const participant of tournament.participants) {
                if (participant.checkedInAt === null && participant.status === `registered`) {
                    participant.status = `dropped`;
                    participant.checkInState = `missed`;
                    participant.removedAt ??= now;
                    droppedCount += 1;
                    changed = true;
                }
            }

            const hasWaitlistedPlayers = tournament.participants.some((p) => p.status === `waitlisted`);
            if (droppedCount > 0 && hasWaitlistedPlayers && tournament.waitlistEnabled) {
                // Open waitlist window instead of starting immediately
                tournament.status = `waitlist-open`;
                tournament.waitlistOpensAt = now;
                tournament.waitlistClosesAt = now + tournament.waitlistCheckInMinutes * 60_000;
                tournament.updatedAt = now;
                tournament.activity.unshift(createTournamentActivity(
                    null, `waitlist-opened`,
                    `${droppedCount} player${droppedCount === 1 ? `` : `s`} didn't check in. Waitlist check-in is open for ${tournament.waitlistCheckInMinutes} minute${tournament.waitlistCheckInMinutes === 1 ? `` : `s`}.`,
                ));

                // Notify waitlisted players
                for (const participant of tournament.participants) {
                    if (participant.status === `waitlisted`) {
                        this.socketServerGateway.emitTournamentNotification(participant.profileId, {
                            tournamentId: tournament.id,
                            kind: `waitlist-open`,
                            message: `Spots opened up in "${tournament.name}"! Check in now to claim a spot.`,
                        } satisfies TournamentNotificationEvent);
                    }
                }
                changed = true;
            } else if (countCheckedInParticipants(tournament) >= getMinimumParticipantsToStart(tournament.format)) {
                // Drop remaining waitlisted players
                for (const participant of tournament.participants) {
                    if (participant.status === `waitlisted`) {
                        participant.status = `dropped`;
                        participant.removedAt ??= now;
                    }
                }
                await this.startTournamentRecord(tournament, null);
                changed = true;
            } else {
                tournament.status = `cancelled`;
                tournament.cancelledAt = now;
                tournament.activity.unshift(createTournamentActivity(
                    null,
                    `tournament-cancelled`,
                    `Cancelled automatically — fewer than ${getMinimumParticipantsToStart(tournament.format)} player${getMinimumParticipantsToStart(tournament.format) === 1 ? `` : `s`} checked in.`,
                ));
                changed = true;
            }
        }

        if (tournament.status === `waitlist-open` && now >= (tournament.waitlistClosesAt ?? 0)) {
            // Waitlist window has closed — drop remaining waitlisted players and start
            for (const participant of tournament.participants) {
                if (participant.status === `waitlisted`) {
                    participant.status = `dropped`;
                    participant.removedAt ??= now;
                }
            }

            if (countCheckedInParticipants(tournament) >= getMinimumParticipantsToStart(tournament.format)) {
                tournament.activity.unshift(createTournamentActivity(null, `waitlist-closed`, `Waitlist check-in closed.`));
                await this.startTournamentRecord(tournament, null);
                changed = true;
            } else {
                tournament.status = `cancelled`;
                tournament.cancelledAt = now;
                tournament.activity.unshift(createTournamentActivity(
                    null,
                    `tournament-cancelled`,
                    `Cancelled automatically — fewer than ${getMinimumParticipantsToStart(tournament.format)} player${getMinimumParticipantsToStart(tournament.format) === 1 ? `` : `s`} checked in after waitlist.`,
                ));
                changed = true;
            }
        }

        if (tournament.status === `live`) {
            changed = await this.reconcileLiveTournamentRecord(tournament) || changed;
            changed = this.checkMatchTimeouts(tournament) || changed;
        }

        changed = this.refreshParticipantStatuses(tournament) || changed;

        if (changed) {
            tournament.updatedAt = Date.now();
        }

        if (tournament.activity.length > 200) {
            tournament.activity = tournament.activity.slice(0, 200);
        }

        await this.tournamentRepository.saveTournament(tournament);
    }

    private canMatchBecomeReady(tournament: TournamentRecord, match: TournamentMatch): boolean {
        if (tournament.roundDelayMinutes <= 0) return true;
        if (match.round <= 1) return true;

        const previousRoundMatches = tournament.matches.filter(
            (m) => m.bracket === match.bracket && m.round === match.round - 1,
        );
        if (previousRoundMatches.length === 0) return true;

        const allPreviousCompleted = previousRoundMatches.every((m) => m.state === `completed`);
        if (!allPreviousCompleted) return true;

        const latestResolvedAt = Math.max(...previousRoundMatches.map((m) => m.resolvedAt ?? 0));
        return Date.now() >= latestResolvedAt + tournament.roundDelayMinutes * 60_000;
    }

    private async reconcileLiveTournamentRecord(tournament: TournamentRecord): Promise<boolean> {
        if (tournament.format === `swiss`) {
            return await this.reconcileSwissTournament(tournament);
        }

        if (tournament.format === `single-elimination`) {
            return await this.reconcileSingleEliminationTournament(tournament);
        }

        return await this.reconcileDoubleEliminationTournament(tournament);
    }

    private async reconcileSingleEliminationTournament(tournament: TournamentRecord): Promise<boolean> {
        let changed = false;
        let shouldContinue = true;

        while (shouldContinue) {
            shouldContinue = false;
            const winnersMatches = tournament.matches
                .filter((m) => m.bracket === `winners` || m.bracket === `third-place`)
                .sort((a, b) => a.round - b.round || a.order - b.order);

            for (const match of winnersMatches) {
                if (match.state === `pending`) {
                    const hydrated = this.hydrateMatchSlotsFromSources(tournament, match);
                    changed ||= hydrated;

                    const bothFilled = match.slots.every((s) => s.profileId !== null);
                    const hasBye = match.slots.some((s) => s.isBye);

                    if (bothFilled && !hasBye && this.canMatchBecomeReady(tournament, match)) {
                        match.state = `ready`;
                        changed = true;
                    } else if (hasBye && match.slots.some((s) => s.profileId && !s.isBye)) {
                        const actualPlayer = match.slots.find((s) => s.profileId && !s.isBye)!;
                        this.completeMatchSet(tournament, match, actualPlayer.profileId!, `bye`);
                        changed = true;
                        shouldContinue = true;
                        continue;
                    }
                }

                if (match.state === `ready` || match.state === `in-progress`) {
                    const matchChanged = await this.reconcileSessionForMatch(tournament, match);
                    changed ||= matchChanged;
                    if (match.winnerProfileId) {
                        shouldContinue = true;
                    }
                }
            }
        }

        return this.ensureSingleEliminationTournamentCompletion(tournament) || changed;
    }

    private ensureSingleEliminationTournamentCompletion(tournament: TournamentRecord): boolean {
        if (tournament.status !== `live`) return false;

        // Find the final match (highest round, winners bracket)
        const winnersMatches = tournament.matches.filter((m) => m.bracket === `winners`);
        const maxRound = Math.max(0, ...winnersMatches.map((m) => m.round));
        const finalMatch = winnersMatches.find((m) => m.round === maxRound);

        if (!finalMatch || finalMatch.state !== `completed` || !finalMatch.winnerProfileId) {
            return false;
        }

        // If third-place match is enabled, it must also be completed
        if (tournament.thirdPlaceMatchEnabled) {
            const thirdPlaceMatch = tournament.matches.find((m) => m.bracket === `third-place`);
            if (thirdPlaceMatch && thirdPlaceMatch.state !== `completed`) {
                return false;
            }
        }

        tournament.status = `completed`;
        tournament.completedAt = Date.now();
        tournament.updatedAt = Date.now();
        tournament.activity.unshift(createTournamentActivity(
            null,
            `tournament-completed`,
            `${getParticipantSnapshot(tournament, finalMatch.winnerProfileId)?.displayName ?? `A player`} won the tournament.`,
        ));
        return true;
    }

    private async reconcileDoubleEliminationTournament(tournament: TournamentRecord): Promise<boolean> {
        let changed = false;
        let shouldContinue = true;
        while (shouldContinue) {
            shouldContinue = false;
            for (const match of tournament.matches) {
                changed = this.hydrateMatchSlotsFromSources(tournament, match) || changed;

                if (match.state === `pending`) {
                    const actualPlayers = match.slots.filter((slot) => slot.profileId !== null);
                    const byeSlots = match.slots.filter((slot) => slot.isBye);
                    if (actualPlayers.length === 2 && this.canMatchBecomeReady(tournament, match)) {
                        match.state = `ready`;
                        changed = true;
                    } else if (actualPlayers.length === 1 && byeSlots.length === 1) {
                        this.completeMatchSet(tournament, match, actualPlayers[0].profileId!, `bye`);
                        shouldContinue = true;
                        changed = true;
                        continue;
                    }
                }

                if (match.state === `ready` || match.state === `in-progress`) {
                    const matchChanged = await this.reconcileSessionForMatch(tournament, match);
                    changed ||= matchChanged;
                    if (match.winnerProfileId) {
                        shouldContinue = true;
                    }
                }
            }
        }

        return this.ensureDoubleEliminationTournamentCompletion(tournament) || changed;
    }

    private async reconcileSwissTournament(tournament: TournamentRecord): Promise<boolean> {
        let changed = false;
        const swissMatches = tournament.matches
            .filter((match) => match.bracket === `swiss`)
            .sort((left, right) => left.round - right.round || left.order - right.order);

        for (const match of swissMatches) {
            if (match.state === `pending`) {
                const actualPlayers = match.slots.filter((slot) => slot.profileId !== null);
                const byeSlots = match.slots.filter((slot) => slot.isBye);
                if (actualPlayers.length === 2 && this.canMatchBecomeReady(tournament, match)) {
                    match.state = `ready`;
                    changed = true;
                } else if (actualPlayers.length === 1 && byeSlots.length === 1) {
                    this.completeMatchSet(tournament, match, actualPlayers[0].profileId!, `bye`);
                    changed = true;
                    continue;
                }
            }

            if (match.state === `ready` || match.state === `in-progress`) {
                changed = await this.reconcileSessionForMatch(tournament, match) || changed;
            }
        }

        const currentRound = Math.max(0, ...swissMatches.map((match) => match.round));
        const totalRounds = tournament.swissRoundCount ?? 0;
        if (currentRound > 0) {
            const currentRoundMatches = swissMatches.filter((match) => match.round === currentRound);
            const allCurrentRoundMatchesCompleted = currentRoundMatches.length > 0 && currentRoundMatches.every((match) => match.state === `completed`);
            const nextRoundAlreadyExists = swissMatches.some((match) => match.round === currentRound + 1);

            if (allCurrentRoundMatchesCompleted && currentRound < totalRounds && !nextRoundAlreadyExists) {
                const activeParticipants = tournament.participants
                    .filter((participant) => isActiveParticipant(participant) && participant.checkedInAt !== null && participant.seed !== null)
                    .map((participant) => ({
                        ...participant,
                        seed: participant.seed ?? 1,
                    }));

                if (activeParticipants.length >= 2) {
                    tournament.matches.push(...buildSwissRoundMatches({
                        participants: activeParticipants,
                        existingMatches: swissMatches,
                        round: currentRound + 1,
                        totalRounds,
                        seriesSettings: tournament.seriesSettings,
                    }));
                    tournament.activity.unshift(createTournamentActivity(null, `swiss-round-created`, `Created Swiss round ${currentRound + 1}.`));
                    changed = true;
                }
            }
        }

        return this.ensureSwissTournamentCompletion(tournament) || changed;
    }

    private hydrateMatchSlotsFromSources(tournament: TournamentRecord, match: TournamentMatch): boolean {
        let changed = false;
        for (const [slotIndex, slot] of match.slots.entries()) {
            const source = slot.source;
            if (!source || source.type === `seed`) {
                continue;
            }

            const sourceMatch = tournament.matches.find((entry) => entry.id === source.matchId);
            if (sourceMatch?.state !== `completed`) {
                continue;
            }

            const profileId = source.type === `winner`
                ? sourceMatch.winnerProfileId
                : sourceMatch.loserProfileId;
            const participant = getParticipantSnapshot(tournament, profileId);
            const isDropped = participant && !isActiveParticipant(participant);
            const nextSlot: TournamentMatchSlot = participant && !isDropped
                ? {
                    source,
                    profileId: participant.profileId,
                    displayName: participant.displayName,
                    image: participant.image,
                    seed: participant.seed,
                    isBye: false,
                }
                : {
                    source,
                    profileId: null,
                    displayName: `BYE`,
                    image: null,
                    seed: null,
                    isBye: true,
                };

            const currentSlot = match.slots[slotIndex];
            if (
                currentSlot.profileId !== nextSlot.profileId
                || currentSlot.isBye !== nextSlot.isBye
                || currentSlot.displayName !== nextSlot.displayName
            ) {
                match.slots[slotIndex] = nextSlot;
                changed = true;
            }
        }

        return changed;
    }

    private async reconcileSessionForMatch(tournament: TournamentRecord, match: TournamentMatch): Promise<boolean> {
        if (match.sessionId) {
            const session = this.sessionManager.getSessionInfo(match.sessionId);
            if (session) {
                if (session.state.status === `finished`) {
                    const winnerProfileId = this.resolveProfileIdFromFinishedSession(session, session.state.winningPlayerId);
                    if (!winnerProfileId) {
                        throw new SessionError(`Failed to resolve the winner for a tournament match.`);
                    }

                    this.applyFinishedGameToMatch(tournament, match, session.state.gameId, winnerProfileId);
                    return true;
                }

                if (match.state !== `in-progress`) {
                    match.state = `in-progress`;
                    match.startedAt ??= Date.now();
                    return true;
                }

                return false;
            }

            /* Session is gone — try to recover the result from game history */
            const recoveredGame = match.gameIds.length > 0
                ? await this.gameHistoryRepository.getFinishedGame(match.gameIds[match.gameIds.length - 1])
                : await this.gameHistoryRepository.getFinishedGameBySessionId(match.sessionId);
            if (recoveredGame?.gameResult?.winningPlayerId) {
                const winnerProfileId = recoveredGame.players.find((player) => player.playerId === recoveredGame.gameResult?.winningPlayerId)?.profileId ?? null;
                if (winnerProfileId) {
                    this.applyFinishedGameToMatch(tournament, match, recoveredGame.id, winnerProfileId);
                    return true;
                }
            }

            match.sessionId = null;
            match.state = `ready`;
            match.startedAt = null;
            return true;
        }

        if (match.state !== `ready`) {
            return false;
        }

        const [leftSlot, rightSlot] = match.slots;
        if (!leftSlot.profileId || !rightSlot.profileId) {
            return false;
        }

        try {
            const response = this.sessionManager.createSession({
                client: kTournamentSystemClient,
                lobbyOptions: {
                    visibility: `private`,
                    timeControl: { ...tournament.timeControl },
                    rated: false,
                },
                reservedPlayerProfileIds: this.getReservedSeatOrder(match),
                tournament: this.toSessionTournamentInfo(tournament, match),
            } satisfies CreateSessionParams);

            match.sessionId = response.sessionId;
            match.state = `in-progress`;
            match.startedAt ??= Date.now();
            this.notifyMatchReady(tournament, match);
            return true;
        } catch (error: unknown) {
            if (error instanceof SessionError) {
                return false;
            }

            throw error;
        }
    }

    private getReservedSeatOrder(match: TournamentMatch): string[] {
        const [leftSlot, rightSlot] = match.slots;
        const shouldSwapSeats = match.currentGameNumber % 2 === 0;
        const orderedSlots = shouldSwapSeats ? [rightSlot, leftSlot] : [leftSlot, rightSlot];
        return orderedSlots.flatMap((slot) => slot.profileId ? [slot.profileId] : []);
    }

    private applyFinishedGameToMatch(
        tournament: TournamentRecord,
        match: TournamentMatch,
        gameId: string,
        winnerProfileId: string,
    ) {
        if (match.gameIds.includes(gameId)) {
            return;
        }
        match.gameIds.push(gameId);

        const winnerSlotIndex = match.slots.findIndex((slot) => slot.profileId === winnerProfileId);
        if (winnerSlotIndex === -1) {
            throw new SessionError(`Tournament match winner did not belong to the recorded player slots.`);
        }

        if (winnerSlotIndex === 0) {
            match.leftWins += 1;
        } else {
            match.rightWins += 1;
        }

        match.currentGameNumber = match.gameIds.length + 1;
        match.sessionId = null;
        if (match.leftWins >= getWinsRequired(match.bestOf) || match.rightWins >= getWinsRequired(match.bestOf)) {
            this.completeMatchSet(tournament, match, winnerProfileId, `played`);
        } else {
            match.state = `ready`;
        }
    }

    /**
     * Forfeit all pending/ready/in-progress matches for a player, then reconcile
     * and repeat to catch new matches created by bracket progression (e.g. losers
     * bracket in DE). Matches where the opponent is still TBD have the player's
     * slot cleared so reconciliation doesn't carry them forward.
     */
    private async forfeitAllMatchesForPlayer(tournament: TournamentRecord, profileId: string): Promise<void> {
        let changed = true;
        while (changed) {
            changed = false;
            for (const match of tournament.matches) {
                if ((match.state === `pending` || match.state === `ready` || match.state === `in-progress`) && matchContainsProfileId(match, profileId)) {
                    const opponentSlot = match.slots.find((s) => s.profileId && s.profileId !== profileId && !s.isBye);
                    if (opponentSlot?.profileId) {
                        this.completeMatchSet(tournament, match, opponentSlot.profileId, `walkover`);
                        changed = true;
                    }
                    // If opponent is TBD, the slot will be converted to a BYE
                    // by hydrateMatchSlotsFromSources once the participant is
                    // marked as dropped (isActiveParticipant check).
                }
            }
            if (changed) {
                await this.reconcileTournamentRecord(tournament);
            }
        }
    }

    private completeMatchSet(
        tournament: TournamentRecord,
        match: TournamentMatch,
        winnerProfileId: string,
        resultType: TournamentMatch[`resultType`],
    ) {
        const winnerSlot = match.slots.find((slot) => slot.profileId === winnerProfileId && !slot.isBye) ?? null;
        if (!winnerSlot) {
            throw new SessionError(`Tournament match winner did not belong to the recorded player slots.`);
        }

        const loserSlot = match.slots.find((slot) => slot.profileId !== winnerProfileId && !slot.isBye) ?? null;
        match.winnerProfileId = winnerProfileId;
        match.loserProfileId = loserSlot?.profileId ?? null;
        match.resultType = resultType;
        match.state = `completed`;
        match.resolvedAt = Date.now();
        match.sessionId = null;

        if (match.bracket === `grand-final` && tournament.seriesSettings.grandFinalResetEnabled) {
            const winnersSlot = match.slots.find((slot) => slot.source?.type === `winner` && slot.source.matchId.includes(`winners`));
            const losersSlot = match.slots.find((slot) => slot.source?.type === `winner` && slot.source.matchId.includes(`losers`));
            const winnerBracketChampion = winnersSlot?.profileId ?? match.slots[0].profileId;
            const loserBracketChampion = losersSlot?.profileId ?? match.slots[1].profileId;
            const resetAlreadyExists = tournament.matches.some((entry) => entry.bracket === `grand-final-reset`);
            if (
                winnerBracketChampion
                && loserBracketChampion
                && winnerProfileId === loserBracketChampion
                && !resetAlreadyExists
            ) {
                tournament.matches.push({
                    id: `match-grand-final-reset-1-1`,
                    bracket: `grand-final-reset`,
                    round: 1,
                    order: 1,
                    state: `ready`,
                    bestOf: tournament.seriesSettings.grandFinalBestOf,
                    slots: match.slots.map((slot) => ({
                        ...slot,
                        source: null,
                    })) as [TournamentMatchSlot, TournamentMatchSlot],
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
                });
            }
        }
    }

    private ensureDoubleEliminationTournamentCompletion(tournament: TournamentRecord): boolean {
        if (tournament.status !== `live`) {
            return false;
        }

        const grandFinalReset = tournament.matches.find((match) => match.bracket === `grand-final-reset`) ?? null;
        if (grandFinalReset?.state === `completed` && grandFinalReset.winnerProfileId) {
            tournament.status = `completed`;
            tournament.completedAt = Date.now();
            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(
                null,
                `tournament-completed`,
                `${getParticipantSnapshot(tournament, grandFinalReset.winnerProfileId)?.displayName ?? `A player`} won the tournament.`,
            ));
            return true;
        }

        const grandFinal = tournament.matches.find((match) => match.bracket === `grand-final`) ?? null;
        if (grandFinal?.state !== `completed` || !grandFinal.winnerProfileId) {
            return false;
        }

        const losersFinalistProfileId = grandFinal.slots[1].profileId;
        if (tournament.seriesSettings.grandFinalResetEnabled && losersFinalistProfileId && grandFinal.winnerProfileId === losersFinalistProfileId) {
            return false;
        }

        tournament.status = `completed`;
        tournament.completedAt = Date.now();
        tournament.updatedAt = Date.now();
        tournament.activity.unshift(createTournamentActivity(
            null,
            `tournament-completed`,
            `${getParticipantSnapshot(tournament, grandFinal.winnerProfileId)?.displayName ?? `A player`} won the tournament.`,
        ));
        return true;
    }

    private ensureSwissTournamentCompletion(tournament: TournamentRecord): boolean {
        if (tournament.status !== `live` || tournament.format !== `swiss`) {
            return false;
        }

        const totalRounds = tournament.swissRoundCount ?? 0;
        const swissMatches = tournament.matches.filter((match) => match.bracket === `swiss`);
        const highestRound = Math.max(0, ...swissMatches.map((match) => match.round));
        const allMatchesCompleted = swissMatches.length > 0 && swissMatches.every((match) => match.state === `completed`);
        if (!allMatchesCompleted) {
            return false;
        }

        const activeParticipants = tournament.participants.filter((participant) => isActiveParticipant(participant) && participant.checkedInAt !== null);
        if (highestRound < totalRounds && activeParticipants.length >= 2) {
            return false;
        }

        const standings = getTournamentStandings(tournament);
        const winner = standings[0] ?? null;
        tournament.status = `completed`;
        tournament.completedAt = Date.now();
        tournament.updatedAt = Date.now();
        tournament.activity.unshift(createTournamentActivity(
            null,
            `tournament-completed`,
            `${winner?.displayName ?? `A player`} won the tournament.`,
        ));
        return true;
    }

    private refreshParticipantStatuses(tournament: TournamentRecord): boolean {
        if (tournament.format === `swiss`) {
            return this.refreshSwissParticipantStatuses(tournament);
        }

        if (tournament.format === `single-elimination`) {
            return this.refreshSingleEliminationParticipantStatuses(tournament);
        }

        return this.refreshDoubleEliminationParticipantStatuses(tournament);
    }

    private refreshSwissParticipantStatuses(tournament: TournamentRecord): boolean {
        let changed = false;
        for (const participant of tournament.participants) {
            if (participant.status === `removed` || participant.status === `dropped`) {
                continue;
            }

            const nextStatus = participant.checkedInAt === null
                ? participant.status
                : tournament.status === `completed`
                    ? `completed`
                    : `checked-in`;
            if (participant.status !== nextStatus) {
                participant.status = nextStatus;
                changed = true;
            }

            if (participant.status === `completed`) {
                participant.eliminatedAt = null;
            }
        }

        return changed;
    }

    private refreshSingleEliminationParticipantStatuses(tournament: TournamentRecord): boolean {
        let changed = false;
        const lossesByProfileId = new Map<string, number>();
        const activeMatchProfileIds = new Set<string>();

        for (const match of tournament.matches) {
            if (match.loserProfileId) {
                lossesByProfileId.set(match.loserProfileId, (lossesByProfileId.get(match.loserProfileId) ?? 0) + 1);
            }

            if (match.state === `completed`) {
                continue;
            }

            for (const slot of match.slots) {
                if (slot.profileId && !slot.isBye) {
                    activeMatchProfileIds.add(slot.profileId);
                }
            }
        }

        const winnersMatches = tournament.matches.filter((match) => match.bracket === `winners`);
        const finalRound = winnersMatches.reduce((max, match) => Math.max(max, match.round), 0);
        const finalMatch = winnersMatches.find((match) => match.round === finalRound && match.state === `completed`) ?? null;
        const winnerProfileId = tournament.status === `completed`
            ? finalMatch?.winnerProfileId ?? null
            : null;

        for (const participant of tournament.participants) {
            if (participant.status === `removed` || participant.status === `dropped`) {
                continue;
            }

            let nextStatus = participant.status;
            let nextEliminatedAt = participant.eliminatedAt;

            if (winnerProfileId && participant.profileId === winnerProfileId) {
                nextStatus = `completed`;
                nextEliminatedAt = null;
            } else if (activeMatchProfileIds.has(participant.profileId)) {
                if (participant.checkedInAt) {
                    nextStatus = `checked-in`;
                    nextEliminatedAt = null;
                }
            } else {
                const losses = lossesByProfileId.get(participant.profileId) ?? 0;
                if (losses >= 1 || (tournament.status === `completed` && participant.profileId !== winnerProfileId)) {
                    nextStatus = `eliminated`;
                    nextEliminatedAt = nextEliminatedAt ?? Date.now();
                } else if (participant.checkedInAt) {
                    nextStatus = `checked-in`;
                    nextEliminatedAt = null;
                }
            }

            if (participant.status !== nextStatus || participant.eliminatedAt !== nextEliminatedAt) {
                participant.status = nextStatus;
                participant.eliminatedAt = nextEliminatedAt;
                changed = true;
            }
        }

        return changed;
    }

    private refreshDoubleEliminationParticipantStatuses(tournament: TournamentRecord): boolean {
        let changed = false;
        const lossesByProfileId = new Map<string, number>();
        for (const match of tournament.matches) {
            if (!match.loserProfileId) {
                continue;
            }

            lossesByProfileId.set(match.loserProfileId, (lossesByProfileId.get(match.loserProfileId) ?? 0) + 1);
        }

        const winnerProfileId = tournament.status === `completed`
            ? (tournament.matches.find((match) => match.bracket === `grand-final-reset` && match.state === `completed`)?.winnerProfileId
                ?? tournament.matches.find((match) => match.bracket === `grand-final` && match.state === `completed`)?.winnerProfileId
                ?? null)
            : null;

        for (const participant of tournament.participants) {
            if (participant.status === `removed` || participant.status === `dropped`) {
                continue;
            }

            let nextStatus = participant.status;
            let nextEliminatedAt = participant.eliminatedAt;

            if (winnerProfileId && participant.profileId === winnerProfileId) {
                nextStatus = `completed`;
                nextEliminatedAt = null;
            } else {
                const losses = lossesByProfileId.get(participant.profileId) ?? 0;
                if (losses >= 2 || (tournament.status === `completed` && participant.profileId !== winnerProfileId)) {
                    nextStatus = `eliminated`;
                    nextEliminatedAt = nextEliminatedAt ?? Date.now();
                } else if (participant.checkedInAt) {
                    nextStatus = `checked-in`;
                    nextEliminatedAt = null;
                }
            }

            if (participant.status !== nextStatus || participant.eliminatedAt !== nextEliminatedAt) {
                participant.status = nextStatus;
                participant.eliminatedAt = nextEliminatedAt;
                changed = true;
            }
        }

        return changed;
    }

    private replaceProfileInMatches(
        tournament: TournamentRecord,
        oldProfileId: string,
        nextProfileId: string | null,
        nextDisplayName: string,
        nextImage: string | null,
    ) {
        for (const match of tournament.matches) {
            if (matchHasStarted(match)) {
                continue;
            }

            for (const slot of match.slots) {
                if (slot.profileId !== oldProfileId) {
                    continue;
                }

                slot.profileId = nextProfileId;
                slot.displayName = nextDisplayName;
                slot.image = nextImage;
                slot.isBye = nextProfileId === null;
            }

            if (match.state !== `completed`) {
                match.sessionId = null;
                match.state = `pending`;
            }
        }
    }

    private assertParticipantEditable(tournament: TournamentRecord, profileId: string) {
        const startedMatches = tournament.matches.filter((match) => matchContainsProfileId(match, profileId) && matchHasStarted(match));
        if (startedMatches.length > 0) {
            throw new SessionError(`This player can no longer be edited because one of their assigned matches has already started.`);
        }
    }

    private resolveProfileIdFromFinishedSession(session: SessionInfo, winningParticipantId: string | null): string | null {
        if (!winningParticipantId) {
            return null;
        }

        return session.players.find((player) => player.id === winningParticipantId)?.profileId ?? null;
    }

    private toSessionTournamentInfo(tournament: TournamentRecord, match: TournamentMatch): SessionTournamentInfo {
        return {
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            matchId: match.id,
            bracket: match.bracket,
            round: match.round,
            order: match.order,
            bestOf: match.bestOf,
            currentGameNumber: match.currentGameNumber,
            leftWins: match.leftWins,
            rightWins: match.rightWins,
            matchJoinTimeoutMs: tournament.matchJoinTimeoutMinutes * 60_000,
            matchStartedAt: match.startedAt ?? Date.now(),
            leftDisplayName: match.slots[0].displayName,
            rightDisplayName: match.slots[1].displayName,
        };
    }

    private notifyMatchReady(tournament: TournamentRecord, match: TournamentMatch) {
        for (const slot of match.slots) {
            if (!slot.profileId) {
                continue;
            }

            const opponent = match.slots.find((entry) => entry.profileId !== slot.profileId && !entry.isBye) ?? null;
            this.socketServerGateway.emitTournamentNotification(slot.profileId, {
                tournamentId: tournament.id,
                kind: `match-ready`,
                message: opponent
                    ? `Your ${tournament.name} match against ${opponent.displayName} is ready.`
                    : `Your ${tournament.name} match is ready.`,
            });
        }
    }

    private async requireTournament(tournamentId: string): Promise<TournamentRecord> {
        const tournament = await this.tournamentRepository.getTournament(tournamentId);
        if (!tournament) {
            throw new SessionError(`Tournament not found.`);
        }

        return cloneTournament(tournament);
    }

    private assertCanManageTournament(user: AccountUserProfile, tournament: TournamentRecord) {
        if (!canManageTournament(user, tournament)) {
            throw new SessionError(`You do not have permission to manage this tournament.`);
        }
    }

    async addToAccessList(tournamentId: string, user: AccountUserProfile, list: `whitelist` | `blacklist`, profileId: string): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            if (tournament[list].some((e) => e.profileId === profileId)) {
                throw new SessionError(`This user is already on the ${list}.`);
            }

            const profile = await this.authRepository.getUserProfileById(profileId);
            if (!profile) throw new SessionError(`User not found.`);

            tournament[list].push({ profileId, displayName: profile.username });
            tournament.updatedAt = Date.now();
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async bulkAddToAccessList(
        tournamentId: string,
        user: AccountUserProfile,
        list: `whitelist` | `blacklist`,
        names: string[],
    ): Promise<{ matched: string[]; unmatched: string[] }> {
        const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
        if (uniqueNames.length === 0) return { matched: [], unmatched: [] };

        const profilesByName = await this.authRepository.getUserProfilesByNames(uniqueNames);

        const matched: string[] = [];
        const unmatched: string[] = [];
        const toAdd: { profileId: string; displayName: string }[] = [];

        for (const name of uniqueNames) {
            const profile = profilesByName.get(name.toLowerCase());
            if (profile) {
                matched.push(profile.username);
                toAdd.push({ profileId: profile.id, displayName: profile.username });
            } else {
                unmatched.push(name);
            }
        }

        if (toAdd.length > 0) {
            const tournament = await this.withTournamentLock(tournamentId, async () => {
                const tournament = await this.requireTournament(tournamentId);
                this.assertCanManageTournament(user, tournament);

                const existing = new Set(tournament[list].map((e) => e.profileId));
                for (const entry of toAdd) {
                    if (!existing.has(entry.profileId)) {
                        tournament[list].push(entry);
                        existing.add(entry.profileId);
                    }
                }

                tournament.updatedAt = Date.now();
                await this.tournamentRepository.saveTournament(tournament);
                return tournament;
            });

            this.broadcastTournamentUpdate(tournament);
        }

        return { matched, unmatched };
    }

    async removeFromAccessList(tournamentId: string, user: AccountUserProfile, list: `whitelist` | `blacklist`, profileId: string): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            tournament[list] = tournament[list].filter((e) => e.profileId !== profileId);
            tournament.updatedAt = Date.now();
            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    private async resolveAccessEntries(profileIds: string[]): Promise<TournamentRecord[`whitelist`]> {
        if (profileIds.length === 0) return [];
        const profiles = await this.authRepository.getUserProfilesByIds(profileIds);
        return profileIds
            .filter((id) => profiles.has(id))
            .map((id) => ({ profileId: id, displayName: profiles.get(id)!.username }));
    }

    private async computePlayerStats(userId: string): Promise<TournamentPlayerStats> {
        const [completedTournaments, createdCount] = await Promise.all([
            this.tournamentRepository.getCompletedTournamentsForPlayer(userId),
            this.tournamentRepository.countTournamentsCreatedByUser(userId),
        ]);

        let matchesWon = 0;
        let matchesLost = 0;
        let bestPlacement: TournamentPlayerStats[`bestPlacement`] = null;

        for (const tournament of completedTournaments) {
            for (const match of tournament.matches) {
                if (match.state !== `completed` || !match.winnerProfileId) continue;
                if (!match.slots.some((s) => s.profileId === userId)) continue;
                if (match.winnerProfileId === userId) matchesWon += 1;
                else matchesLost += 1;
            }

            const rank = this.getPlayerFinalRank(tournament, userId);
            if (rank !== null && (bestPlacement === null || rank < bestPlacement.rank)) {
                bestPlacement = { rank, tournamentName: tournament.name };
            }
        }

        const totalMatches = matchesWon + matchesLost;
        return {
            tournamentsPlayed: completedTournaments.length,
            matchesWon,
            matchesLost,
            winRate: totalMatches > 0 ? Math.round((matchesWon / totalMatches) * 100) : 0,
            bestPlacement,
            tournamentsCreated: createdCount,
        };
    }

    private getPlayerFinalRank(tournament: TournamentRecord, userId: string): number | null {
        if (tournament.format === `swiss`) {
            const standings = calculateSwissStandings(
                tournament.participants.filter((p) => p.status !== `removed`),
                tournament.matches,
            );
            return standings.find((s) => s.profileId === userId)?.rank ?? null;
        }

        const completedMatches = tournament.matches
            .filter((m) => m.state === `completed` && m.slots.some((s) => s.profileId === userId));
        if (completedMatches.length === 0) return null;

        const bracketOrder: Record<string, number> = { 'grand-final-reset': 4, 'grand-final': 3, 'winners': 2, 'losers': 1, 'swiss': 0 };
        const lastMatch = completedMatches.sort((a, b) =>
            (bracketOrder[b.bracket] ?? 0) - (bracketOrder[a.bracket] ?? 0) || b.round - a.round,
        )[0]!;

        if (lastMatch.winnerProfileId === userId) {
            if (lastMatch.bracket === `grand-final` || lastMatch.bracket === `grand-final-reset`) return 1;
            if (lastMatch.bracket === `winners` && lastMatch.round === Math.log2(tournament.maxPlayers)) return 1;
        }
        if (lastMatch.bracket === `grand-final` || lastMatch.bracket === `grand-final-reset`) return 2;
        return null;
    }

    private computeUpcomingMatches(activeRecords: TournamentRecord[], userId: string): TournamentUpcomingMatch[] {
        const result: TournamentUpcomingMatch[] = [];
        for (const t of activeRecords) {
            const nextMatch = getNextMatchForUser(t, userId);
            if (!nextMatch) continue;
            const match = t.matches.find((m) => m.id === nextMatch.matchId);
            result.push({
                tournamentId: t.id,
                tournamentName: t.name,
                matchId: nextMatch.matchId,
                matchState: match?.state ?? `ready`,
                bracket: nextMatch.bracket,
                round: nextMatch.round,
                order: nextMatch.order,
                bestOf: nextMatch.bestOf,
                sessionId: nextMatch.sessionId,
                opponentDisplayName: nextMatch.opponentDisplayName,
                leftWins: nextMatch.leftWins,
                rightWins: nextMatch.rightWins,
            });
        }
        return result;
    }

    private broadcastTournamentUpdate(tournament: TournamentRecord) {
        this.socketServerGateway.emitTournamentUpdated({
            tournamentId: tournament.id,
            updatedAt: tournament.updatedAt,
        });
    }

    private getTournamentMutex(tournamentId: string): Mutex {
        const existingMutex = this.tournamentLocks.get(tournamentId);
        if (existingMutex) {
            return existingMutex;
        }

        const mutex = new Mutex();
        this.tournamentLocks.set(tournamentId, mutex);
        return mutex;
    }

    private async withTournamentLock<T>(tournamentId: string, callback: () => Promise<T>): Promise<T> {
        const mutex = this.getTournamentMutex(tournamentId);
        return await mutex.runExclusive(callback);
    }

    /* ── Timeout / Extension ──────────────────────────── */

    private checkMatchTimeouts(tournament: TournamentRecord): boolean {
        if (tournament.matchJoinTimeoutMinutes === 0) {
            return false;
        }

        const now = Date.now();
        const timeoutMs = tournament.matchJoinTimeoutMinutes * 60_000;
        let changed = false;

        for (const match of tournament.matches) {
            if (match.state !== `in-progress` || !match.startedAt || !match.sessionId) {
                continue;
            }

            const elapsed = now - match.startedAt;
            if (elapsed < timeoutMs) {
                continue;
            }

            const session = this.sessionManager.getSessionInfo(match.sessionId);
            if (!session) {
                continue;
            }

            // Check if both players have actually connected
            const connectedPlayerCount = session.players.filter((p) => p.connection.status === `connected`).length;
            if (connectedPlayerCount >= 2) {
                // Cancel any active claim — opponent joined
                if (this.activeClaimWins.has(match.id)) {
                    this.cancelClaimWin(match.id, match.sessionId);
                    tournament.activity.unshift(createTournamentActivity(
                        null,
                        `claim-win-cancelled`,
                        `Win claim cancelled for match ${match.order} — both players connected.`,
                    ));
                    changed = true;
                }

                continue;
            }

            // Already sent a warning for this match since the current timeout window started?
            const timeoutWarningMessage = `Match ${match.order} in round ${match.round} timed out — waiting for player(s) to join.`;
            const alreadyWarned = tournament.activity.some((activity) =>
                activity.type === `timeout-warning`
                && activity.message === timeoutWarningMessage
                && activity.timestamp >= match.startedAt!);
            if (alreadyWarned) {
                continue;
            }

            // Check if there's a pending or approved extension for this match
            const hasActiveExtension = tournament.extensionRequests.some((r) =>
                r.matchId === match.id && (r.status === `pending` || (r.status === `approved` && now - r.resolvedAt! < timeoutMs)));
            if (hasActiveExtension) {
                continue;
            }

            // Notify missing player(s) and organizer
            const missingSlots = match.slots.filter((slot) => {
                if (!slot.profileId || slot.isBye) return false;
                return !session.players.some((p) => p.profileId === slot.profileId && p.connection.status === `connected`);
            });

            for (const slot of missingSlots) {
                if (slot.profileId) {
                    this.socketServerGateway.emitTournamentNotification(slot.profileId, {
                        tournamentId: tournament.id,
                        kind: `timeout-warning`,
                        message: `Your match in ${tournament.name} is waiting for you. Join now or request an extension.`,
                    } satisfies TournamentNotificationEvent);
                }
            }

            tournament.activity.unshift(createTournamentActivity(
                null, 
                `timeout-warning`,
                timeoutWarningMessage,
            ));
            changed = true;
        }

        return changed;
    }

    getActiveClaimWin(matchId: string): MatchClaimWinState | null {
        const claim = this.activeClaimWins.get(matchId);
        if (!claim) {
            return null;
        }

        return {
            matchId: claim.matchId,
            claimantProfileId: claim.claimantProfileId,
            startedAt: claim.startedAt,
            expiresAt: claim.expiresAt,
        };
    }

    async claimWin(tournamentId: string, matchId: string, user: AccountUserProfile): Promise<MatchClaimWinState> {
        return await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            if (tournament.matchJoinTimeoutMinutes === 0) {
                throw new SessionError(`Win claims are not available when there is no join timeout.`);
            }
            if (tournament.status !== `live`) {
                throw new SessionError(`Win claims are only available during live tournaments.`);
            }

            const match = getMatchById(tournament, matchId);
            if (match.state !== `in-progress` || !match.sessionId || !match.startedAt) {
                throw new SessionError(`This match is not eligible for a win claim.`);
            }

            if (!matchContainsProfileId(match, user.id)) {
                throw new SessionError(`You are not a participant in this match.`);
            }

            // Check the join timeout has actually expired
            const timeoutMs = tournament.matchJoinTimeoutMinutes * 60_000;
            const hasActiveExtension = tournament.extensionRequests.some((r) =>
                r.matchId === matchId && (r.status === `approved` && Date.now() - r.resolvedAt! < timeoutMs));
            const effectiveStartedAt = hasActiveExtension
                ? tournament.extensionRequests
                    .filter((r) => r.matchId === matchId && r.status === `approved`)
                    .reduce((latest, r) => Math.max(latest, r.resolvedAt!), match.startedAt)
                : match.startedAt;

            if (Date.now() - effectiveStartedAt < timeoutMs) {
                throw new SessionError(`The join timeout has not expired yet.`);
            }

            // Check there's no pending extension blocking the claim
            const hasPendingExtension = tournament.extensionRequests.some((r) =>
                r.matchId === matchId && r.status === `pending`);
            if (hasPendingExtension) {
                throw new SessionError(`A pending extension request is blocking this claim. Wait for the organizer to respond.`);
            }

            // Check the claimant is actually in the session
            const session = this.sessionManager.getSessionInfo(match.sessionId);
            if (!session) {
                throw new SessionError(`Session not found.`);
            }

            const claimantConnected = session.players.some((p) =>
                p.profileId === user.id && p.connection.status === `connected`);
            if (!claimantConnected) {
                throw new SessionError(`You must be in the session to claim a win.`);
            }

            // Check both players aren't already connected (game would start)
            const connectedCount = session.players.filter((p) => p.connection.status === `connected`).length;
            if (connectedCount >= 2) {
                throw new SessionError(`Both players are connected. The game should start momentarily.`);
            }

            // Check for existing claim on this match
            if (this.activeClaimWins.has(matchId)) {
                throw new SessionError(`A win claim is already active for this match.`);
            }

            const now = Date.now();
            const expiresAt = now + kClaimWinCountdownMs;
            const claimState: MatchClaimWinState = {
                matchId,
                claimantProfileId: user.id,
                startedAt: now,
                expiresAt,
            };

            const timer = setTimeout(() => {
                void this.resolveClaimWin(tournamentId, matchId);
            }, kClaimWinCountdownMs);

            this.activeClaimWins.set(matchId, {
                tournamentId,
                matchId,
                sessionId: match.sessionId,
                claimantProfileId: user.id,
                startedAt: now,
                expiresAt,
                timer,
            });

            // Broadcast to session
            this.socketServerGateway.emitSessionClaimWin({
                sessionId: match.sessionId,
                state: claimState,
            } satisfies SessionClaimWinEvent);

            // Notify absent opponent
            const opponentSlot = match.slots.find((s) => s.profileId && s.profileId !== user.id && !s.isBye);
            if (opponentSlot?.profileId) {
                this.socketServerGateway.emitTournamentNotification(opponentSlot.profileId, {
                    tournamentId: tournament.id,
                    kind: `claim-win-started`,
                    message: `Your opponent is claiming a win in ${tournament.name}. Join within 30 seconds or forfeit the match.`,
                } satisfies TournamentNotificationEvent);
            }

            tournament.activity.unshift(createTournamentActivity(
                user,
                `claim-win-started`,
                `${user.username} initiated a win claim for match ${match.order} in round ${match.round}.`,
            ));
            tournament.updatedAt = Date.now();
            await this.tournamentRepository.saveTournament(tournament);
            this.broadcastTournamentUpdate(tournament);

            return claimState;
        });
    }

    private cancelClaimWin(matchId: string, sessionId: string) {
        const claim = this.activeClaimWins.get(matchId);
        if (!claim) {
            return;
        }

        clearTimeout(claim.timer);
        this.activeClaimWins.delete(matchId);

        this.socketServerGateway.emitSessionClaimWin({
            sessionId,
            state: null,
        } satisfies SessionClaimWinEvent);
    }

    private async resolveClaimWin(tournamentId: string, matchId: string) {
        await this.withTournamentLock(tournamentId, async () => {
            const claim = this.activeClaimWins.get(matchId);
            if (!claim) {
                return;
            }

            this.activeClaimWins.delete(matchId);

            const tournament = await this.requireTournament(tournamentId);
            const match = tournament.matches.find((m) => m.id === matchId);
            if (!match || match.state !== `in-progress` || !match.sessionId) {
                return;
            }

            // Double-check: if opponent joined in the meantime, cancel
            const session = this.sessionManager.getSessionInfo(match.sessionId);
            if (session) {
                const connectedCount = session.players.filter((p) => p.connection.status === `connected`).length;
                if (connectedCount >= 2) {
                    this.socketServerGateway.emitSessionClaimWin({
                        sessionId: match.sessionId,
                        state: null,
                    } satisfies SessionClaimWinEvent);
                    return;
                }
            }

            // Award walkover to claimant
            this.completeMatchSet(tournament, match, claim.claimantProfileId, `walkover`);
            tournament.activity.unshift(createTournamentActivity(
                null,
                `claim-win-awarded`,
                `Win claim awarded for match ${match.order} in round ${match.round}. Opponent did not join in time.`,
            ));

            await this.reconcileTournamentRecord(tournament);
            tournament.updatedAt = Date.now();
            await this.tournamentRepository.saveTournament(tournament);
            this.broadcastTournamentUpdate(tournament);

            // Notify both players
            for (const slot of match.slots) {
                if (slot.profileId) {
                    const isWinner = slot.profileId === claim.claimantProfileId;
                    this.socketServerGateway.emitTournamentNotification(slot.profileId, {
                        tournamentId: tournament.id,
                        kind: `claim-win-awarded`,
                        message: isWinner
                            ? `Your win claim was awarded. You advance in ${tournament.name}.`
                            : `You forfeited your match in ${tournament.name} by not joining in time.`,
                    } satisfies TournamentNotificationEvent);
                }
            }

            if (match.sessionId) {
                this.socketServerGateway.emitSessionClaimWin({
                    sessionId: match.sessionId,
                    state: null,
                } satisfies SessionClaimWinEvent);
            }
        });
    }

    async requestExtension(tournamentId: string, matchId: string, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            if (tournament.matchJoinTimeoutMinutes === 0) {
                throw new SessionError(`Extensions are not needed when there is no join timeout.`);
            }
            if (tournament.status !== `live`) {
                throw new SessionError(`Extensions can only be requested during live tournaments.`);
            }

            const match = getMatchById(tournament, matchId);
            if (!matchContainsProfileId(match, user.id)) {
                throw new SessionError(`You are not a participant in this match.`);
            }

            if (match.state !== `in-progress` && match.state !== `ready`) {
                throw new SessionError(`This match is not eligible for an extension.`);
            }

            const pendingExtension = tournament.extensionRequests.find((r) =>
                r.matchId === matchId && r.status === `pending`);
            if (pendingExtension) {
                throw new SessionError(`An extension request is already pending for this match.`);
            }

            // Enforce 1 extension per player per match
            const userExtensionCount = tournament.extensionRequests.filter((r) =>
                r.matchId === matchId && r.requestedByProfileId === user.id).length;
            if (userExtensionCount >= 1) {
                throw new SessionError(`You have already used your extension request for this match.`);
            }

            // Cancel any active claim win — extension blocks it
            if (match.sessionId && this.activeClaimWins.has(matchId)) {
                this.cancelClaimWin(matchId, match.sessionId);
            }

            const extensionRequest: TournamentExtensionRequest = {
                id: randomUUID(),
                matchId,
                requestedByProfileId: user.id,
                requestedByDisplayName: user.username,
                requestedAt: Date.now(),
                status: `pending`,
                resolvedByProfileId: null,
                resolvedAt: null,
            };

            tournament.extensionRequests.push(extensionRequest);
            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(
                user, 
                `extension-requested`,
                `${user.username} requested a time extension for match ${match.order} in round ${match.round}.`,
            ));

            // Notify all organizers (creator + per-tournament organizers)
            const organizerIds = new Set([tournament.createdByProfileId, ...tournament.organizers]);
            organizerIds.delete(user.id); // Don't notify the requester if they're an organizer
            for (const organizerId of organizerIds) {
                this.socketServerGateway.emitTournamentNotification(organizerId, {
                    tournamentId: tournament.id,
                    kind: `extension-requested`,
                    message: `${user.username} requested a time extension in ${tournament.name}.`,
                } satisfies TournamentNotificationEvent);
            }

            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }

    async resolveExtension(tournamentId: string, extensionId: string, approve: boolean, user: AccountUserProfile): Promise<TournamentDetail> {
        const tournament = await this.withTournamentLock(tournamentId, async () => {
            const tournament = await this.requireTournament(tournamentId);
            this.assertCanManageTournament(user, tournament);

            const extension = tournament.extensionRequests.find((r) => r.id === extensionId);
            if (!extension) {
                throw new SessionError(`Extension request not found.`);
            }

            if (extension.status !== `pending`) {
                throw new SessionError(`This extension request has already been resolved.`);
            }

            extension.status = approve ? `approved` : `denied`;
            extension.resolvedByProfileId = user.id;
            extension.resolvedAt = Date.now();

            const timeoutMs = tournament.matchJoinTimeoutMinutes * 60_000;
            const timeoutMinutes = tournament.matchJoinTimeoutMinutes;

            if (approve) {
                // Add time on top of the current deadline, don't restart
                const match = tournament.matches.find((m) => m.id === extension.matchId);
                if (match && match.startedAt) {
                    const now = Date.now();
                    const oldDeadline = match.startedAt + timeoutMs;
                    // New startedAt so that new deadline = max(now, oldDeadline) + timeoutMs
                    match.startedAt = Math.max(now, oldDeadline);

                    // Sync the session's tournament info so the waiting player sees the updated timer
                    if (match.sessionId) {
                        this.sessionManager.updateSessionTournamentInfo(match.sessionId, {
                            matchStartedAt: match.startedAt,
                        });

                        // Push a session-updated event so the frontend receives the new matchStartedAt
                        const sessionInfo = this.sessionManager.getSessionInfo(match.sessionId);
                        if (sessionInfo) {
                            this.socketServerGateway.emitSessionUpdated({
                                sessionId: match.sessionId,
                                session: { tournament: sessionInfo.tournament },
                            });
                        }
                    }
                }
            }

            tournament.updatedAt = Date.now();
            tournament.activity.unshift(createTournamentActivity(
                user,
                `extension-resolved`,
                approve
                    ? `Approved time extension for ${extension.requestedByDisplayName} (+${timeoutMinutes} min).`
                    : `Denied time extension for ${extension.requestedByDisplayName}.`,
            ));

            // Notify the requesting player
            this.socketServerGateway.emitTournamentNotification(extension.requestedByProfileId, {
                tournamentId: tournament.id,
                kind: `extension-resolved`,
                message: approve
                    ? `Your extension request in ${tournament.name} was approved (+${timeoutMinutes} min).`
                    : `Your extension request in ${tournament.name} was denied.`,
            } satisfies TournamentNotificationEvent);

            await this.tournamentRepository.saveTournament(tournament);
            return tournament;
        });

        this.broadcastTournamentUpdate(tournament);
        return toDetail(tournament, user);
    }
}
