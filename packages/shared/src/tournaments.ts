import { z } from 'zod';

const zTimestamp = z.number().int();
const zIdentifier = z.string();
const zImage = z.string().nullable();

const zGameTimeControl = z.union([
    z.object({
        mode: z.literal(`unlimited`),
    }),
    z.object({
        mode: z.literal(`turn`),
        turnTimeMs: z.number().int()
            .nonnegative(),
    }),
    z.object({
        mode: z.literal(`match`),
        mainTimeMs: z.number().int()
            .nonnegative(),
        incrementMs: z.number().int()
            .nonnegative(),
    }),
]);
export type TournamentGameTimeControl = z.infer<typeof zGameTimeControl>;

export const TOURNAMENT_BRACKET_SIZES = [
    4, 8, 16, 32, 64, 128, 256,
] as const;
export const zTournamentBracketSize = z.union([
    z.literal(4),
    z.literal(8),
    z.literal(16),
    z.literal(32),
    z.literal(64),
    z.literal(128),
    z.literal(256),
]);
export type TournamentBracketSize = z.infer<typeof zTournamentBracketSize>;

export const zTournamentMaxPlayers = z.number().int().min(2).max(256);
export type TournamentMaxPlayers = z.infer<typeof zTournamentMaxPlayers>;

export const TOURNAMENT_SERIES_BEST_OF_VALUES = [
    1, 3, 5, 7,
] as const;
export const zTournamentSeriesBestOf = z.union([
    z.literal(1),
    z.literal(3),
    z.literal(5),
    z.literal(7),
]);
export type TournamentSeriesBestOf = z.infer<typeof zTournamentSeriesBestOf>;

export const zTournamentKind = z.enum([`official`, `community`]);
export type TournamentKind = z.infer<typeof zTournamentKind>;

export const zTournamentFormat = z.enum([`single-elimination`, `double-elimination`, `swiss`]);
export type TournamentFormat = z.infer<typeof zTournamentFormat>;

export const zTournamentVisibility = z.enum([`public`, `private`]);
export type TournamentVisibility = z.infer<typeof zTournamentVisibility>;

export const zTournamentStatus = z.enum([
    `draft`,
    `registration-open`,
    `check-in-open`,
    `waitlist-open`,
    `live`,
    `completed`,
    `cancelled`,
]);
export type TournamentStatus = z.infer<typeof zTournamentStatus>;

export const zTournamentCheckInState = z.enum([
    `not-open`,
    `pending`,
    `checked-in`,
    `missed`,
]);
export type TournamentCheckInState = z.infer<typeof zTournamentCheckInState>;

export const zTournamentParticipantStatus = z.enum([
    `registered`,
    `checked-in`,
    `waitlisted`,
    `removed`,
    `dropped`,
    `eliminated`,
    `completed`,
]);
export type TournamentParticipantStatus = z.infer<typeof zTournamentParticipantStatus>;

export const zTournamentBracket = z.enum([
    `winners`,
    `losers`,
    `grand-final`,
    `grand-final-reset`,
    `third-place`,
    `swiss`,
]);
export type TournamentBracket = z.infer<typeof zTournamentBracket>;

export const zTournamentMatchState = z.enum([
    `pending`,
    `ready`,
    `in-progress`,
    `completed`,
]);
export type TournamentMatchState = z.infer<typeof zTournamentMatchState>;

export const zTournamentMatchResultType = z.enum([
    `played`,
    `bye`,
    `walkover`,
]);
export type TournamentMatchResultType = z.infer<typeof zTournamentMatchResultType>;

export const zTournamentSeriesSettings = z.object({
    earlyRoundsBestOf: zTournamentSeriesBestOf,
    finalsBestOf: zTournamentSeriesBestOf,
    grandFinalBestOf: zTournamentSeriesBestOf,
    grandFinalResetEnabled: z.boolean().default(false),
});
export type TournamentSeriesSettings = z.infer<typeof zTournamentSeriesSettings>;

export const zTournamentProfileSnapshot = z.object({
    profileId: zIdentifier,
    displayName: z.string(),
    image: zImage,
});
export type TournamentProfileSnapshot = z.infer<typeof zTournamentProfileSnapshot>;

export const zTournamentMatchSlotSource = z.discriminatedUnion(`type`, [
    z.object({
        type: z.literal(`seed`),
        seed: z.number().int()
            .positive(),
    }),
    z.object({
        type: z.literal(`winner`),
        matchId: zIdentifier,
    }),
    z.object({
        type: z.literal(`loser`),
        matchId: zIdentifier,
    }),
]);
export type TournamentMatchSlotSource = z.infer<typeof zTournamentMatchSlotSource>;

