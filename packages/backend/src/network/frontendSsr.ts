import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
    FinishedGamesArchiveView,
    LobbyInfo,
    SSRModule,
} from '@ih3t/shared';
import {
    FINISHED_GAMES_PAGE_SIZE,
    queryKeys,
} from '@ih3t/shared';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import type express from 'express';
import fs from "fs/promises";

import { ApiQueryService, ApiRequestError } from './rest/apiQueryService';

type FrontendSsrDependencies = {
    apiQueryService: ApiQueryService
    ssrDistPath: string
};

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnMount: false,
                refetchOnReconnect: false,
                refetchOnWindowFocus: false,
            },
        },
    });
}

function sortLobbySessions(sessions: LobbyInfo[]) {
    return [...sessions].sort((leftSession, rightSession) => {
        const leftCanJoin = leftSession.startedAt === null && leftSession.players.length < 2;
        const rightCanJoin = rightSession.startedAt === null && rightSession.players.length < 2;

        if (leftCanJoin !== rightCanJoin) {
            return leftCanJoin ? -1 : 1;
        }

        return (rightSession.startedAt ?? 0) - (leftSession.startedAt ?? 0);
    });
}

function parsePositiveInteger(value: string | null): number | null {
    if (!value) {
        return null;
    }

    const parsedValue = Number.parseInt(value, 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}


function escapeJsonForHtml(value: string): string {
    return value
        .replace(/</g, `\\u003c`)
        .replace(/\u2028/g, `\\u2028`)
        .replace(/\u2029/g, `\\u2029`);
}

export class FrontendSsrRenderer {
    private ssrModule: Promise<SSRModule> | null = null;
    private frontendIndexTemplate: Promise<string>;

    constructor(private readonly dependencies: FrontendSsrDependencies) {
        this.frontendIndexTemplate = this.getHtmlTemplate();
    }

    private getHtmlTemplate(): Promise<string> {
        const indexPath = path.join(this.dependencies.ssrDistPath, `client`, `index.html`);
        return fs.readFile(indexPath).then(buffer => buffer.toString(`utf-8`));
    }

    async render(req: express.Request): Promise<string> {
        const queryClient = createQueryClient();
        const accountResponse = await this.dependencies.apiQueryService.getAccount(req);
        const currentUser = accountResponse.user;

        /* never assume shutdown in SSR */
        queryClient.setQueryData(queryKeys.serverShutdown, null);

        queryClient.setQueryData(queryKeys.account, accountResponse);
        if (currentUser) {
            try {
                queryClient.setQueryData(
                    queryKeys.accountPreferences,
                    await this.dependencies.apiQueryService.getAccountPreferences(req),
                );
            } catch (error: unknown) {
                if (!(error instanceof ApiRequestError)) {
                    throw error;
                }
            }
        }

        const requestUrl = new URL(req.originalUrl || req.url, `${req.protocol}://${req.get(`host`)}`);
        await this.prefetchRouteData(queryClient, req, requestUrl, currentUser?.id ?? null);

        const ssrModule = await this.getSSRModule();

        const timestamp = Date.now();
        const { head, html } = ssrModule({
            url: requestUrl.toString(),
            timestamp,
            queryClient,
        });

        const globalVariables: Record<string, any> = {
            __IH3T_DEHYDRATED_STATE__: dehydrate(queryClient),
            __IH3T_RENDERED_AT__: timestamp,
        };
        const state = Object.entries(globalVariables)
            .map(([key, value]) => `window.${key}=${escapeJsonForHtml(JSON.stringify(value))};`)
            .join(``);

        const template = await this.frontendIndexTemplate;
        const response = template
            .replace(`<!--app-head-->`, head)
            .replace(`<!--app-html-->`, html)
            .replace(`/*app-state*/`, state);

        return response;
    }

    private async prefetchRouteData(
        queryClient: QueryClient,
        req: express.Request,
        requestUrl: URL,
        currentUserId: string | null,
    ): Promise<void> {
        const path = requestUrl.pathname;

        if (path === `/` || path.startsWith(`/admin`) || path === `/account/profile` || path.startsWith(`/profile/`)) {
            queryClient.setQueryData(queryKeys.availableSessions, sortLobbySessions(this.dependencies.apiQueryService.listSessions()));
        }

        const sessionMatch = /^\/session\/([^/]+)$/.exec(path);
        if (sessionMatch) {
            const sessionId = decodeURIComponent(sessionMatch[1]);
            queryClient.setQueryData(queryKeys.session(sessionId), this.dependencies.apiQueryService.getSession(sessionId));
        }

        if (path === `/leaderboard`) {
            queryClient.setQueryData(queryKeys.leaderboard, await this.dependencies.apiQueryService.getLeaderboard(req));
        }

        if (path === `/tournaments`) {
            queryClient.setQueryData(queryKeys.tournaments, await this.dependencies.apiQueryService.getTournaments(req));
        }

        const tournamentMatch = /^\/tournaments\/([^/]+)$/.exec(path);
        if (tournamentMatch) {
            const tournamentId = decodeURIComponent(tournamentMatch[1]);
            const tournament = await this.dependencies.apiQueryService.getTournament(req, tournamentId);
            if (tournament) {
                queryClient.setQueryData(queryKeys.tournament(tournamentId), tournament);
            }
        }

        const profileMatch = /^\/profile\/(?<id>[^/]+)|\/account\/profile$/.exec(path);
        if (profileMatch) {
            const profileId = decodeURIComponent(profileMatch.groups?.id ?? currentUserId ?? ``);
            if (!profileId) {
                return;
            }

            const [
                profile, statistics, recentGames,
            ] = await Promise.all([
                this.dependencies.apiQueryService.getProfile(profileId),
                this.dependencies.apiQueryService.getProfileStatistics(profileId),
                this.dependencies.apiQueryService.getProfileGames(profileId),
            ]);

            if (profile) {
                queryClient.setQueryData(queryKeys.profile(profileId), profile);
            }

            if (statistics) {
                queryClient.setQueryData(queryKeys.profileStatistics(profileId), statistics);
            }

            if (recentGames) {
                queryClient.setQueryData(queryKeys.profileRecentGames(profileId), recentGames);
            }
        }

        if (path === `/games` || path === `/account/games`) {
            const archiveView: FinishedGamesArchiveView = path.startsWith(`/account/games`) ? `mine` : `all`;
            const page = parsePositiveInteger(requestUrl.searchParams.get(`page`)) ?? 1;
            const baseTimestamp = parsePositiveInteger(requestUrl.searchParams.get(`at`));

            if (baseTimestamp !== null) {
                try {
                    queryClient.setQueryData(
                        queryKeys.finishedGamesPage(archiveView, page, FINISHED_GAMES_PAGE_SIZE, baseTimestamp),
                        await this.dependencies.apiQueryService.getFinishedGames(req, {
                            view: archiveView,
                            page,
                            pageSize: FINISHED_GAMES_PAGE_SIZE,
                            baseTimestamp,
                        }),
                    );
                } catch (error: unknown) {
                    if (!(error instanceof ApiRequestError)) {
                        throw error;
                    }
                }
            }
        }

        const finishedGameMatch = /^\/(?:account\/)?games\/([^/]+)$/.exec(path);
        if (finishedGameMatch) {
            const gameId = decodeURIComponent(finishedGameMatch[1]);
            const finishedGame = await this.dependencies.apiQueryService.getFinishedGame(gameId);
            if (finishedGame) {
                queryClient.setQueryData(queryKeys.finishedGame(gameId), finishedGame);
            }
        }

        const sandboxPositionMatch = /^\/sandbox\/([^/]+)$/.exec(path);
        if (sandboxPositionMatch) {
            const positionId = decodeURIComponent(sandboxPositionMatch[1]);
            const sandboxPosition = await this.dependencies.apiQueryService.getSandboxPosition(positionId);
            if (sandboxPosition) {
                queryClient.setQueryData(queryKeys.sandboxPosition(positionId), sandboxPosition);
            }
        }
    }

    private async getSSRModule(): Promise<SSRModule> {
        if (this.ssrModule) {
            return this.ssrModule;
        }

        const moduleUrl = pathToFileURL(join(this.dependencies.ssrDistPath, `ssr/entry-server.js`)).href;
        this.ssrModule = import(moduleUrl)
            .then((module: { default: SSRModule }) => module.default)
            .catch((error: unknown) => {
                this.ssrModule = null;
                throw error;
            });

        return this.ssrModule;
    }
}
