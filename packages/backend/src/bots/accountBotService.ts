import { randomInt } from 'node:crypto';

import type {
    AccountBot,
    AccountBotCapabilities,
    CreateAccountBotRequest,
    UpdateAccountBotRequest,
} from '@ih3t/shared';
import { zAccountBotEndpoint } from '@ih3t/shared';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { ServerConfig } from '../config/serverConfig';
import { ROOT_LOGGER } from '../logger';
import { AccountBotRepository } from '../persistence/accountBotRepository';

const SHORT_ID_ALPHABET = `abcdefghijklmnopqrstuvwxyz0123456789`;
const SHORT_ID_LENGTH = 7;
const MAX_SHORT_ID_ATTEMPTS = 10;

const zCapabilitiesResponse = z.object({
    meta: z.object({
        name: z.string().trim()
            .min(1)
            .optional(),
        description: z.string().trim()
            .min(1)
            .optional(),
        author: z.string().trim()
            .min(1)
            .optional(),
        version: z.string().trim()
            .min(1)
            .optional(),
    }).partial()
        .optional(),
    stateless: z.object({
        versions: z.object({
            'v1-alpha': z.object({
                api_root: z.string().trim()
                    .min(1)
                    .optional(),
                move_time_limit: z.boolean().optional(),
            }).partial(),
        }).partial(),
    }).partial()
        .optional(),
});

const zStatelessTurnResponse = z.object({
    move: z.object({
        pieces: z.array(z.object({
            q: z.number().int(),
            r: z.number().int(),
        })).length(2),
    }),
});

export type BotMoveRequest = {
    toMove: `x` | `o`;
    cells: Array<{
        x: number;
        y: number;
        piece: `x` | `o`;
    }>;
    timeLimitSeconds?: number;
};

export type BotMoveResponse = {
    pieces: [
        { x: number; y: number },
        { x: number; y: number },
    ];
};

export class AccountBotError extends Error {
    constructor(message: string) {
        super(message);
        this.name = `AccountBotError`;
    }
}