export const zTournamentMatchAdvanceTarget = z.object({
    matchId: zIdentifier,
    slotIndex: z.union([z.literal(0), z.literal(1)]),
});
export type TournamentMatchAdvanceTarget = z.infer<typeof zTournamentMatchAdvanceTarget>;

export const zTournamentMatchSlot = z.object({
    source: zTournamentMatchSlotSource.nullable(),
    profileId: zIdentifier.nullable(),
    displayName: z.string().nullable(),
    image: zImage,
    seed: z.number().int()
        .positive()
        .nullable(),
    isBye: z.boolean().default(false),
});
export type TournamentMatchSlot = z.infer<typeof zTournamentMatchSlot>;

export const zTournamentMatch = z.object({
    id: zIdentifier,
    bracket: zTournamentBracket,
    round: z.number().int()
        .positive(),
    order: z.number().int()
        .positive(),
    state: zTournamentMatchState,
    bestOf: zTournamentSeriesBestOf,
    slots: z.tuple([
        zTournamentMatchSlot,
        zTournamentMatchSlot,
    ]),
    leftWins: z.number().int()
        .nonnegative()
        .default(0),
    rightWins: z.number().int()
        .nonnegative()
        .default(0),
    gameIds: z.array(zIdentifier).default([]),
    sessionId: zIdentifier.nullable(),
    winnerProfileId: zIdentifier.nullable(),
    loserProfileId: zIdentifier.nullable(),
    resultType: zTournamentMatchResultType.nullable(),
    currentGameNumber: z.number().int()
        .positive()
        .default(1),
    startedAt: zTimestamp.nullable(),
    claimWinExpiresAt: zTimestamp.nullable().optional(),
    resolvedAt: zTimestamp.nullable(),
    advanceWinnerTo: zTournamentMatchAdvanceTarget.nullable(),
    advanceLoserTo: zTournamentMatchAdvanceTarget.nullable(),
    waitingForPlayers: z.boolean().optional(),
});
export type TournamentMatch = z.infer<typeof zTournamentMatch>;

export const zTournamentParticipant = z.object({
    profileId: zIdentifier,
    displayName: z.string(),
    image: zImage,
    registeredAt: zTimestamp,
    checkedInAt: zTimestamp.nullable(),
    seed: z.number().int()
        .positive()
        .nullable(),
    status: zTournamentParticipantStatus,
    checkInState: zTournamentCheckInState,
    isManual: z.boolean().default(false),
    removedAt: zTimestamp.nullable(),
    eliminatedAt: zTimestamp.nullable(),
    replacedByProfileId: zIdentifier.nullable(),
    replacesProfileId: zIdentifier.nullable(),
});
export type TournamentParticipant = z.infer<typeof zTournamentParticipant>;

export const zTournamentActivityEntry = z.object({
    id: zIdentifier,
    timestamp: zTimestamp,
    actorProfileId: zIdentifier.nullable(),
    actorDisplayName: z.string(),
    type: z.string(),
    message: z.string(),
});
export type TournamentActivityEntry = z.infer<typeof zTournamentActivityEntry>;

export const zTournamentNextMatch = z.object({
    matchId: zIdentifier,
    bracket: zTournamentBracket,
    round: z.number().int()
        .positive(),
    order: z.number().int()
        .positive(),
    bestOf: zTournamentSeriesBestOf,
    sessionId: zIdentifier.nullable(),
    opponentProfileId: zIdentifier.nullable(),
    opponentDisplayName: z.string().nullable(),
    leftWins: z.number().int()
        .nonnegative(),
    rightWins: z.number().int()
        .nonnegative(),
});
export type TournamentNextMatch = z.infer<typeof zTournamentNextMatch>;

export const zTournamentViewerState = z.object({
    isAuthenticated: z.boolean(),
    canManage: z.boolean(),
    isRegistered: z.boolean(),
    isCheckedIn: z.boolean(),
    canRegister: z.boolean(),
    canCheckIn: z.boolean(),
    canWithdraw: z.boolean(),
    isSubscribed: z.boolean(),
    autoSubscribedOnView: z.boolean().optional(),
    isCreator: z.boolean(),
    isWaitlisted: z.boolean(),
    canJoinWaitlist: z.boolean(),
    nextMatch: zTournamentNextMatch.nullable(),
});
export type TournamentViewerState = z.infer<typeof zTournamentViewerState>;

