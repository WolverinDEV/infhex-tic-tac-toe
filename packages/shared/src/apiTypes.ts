import { z } from 'zod';

import {
    zAccountPermission,
    zAccountPreferences,
    zAccountProfile,
    zAccountStatistics,
    zAdminActiveGamesTimeline,
    zAdminBroadcastMessage,
    zAdminStatsWindow,
    zAdminUserStatsWindow,
    zFinishedGamesPage,
    zIdentifier,
    zLobbyOptions,
    zNormalizedUsername,
    zSandboxGamePosition,
    zSandboxPositionId,
    zSandboxPositionName,
    zServerSettings,
    zSessionInfo,
    zShutdownState,
    zTimestamp,
    zPublicAccountProfile,
    zSessionId,
} from './sharedTypes';

export const zAdminScheduleShutdownRequest = z.object({
    delayMinutes: z.number().int()
        .min(1)
        .max(24 * 60),
});
export type AdminScheduleShutdownRequest = z.infer<typeof zAdminScheduleShutdownRequest>;

export const zAdminShutdownControlResponse = z.object({
    shutdown: zShutdownState.nullable(),
});
export type AdminShutdownControlResponse = z.infer<typeof zAdminShutdownControlResponse>;

export const zAdminBroadcastMessageRequest = z.object({
    message: z.string().trim()
        .min(1)
        .max(280),
});
export type AdminBroadcastMessageRequest = z.infer<typeof zAdminBroadcastMessageRequest>;

export const zAdminBroadcastMessageResponse = z.object({
    broadcast: zAdminBroadcastMessage,
});
export type AdminBroadcastMessageResponse = z.infer<typeof zAdminBroadcastMessageResponse>;

export const zAdminUpdateServerSettingsRequest = z.object({
    settings: zServerSettings,
});
export type AdminUpdateServerSettingsRequest = z.infer<typeof zAdminUpdateServerSettingsRequest>;

export const zAdminServerSettingsResponse = z.object({
    settings: zServerSettings,
    currentConcurrentGames: z.number().int()
        .nonnegative(),
});
export type AdminServerSettingsResponse = z.infer<typeof zAdminServerSettingsResponse>;

export const zCreateSandboxPositionRequest = z.object({
    name: zSandboxPositionName,
    gamePosition: zSandboxGamePosition,
});
export type CreateSandboxPositionRequest = z.infer<typeof zCreateSandboxPositionRequest>;

export const zCreateSandboxPositionResponse = z.object({
    id: zSandboxPositionId,
    name: zSandboxPositionName,
});
export type CreateSandboxPositionResponse = z.infer<typeof zCreateSandboxPositionResponse>;

export const zSandboxPositionResponse = z.object({
    id: zSandboxPositionId,
    name: zSandboxPositionName,
    gamePosition: zSandboxGamePosition,
});
export type SandboxPositionResponse = z.infer<typeof zSandboxPositionResponse>;

export const zCreateSessionRequest = z.object({
    lobbyOptions: zLobbyOptions.optional(),
});
export type CreateSessionRequest = z.infer<typeof zCreateSessionRequest>;

export const zCreateSessionResponse = z.object({
    sessionId: zSessionId,
});
export type CreateSessionResponse = z.infer<typeof zCreateSessionResponse>;

export const zAdminTerminateSessionResponse = z.object({
    session: zSessionInfo,
});
export type AdminTerminateSessionResponse = z.infer<typeof zAdminTerminateSessionResponse>;

export const zAccountResponse = z.object({
    user: zAccountProfile.nullable(),
});
export type AccountResponse = z.infer<typeof zAccountResponse>;

export const zAdminUserSearchResponse = z.object({
    users: z.array(zAccountProfile),
});
export type AdminUserSearchResponse = z.infer<typeof zAdminUserSearchResponse>;

export const zAdminUpdateUserPermissionsRequest = z.object({
    permissions: z.array(zAccountPermission)
        .default([]),
});
export type AdminUpdateUserPermissionsRequest = z.infer<typeof zAdminUpdateUserPermissionsRequest>;

export const zAdminUpdateUserPermissionsResponse = z.object({
    user: zAccountProfile.nullable(),
});
export type AdminUpdateUserPermissionsResponse = z.infer<typeof zAdminUpdateUserPermissionsResponse>;

export const zProfileResponse = z.object({
    user: zPublicAccountProfile.nullable(),
});
export type ProfileResponse = z.infer<typeof zProfileResponse>;

export const zAccountPreferencesResponse = z.object({
    preferences: zAccountPreferences,
});
export type AccountPreferencesResponse = z.infer<typeof zAccountPreferencesResponse>;

export const zUserSearchResponse = z.object({
    users: z.array(zPublicAccountProfile),
});
export type UserSearchResponse = z.infer<typeof zUserSearchResponse>;

export const zProfileStatisticsResponse = z.object({
    statistics: zAccountStatistics,
});
export type ProfileStatisticsResponse = z.infer<typeof zProfileStatisticsResponse>;

export const zProfileGamesResponse = zFinishedGamesPage;
export type ProfileGamesResponse = z.infer<typeof zProfileGamesResponse>;

export const zAdminStatsResponse = z.object({
    generatedAt: zTimestamp,
    activeGames: z.object({
        total: z.number().int()
            .nonnegative(),
        public: z.number().int()
            .nonnegative(),
        private: z.number().int()
            .nonnegative(),
    }),
    connectedClients: z.number().int()
        .nonnegative(),
    users: z.object({
        total: z.number().int()
            .nonnegative(),
        intervals: z.object({
            sinceMidnight: zAdminUserStatsWindow,
            last7Days: zAdminUserStatsWindow,
            lastMonth: zAdminUserStatsWindow,
        }),
    }),
    intervals: z.object({
        sinceMidnight: zAdminStatsWindow,
        last24Hours: zAdminStatsWindow,
        last7Days: zAdminStatsWindow,
    }),
    activeGamesTimeline: zAdminActiveGamesTimeline,
});
export type AdminStatsResponse = z.infer<typeof zAdminStatsResponse>;

export const zUpdateAccountProfileRequest = z.object({
    username: zNormalizedUsername,
});
export type UpdateAccountProfileRequest = z.infer<typeof zUpdateAccountProfileRequest>;

export const zUpdateAccountPreferencesRequest = z.object({
    preferences: zAccountPreferences,
});
export type UpdateAccountPreferencesRequest = z.infer<typeof zUpdateAccountPreferencesRequest>;
