export const FINISHED_GAMES_PAGE_SIZE = 20;
export type FinishedGamesArchiveView = `all` | `mine`;

export const queryKeys = {
    account: [`account`] as const,
    accountPreferences: [`account`, `preferences`] as const,

    profile: (profileId: string | null) => [`profile`, profileId ?? `unknown`] as const,
    profileRecentGames: (profileId: string | null) => [
        `profile`, profileId ?? `unknown`, `games`,
    ] as const,
    profileStatistics: (profileId: string | null) => [
        `profile`, profileId ?? `unknown`, `statistics`,
    ] as const,

    adminStats: (timezoneOffsetMinutes: number) => [
        `admin`, `stats`, timezoneOffsetMinutes,
    ] as const,

    leaderboard: [`leaderboard`] as const,
    tournaments: [`tournaments`] as const,
    tournament: (tournamentId: string | null) => [`tournaments`, tournamentId ?? `unknown`] as const,
    ownTournaments: [`tournaments`, `mine`] as const,
    session: (sessionId: string | null) => [`session`, sessionId ?? `unknown`] as const,
    availableSessions: [`sessions`, `available`] as const,
    sandboxPosition: (positionId: string | null) => [`sandbox-position`, positionId ?? `none`] as const,

    finishedGames: [`finished-games`] as const,
    finishedGamesPage: (view: FinishedGamesArchiveView, page: number, pageSize: number, baseTimestamp: number) =>
        [
            `finished-games`, view, page, pageSize, baseTimestamp,
        ] as const,
    finishedGame: (gameId: string | null) => [`finished-games`, gameId ?? `empty`] as const,

    serverSettings: [`server-settings`] as const,
    serverShutdown: [`server-shutdown`] as const,
};