export const zTournamentStanding = z.object({
    rank: z.number().int()
        .positive(),
    profileId: zIdentifier,
    displayName: z.string(),
    image: zImage,
    matchPoints: z.number().int()
        .nonnegative(),
    wins: z.number().int()
        .nonnegative(),
    losses: z.number().int()
        .nonnegative(),
    buchholz: z.number().int()
        .nonnegative(),
    sonnebornBerger: z.number().int()
        .nonnegative(),
    hadBye: z.boolean(),
});
export type TournamentStanding = z.infer<typeof zTournamentStanding>;

export const zTournamentSummary = z.object({
    id: zIdentifier,
    name: z.string(),
    description: z.string().nullable(),
    kind: zTournamentKind,
    format: zTournamentFormat,
    visibility: zTournamentVisibility,
    status: zTournamentStatus,
    isPublished: z.boolean(),
    scheduledStartAt: zTimestamp,
    checkInWindowMinutes: z.number().int()
        .positive(),
    checkInOpensAt: zTimestamp,
    checkInClosesAt: zTimestamp,
    maxPlayers: zTournamentMaxPlayers,
    swissRoundCount: z.number().int()
        .min(1)
        .max(15)
        .nullable(),
    registeredCount: z.number().int()
        .nonnegative(),
    checkedInCount: z.number().int()
        .nonnegative(),
    createdAt: zTimestamp,
    updatedAt: zTimestamp,
    startedAt: zTimestamp.nullable(),
    completedAt: zTimestamp.nullable(),
    cancelledAt: zTimestamp.nullable(),
    createdByProfileId: zIdentifier,
    createdByDisplayName: z.string(),
    timeControl: zGameTimeControl,
    seriesSettings: zTournamentSeriesSettings,
    matchJoinTimeoutMinutes: z.number().int()
        .min(0)
        .max(30),
    matchExtensionMinutes: z.number().int()
        .min(0)
        .max(30),
    lateRegistrationEnabled: z.boolean(),
    thirdPlaceMatchEnabled: z.boolean(),
    roundDelayMinutes: z.number().int()
        .nonnegative(),
    waitlistEnabled: z.boolean(),
    waitlistCheckInMinutes: z.number().int()
        .nonnegative(),
    waitlistOpensAt: zTimestamp.nullable(),
    waitlistClosesAt: zTimestamp.nullable(),
    waitlistedCount: z.number().int()
        .nonnegative(),
});
export type TournamentSummary = z.infer<typeof zTournamentSummary>;

export const zTournamentExtensionStatus = z.enum([`pending`, `approved`, `denied`]);
export type TournamentExtensionStatus = z.infer<typeof zTournamentExtensionStatus>;

export const zTournamentExtensionRequest = z.object({
    id: zIdentifier,
    matchId: zIdentifier,
    gameNumber: z.number().int()
        .positive()
        .default(1),
    requestedByProfileId: zIdentifier,
    requestedByDisplayName: z.string(),
    requestedAt: zTimestamp,
    status: zTournamentExtensionStatus,
    resolvedByProfileId: zIdentifier.nullable(),
    resolvedAt: zTimestamp.nullable(),
});
export type TournamentExtensionRequest = z.infer<typeof zTournamentExtensionRequest>;

export const zTournamentOrganizer = z.object({
    profileId: zIdentifier,
    displayName: z.string(),
});
export type TournamentOrganizer = z.infer<typeof zTournamentOrganizer>;

export const zTournamentAccessEntry = z.object({
    profileId: zIdentifier,
    displayName: z.string(),
});
export type TournamentAccessEntry = z.infer<typeof zTournamentAccessEntry>;

export const zTournamentDetail = zTournamentSummary.extend({
    participants: z.array(zTournamentParticipant),
    matches: z.array(zTournamentMatch),
    standings: z.array(zTournamentStanding),
    activity: z.array(zTournamentActivityEntry),
    extensionRequests: z.array(zTournamentExtensionRequest),
    organizers: z.array(zTournamentOrganizer),
    whitelist: z.array(zTournamentAccessEntry),
    blacklist: z.array(zTournamentAccessEntry),
    viewer: zTournamentViewerState,
});
export type TournamentDetail = z.infer<typeof zTournamentDetail>;