@injectable()
export class AccountBotService {
    static readonly MAX_BOTS_PER_ACCOUNT = 20;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ServerConfig) private readonly serverConfig: ServerConfig,
        @inject(AccountBotRepository) private readonly accountBotRepository: AccountBotRepository,
    ) {
        this.logger = rootLogger.child({ component: `account-bot-service` });
    }

    async listBots(ownerProfileId: string): Promise<AccountBot[]> {
        return await this.accountBotRepository.listByOwnerProfileId(ownerProfileId);
    }

    async getOwnedBot(ownerProfileId: string, botId: string): Promise<AccountBot | null> {
        return await this.accountBotRepository.getByOwnerProfileIdAndId(ownerProfileId, botId);
    }

    async getBotById(botId: string): Promise<AccountBot | null> {
        return await this.accountBotRepository.getById(botId);
    }

    async requireOwnedBots(ownerProfileId: string, botIds: string[]): Promise<AccountBot[]> {
        const normalizedBotIds = Array.from(new Set(botIds.map((botId) => botId.trim()).filter(Boolean)));
        if (normalizedBotIds.length !== botIds.length) {
            throw new AccountBotError(`Duplicate bot selections are not allowed.`);
        }

        const bots = await Promise.all(normalizedBotIds.map((botId) => this.getOwnedBot(ownerProfileId, botId)));
        if (bots.some((bot) => bot === null)) {
            throw new AccountBotError(`One or more selected bots were not found in your account.`);
        }

        return bots.filter((bot): bot is AccountBot => bot !== null);
    }

    async createBot(ownerProfileId: string, request: CreateAccountBotRequest): Promise<AccountBot> {
        const existingCount = await this.accountBotRepository.countByOwnerProfileId(ownerProfileId);
        if (existingCount >= AccountBotService.MAX_BOTS_PER_ACCOUNT) {
            throw new AccountBotError(`You can save up to ${AccountBotService.MAX_BOTS_PER_ACCOUNT} bots per account.`);
        }

        const normalizedEndpoint = normalizeEndpoint(request.bot.endpoint);
        const capabilities = await this.discoverCapabilities(normalizedEndpoint);
        const now = Date.now();

        for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt += 1) {
            try {
                return await this.accountBotRepository.createBot({
                    id: this.generateShortId(),
                    ownerProfileId,
                    name: request.bot.name,
                    endpoint: normalizedEndpoint,
                    createdAt: now,
                    updatedAt: now,
                    capabilities,
                });
            } catch (error: unknown) {
                if (isMongoDuplicateKeyError(error)) {
                    continue;
                }

                throw error;
            }
        }

        throw new AccountBotError(`Failed to generate a bot id.`);
    }

    async updateBot(ownerProfileId: string, botId: string, request: UpdateAccountBotRequest): Promise<AccountBot | null> {
        const normalizedEndpoint = normalizeEndpoint(request.bot.endpoint);
        const capabilities = await this.discoverCapabilities(normalizedEndpoint);
        return await this.accountBotRepository.updateBot(ownerProfileId, botId, {
            name: request.bot.name,
            endpoint: normalizedEndpoint,
            updatedAt: Date.now(),
            capabilities,
        });
    }

    async deleteBot(ownerProfileId: string, botId: string): Promise<boolean> {
        return await this.accountBotRepository.deleteBot(ownerProfileId, botId);
    }

    async requestMove(bot: AccountBot, request: BotMoveRequest): Promise<BotMoveResponse> {
        const endpoint = resolveStatelessTurnUrl(bot);
        const response = await this.fetchJson(endpoint, {
            method: `POST`,
            headers: {
                'Content-Type': `application/json`,
            },
            body: JSON.stringify({
                board: {
                    to_move: request.toMove,
                    cells: request.cells.map((cell) => ({
                        q: cell.x,
                        r: cell.y,
                        p: cell.piece,
                    })),
                },
                ...(bot.capabilities.moveTimeLimit && typeof request.timeLimitSeconds === `number`
                    ? { time_limit: request.timeLimitSeconds }
                    : {}),
            }),
        });
        const parsed = zStatelessTurnResponse.safeParse(response);
        if (!parsed.success) {
            throw new AccountBotError(`Bot "${bot.name}" returned an invalid move response.`);
        }

        return {
            pieces: [
                {
                    x: parsed.data.move.pieces[0].q,
                    y: parsed.data.move.pieces[0].r,
                },
                {
                    x: parsed.data.move.pieces[1].q,
                    y: parsed.data.move.pieces[1].r,
                },
            ],
        };
    }

    private async discoverCapabilities(endpoint: string): Promise<AccountBotCapabilities> {
        const capabilityUrl = new URL(`capabilities.json`, toDirectoryUrl(endpoint)).toString();
        const response = await this.fetchJson(capabilityUrl, {
            method: `GET`,
        });
        const parsed = zCapabilitiesResponse.safeParse(response);
        if (!parsed.success) {
            throw new AccountBotError(`Bot capabilities response is invalid.`);
        }

        const statelessVersion = parsed.data.stateless?.versions?.[`v1-alpha`];
        if (!statelessVersion) {
            throw new AccountBotError(`Only bots with stateless v1-alpha support can be added right now.`);
        }

        return {
            statelessApiRoot: resolveApiRoot(endpoint, statelessVersion.api_root ?? `stateless/v1-alpha`),
            moveTimeLimit: statelessVersion.move_time_limit ?? false,
            discoveredAt: Date.now(),
            meta: {
                name: parsed.data.meta?.name ?? null,
                description: parsed.data.meta?.description ?? null,
                author: parsed.data.meta?.author ?? null,
                version: parsed.data.meta?.version ?? null,
            },
        };
    }

    private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.serverConfig.botHttpTimeoutMs);

        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new AccountBotError(`Bot request failed with ${response.status} ${response.statusText}.`);
            }

            return await response.json();
        } catch (error: unknown) {
            if (error instanceof AccountBotError) {
                throw error;
            }

            if (error instanceof Error && error.name === `AbortError`) {
                throw new AccountBotError(`Bot request timed out after ${this.serverConfig.botHttpTimeoutMs}ms.`);
            }

            this.logger.warn({ err: error, url }, `Bot request failed`);
            throw new AccountBotError(error instanceof Error ? error.message : `Bot request failed.`);
        } finally {
            clearTimeout(timeout);
        }
    }

    private generateShortId(): string {
        let id = ``;
        for (let characterIndex = 0; characterIndex < SHORT_ID_LENGTH; characterIndex += 1) {
            const alphabetIndex = randomInt(0, SHORT_ID_ALPHABET.length);
            id += SHORT_ID_ALPHABET[alphabetIndex];
        }

        return id;
    }
}

function normalizeEndpoint(endpoint: string): string {
    const normalized = zAccountBotEndpoint.parse(endpoint);
    const url = new URL(normalized);
    url.search = ``;
    url.hash = ``;

    if (url.pathname.length > 1) {
        url.pathname = url.pathname.replace(/\/+$/, ``);
    }

    return url.toString().replace(/\/$/, url.pathname === `/` ? `/` : ``);
}

function toDirectoryUrl(endpoint: string): string {
    return endpoint.endsWith(`/`) ? endpoint : `${endpoint}/`;
}

function resolveApiRoot(endpoint: string, apiRoot: string): string {
    return new URL(apiRoot, toDirectoryUrl(endpoint)).toString();
}

function resolveStatelessTurnUrl(bot: AccountBot): string {
    return new URL(`turn`, toDirectoryUrl(bot.capabilities.statelessApiRoot)).toString();
}

function isMongoDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === `object`
        && error !== null
        && `code` in error
        && typeof (error as { code?: unknown }).code === `number`
        && (error as { code: number }).code === 11000;
}