export const zTournamentPlayerStats = z.object({
    tournamentsPlayed: z.number().int()
        .nonnegative(),
    matchesWon: z.number().int()
        .nonnegative(),
    matchesLost: z.number().int()
        .nonnegative(),
    winRate: z.number().nonnegative(),
    bestPlacement: z.object({
        rank: z.number().int()
            .positive(),
        tournamentName: z.string(),
    }).nullable(),
    tournamentsCreated: z.number().int()
        .nonnegative(),
});
export type TournamentPlayerStats = z.infer<typeof zTournamentPlayerStats>;

export const zTournamentUpcomingMatch = z.object({
    tournamentId: zIdentifier,
    tournamentName: z.string(),
    matchId: zIdentifier,
    matchState: zTournamentMatchState,
    bracket: zTournamentBracket,
    round: z.number().int()
        .positive(),
    order: z.number().int()
        .positive(),
    bestOf: zTournamentSeriesBestOf,
    sessionId: zIdentifier.nullable(),
    opponentDisplayName: z.string().nullable(),
    leftWins: z.number().int()
        .nonnegative(),
    rightWins: z.number().int()
        .nonnegative(),
});
export type TournamentUpcomingMatch = z.infer<typeof zTournamentUpcomingMatch>;

export const zTournamentListingResponse = z.object({
    tournaments: z.array(zTournamentSummary),
    past: z.array(zTournamentSummary),
    pastTotal: z.number().int().nonnegative(),
    stats: zTournamentPlayerStats.nullable(),
    upcomingMatches: z.array(zTournamentUpcomingMatch),
});
export type TournamentListingResponse = z.infer<typeof zTournamentListingResponse>;

export const zCreateTournamentRequest = z.object({
    name: z.string().trim()
        .min(3)
        .max(80),
    description: z.string().trim()
        .max(280)
        .optional(),
    format: zTournamentFormat.default(`double-elimination`),
    visibility: zTournamentVisibility,
    scheduledStartAt: zTimestamp,
    checkInWindowMinutes: z.number().int()
        .min(5)
        .max(24 * 60),
    maxPlayers: zTournamentMaxPlayers,
    swissRoundCount: z.number().int()
        .min(1)
        .max(15)
        .optional(),
    timeControl: zGameTimeControl,
    seriesSettings: zTournamentSeriesSettings,
    matchJoinTimeoutMinutes: z.number().int()
        .min(0)
        .max(30)
        .optional(),
    matchExtensionMinutes: z.number().int()
        .min(0)
        .max(30)
        .optional(),
    lateRegistrationEnabled: z.boolean().optional(),
    thirdPlaceMatchEnabled: z.boolean().optional(),
    roundDelayMinutes: z.number().int()
        .min(0)
        .max(60)
        .optional(),
    waitlistEnabled: z.boolean().optional(),
    waitlistCheckInMinutes: z.number().int()
        .min(1)
        .max(30)
        .optional(),
    whitelist: z.array(zIdentifier).optional(),
    blacklist: z.array(zIdentifier).optional(),
});
export type CreateTournamentRequest = z.infer<typeof zCreateTournamentRequest>;

export const zUpdateTournamentRequest = z.object({
    name: z.string().trim()
        .min(3)
        .max(80)
        .optional(),
    description: z.string().trim()
        .max(280)
        .nullable()
        .optional(),
    format: zTournamentFormat.optional(),
    visibility: zTournamentVisibility.optional(),
    scheduledStartAt: zTimestamp.optional(),
    checkInWindowMinutes: z.number().int()
        .min(5)
        .max(24 * 60)
        .optional(),
    maxPlayers: zTournamentMaxPlayers.optional(),
    swissRoundCount: z.number().int()
        .min(1)
        .max(15)
        .nullable()
        .optional(),
    timeControl: zGameTimeControl.optional(),
    seriesSettings: zTournamentSeriesSettings.optional(),
    matchJoinTimeoutMinutes: z.number().int()
        .min(0)
        .max(30)
        .nullable()
        .optional(),
    matchExtensionMinutes: z.number().int()
        .min(0)
        .max(30)
        .nullable()
        .optional(),
    lateRegistrationEnabled: z.boolean().optional(),
    thirdPlaceMatchEnabled: z.boolean().optional(),
    roundDelayMinutes: z.number().int()
        .min(0)
        .max(60)
        .optional(),
    waitlistEnabled: z.boolean().optional(),
    waitlistCheckInMinutes: z.number().int()
        .min(1)
        .max(30)
        .nullable()
        .optional(),
    whitelist: z.array(zIdentifier).nullable().optional(),
    blacklist: z.array(zIdentifier).nullable().optional(),
});
export type UpdateTournamentRequest = z.infer<typeof zUpdateTournamentRequest>;

export const zTournamentParticipantMutationRequest = z.object({
    profileId: zIdentifier,
});
export type TournamentParticipantMutationRequest = z.infer<typeof zTournamentParticipantMutationRequest>;

export const zTournamentOrganizerGrantRequest = z.object({
    profileId: zIdentifier,
});
export type TournamentOrganizerGrantRequest = z.infer<typeof zTournamentOrganizerGrantRequest>;

export const zTournamentParticipantSwapRequest = z.object({
    profileId: zIdentifier,
    replacementProfileId: zIdentifier,
});
export type TournamentParticipantSwapRequest = z.infer<typeof zTournamentParticipantSwapRequest>;

export const zTournamentMatchResolutionRequest = z.object({
    winnerProfileId: zIdentifier,
});
export type TournamentMatchResolutionRequest = z.infer<typeof zTournamentMatchResolutionRequest>;

export const zReorderSeedsRequest = z.object({
    orderedProfileIds: z.array(zIdentifier).min(1),
});
export type ReorderSeedsRequest = z.infer<typeof zReorderSeedsRequest>;

export const zSessionTournamentInfo = z.object({
    tournamentId: zIdentifier,
    tournamentName: z.string(),
    matchId: zIdentifier,
    bracket: zTournamentBracket,
    round: z.number().int()
        .positive(),
    order: z.number().int()
        .positive(),
    bestOf: zTournamentSeriesBestOf,
    currentGameNumber: z.number().int()
        .positive(),
    leftWins: z.number().int()
        .nonnegative(),
    rightWins: z.number().int()
        .nonnegative(),
    matchJoinTimeoutMs: z.number().int()
        .nonnegative(),
    matchExtensionMs: z.number().int()
        .nonnegative(),
    pendingExtension: z.boolean().default(false),
    matchJoinTimeoutInMs: z.number().int()
        .nonnegative()
        .nullable()
        .default(null),
    leftDisplayName: z.string().nullable(),
    rightDisplayName: z.string().nullable(),
    leftProfileId: zIdentifier.nullable()
        .default(null),
    rightProfileId: zIdentifier.nullable()
        .default(null),
});
export type SessionTournamentInfo = z.infer<typeof zSessionTournamentInfo>;

export const zFinishedGameTournamentInfo = zSessionTournamentInfo.extend({
    resultType: zTournamentMatchResultType.nullable(),
});
export type FinishedGameTournamentInfo = z.infer<typeof zFinishedGameTournamentInfo>;

export const zTournamentUpdatedEvent = z.object({
    tournamentId: zIdentifier,
    updatedAt: zTimestamp,
});
export type TournamentUpdatedEvent = z.infer<typeof zTournamentUpdatedEvent>;

export const zTournamentNotificationEvent = z.object({
    tournamentId: zIdentifier,
    kind: z.enum([`match-ready`, `tournament-started`, `participant-replaced`, `timeout-warning`, `extension-requested`, `extension-resolved`, `claim-win-started`, `claim-win-cancelled`, `claim-win-awarded`, `low-registration`, `waitlist-open`]),
    message: z.string(),
});
export type TournamentNotificationEvent = z.infer<typeof zTournamentNotificationEvent>;

export const zRequestMatchExtensionRequest = z.object({
    matchId: zIdentifier,
});
export type RequestMatchExtensionRequest = z.infer<typeof zRequestMatchExtensionRequest>;

export const zResolveExtensionRequest = z.object({
    approve: z.boolean(),
});
export type ResolveExtensionRequest = z.infer<typeof zResolveExtensionRequest>;

export const zClaimWinRequest = z.object({
    tournamentId: zIdentifier,
    matchId: zIdentifier,
});
export type ClaimWinRequest = z.infer<typeof zClaimWinRequest>;

export const zMatchClaimWinState = z.object({
    matchId: zIdentifier,
    gameNumber: z.number().int()
        .positive(),
    claimantProfileId: zIdentifier,
    startedAt: zTimestamp,
    expiresInMs: z.number().int().nonnegative(),
});
export type MatchClaimWinState = z.infer<typeof zMatchClaimWinState>;

export const zSessionClaimWinEvent = z.object({
    sessionId: zIdentifier,
    state: zMatchClaimWinState.nullable(),
});
export type SessionClaimWinEvent = z.infer<typeof zSessionClaimWinEvent>;
