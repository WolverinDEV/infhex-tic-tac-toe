import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { ServerConfig } from '../config/serverConfig';
import { ROOT_LOGGER } from '../logger';
import { GameHistoryRepository } from '../persistence/gameHistoryRepository';
import { SessionManager } from '../session/sessionManager';
import { CorsConfiguration } from './cors';
import { ApiRouter } from './rest/createApiRouter';

const DEFAULT_PAGE_TITLE = 'Infinity Hexagonial Tic-Tac-Toe';
const DEFAULT_PAGE_DESCRIPTION = 'Play Infinity Hexagonial Tic-Tac-Toe online, host a lobby, join live matches, and review finished games move by move.';
const DEFAULT_OG_DESCRIPTION = 'Host a lobby, join live matches, and review finished Infinity Hexagonial Tic-Tac-Toe games online.';

interface PageMetadata {
    title: string;
    description: string;
    url: string;
    imageUrl: string;
    ogType: 'website' | 'article';
    robots: string;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return character;
        }
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceOrInsertTag(html: string, pattern: RegExp, replacement: string): string {
    if (pattern.test(html)) {
        return html.replace(pattern, replacement);
    }

    return html.replace('</head>', `    ${replacement}\n</head>`);
}

function replaceOrInsertMetaName(html: string, name: string, content: string): string {
    return replaceOrInsertTag(
        html,
        new RegExp(`<meta\\s+[^>]*name=["']${escapeRegExp(name)}["'][^>]*>`, 'i'),
        `<meta name="${name}" content="${escapeHtml(content)}" />`
    );
}

function replaceOrInsertMetaProperty(html: string, property: string, content: string): string {
    return replaceOrInsertTag(
        html,
        new RegExp(`<meta\\s+[^>]*property=["']${escapeRegExp(property)}["'][^>]*>`, 'i'),
        `<meta property="${property}" content="${escapeHtml(content)}" />`
    );
}

function replaceOrInsertCanonicalLink(html: string, href: string): string {
    return replaceOrInsertTag(
        html,
        /<link\s+[^>]*rel=["']canonical["'][^>]*>/i,
        `<link rel="canonical" href="${escapeHtml(href)}" />`
    );
}

function getSingleQueryValue(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
    }

    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim().length > 0) {
        return value[0].trim();
    }

    return null;
}

@injectable()
export class HttpApplication {
    readonly app: express.Application;
    private readonly logger: Logger;
    private readonly frontendDistPath: string;
    private frontendIndexHtmlPromise: Promise<string> | null = null;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ApiRouter) apiRouter: ApiRouter,
        @inject(CorsConfiguration) corsConfiguration: CorsConfiguration,
        @inject(ServerConfig) serverConfig: ServerConfig,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(GameHistoryRepository) private readonly gameHistoryRepository: GameHistoryRepository
    ) {
        const app = express();
        const logger = rootLogger.child({ component: 'http-application' });
        const corsOptions = corsConfiguration.options;
        const frontendDistPath = serverConfig.frontendDistPath;
        this.logger = logger;
        this.frontendDistPath = frontendDistPath;

        app.set('trust proxy', true);

        if (corsOptions) {
            app.use(cors(corsOptions));
        }

        app.use((req, res, next) => {
            const requestId = randomUUID();
            const startedAt = process.hrtime.bigint();
            const requestLogger = logger.child({
                requestId,
                method: req.method,
                path: req.originalUrl,
                remoteAddress: req.ip
            });

            res.on('finish', () => {
                const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
                requestLogger.trace({
                    event: 'http.request.completed',
                    statusCode: res.statusCode,
                    durationMs: Number(durationMs.toFixed(3)),
                    contentLength: res.getHeader('content-length') ?? null,
                    userAgent: req.get('user-agent') ?? null
                }, 'HTTP request completed');
            });

            next();
        });

        app.use('/api', apiRouter.router);

        if (process.env.NODE_ENV === 'production' && existsSync(frontendDistPath)) {
            app.use(express.static(frontendDistPath, { index: false }));
            app.get(/^(?!\/api(?:\/|$)|\/socket\.io(?:\/|$)).*/, async (req, res) => {
                const metadata = await this.resolvePageMetadata(req);
                const html = this.renderHtmlDocument(await this.getFrontendIndexHtml(), metadata);
                res.type('html').send(html);
            });
        }

        this.app = app;
    }

    private async getFrontendIndexHtml(): Promise<string> {
        if (this.frontendIndexHtmlPromise) {
            return this.frontendIndexHtmlPromise;
        }

        this.frontendIndexHtmlPromise = readFile(join(this.frontendDistPath, 'index.html'), 'utf8')
            .catch((error: unknown) => {
                this.frontendIndexHtmlPromise = null;
                this.logger.error({
                    err: error,
                    event: 'frontend.index.read.failed',
                    frontendDistPath: this.frontendDistPath
                }, 'Failed to read frontend index.html');
                throw error;
            });

        return this.frontendIndexHtmlPromise;
    }

    private renderHtmlDocument(html: string, metadata: PageMetadata): string {
        let renderedHtml = html;

        renderedHtml = replaceOrInsertTag(
            renderedHtml,
            /<title>.*?<\/title>/is,
            `<title>${escapeHtml(metadata.title)}</title>`
        );
        renderedHtml = replaceOrInsertMetaName(renderedHtml, 'description', metadata.description);
        renderedHtml = replaceOrInsertMetaName(renderedHtml, 'robots', metadata.robots);
        renderedHtml = replaceOrInsertMetaProperty(renderedHtml, 'og:type', metadata.ogType);
        renderedHtml = replaceOrInsertMetaProperty(renderedHtml, 'og:title', metadata.title);
        renderedHtml = replaceOrInsertMetaProperty(renderedHtml, 'og:description', metadata.description);
        renderedHtml = replaceOrInsertMetaProperty(renderedHtml, 'og:image', metadata.imageUrl);
        renderedHtml = replaceOrInsertMetaProperty(renderedHtml, 'og:url', metadata.url);
        renderedHtml = replaceOrInsertMetaName(renderedHtml, 'twitter:card', 'summary');
        renderedHtml = replaceOrInsertMetaName(renderedHtml, 'twitter:title', metadata.title);
        renderedHtml = replaceOrInsertMetaName(renderedHtml, 'twitter:description', metadata.description);
        renderedHtml = replaceOrInsertMetaName(renderedHtml, 'twitter:image', metadata.imageUrl);
        renderedHtml = replaceOrInsertCanonicalLink(renderedHtml, metadata.url);

        return renderedHtml;
    }

    private async resolvePageMetadata(req: express.Request): Promise<PageMetadata> {
        const origin = `${req.protocol}://${req.get('host')}`;
        const url = new URL(req.originalUrl || req.url, origin);
        const defaultMetadata: PageMetadata = {
            title: DEFAULT_PAGE_TITLE,
            description: DEFAULT_OG_DESCRIPTION,
            url: url.toString(),
            imageUrl: new URL('/favicon.png', origin).toString(),
            ogType: 'website',
            robots: 'index, follow'
        };

        if (req.path === '/games') {
            return {
                ...defaultMetadata,
                title: `Finished Games Archive • ${DEFAULT_PAGE_TITLE}`,
                description: 'Browse finished Infinity Hexagonial Tic-Tac-Toe matches and review their move history.',
            };
        }

        const finishedGameMatch = req.path.match(/^\/games\/([^/]+)$/);
        if (finishedGameMatch) {
            const finishedGame = await this.gameHistoryRepository.getFinishedGame(decodeURIComponent(finishedGameMatch[1]));
            if (!finishedGame) {
                return {
                    ...defaultMetadata,
                    title: `Replay Not Found • ${DEFAULT_PAGE_TITLE}`,
                    description: 'The requested finished match could not be found.',
                    ogType: 'article',
                    robots: 'noindex, nofollow'
                };
            }

            return {
                ...defaultMetadata,
                title: `Replay ${finishedGame.sessionId} • ${DEFAULT_PAGE_TITLE}`,
                description: `Review finished match ${finishedGame.sessionId}: ${finishedGame.moveCount} moves, ${finishedGame.players.length} players, ended ${this.formatFinishReason(finishedGame.reason)}.`,
                ogType: 'article'
            };
        }

        const inviteSessionId = getSingleQueryValue(req.query.join);
        if (req.path === '/' && inviteSessionId) {
            const inviteSession = this.sessionManager.listSessions().find(session => session.id === inviteSessionId);
            if (!inviteSession) {
                return {
                    ...defaultMetadata,
                    title: `Invite Expired • ${DEFAULT_PAGE_TITLE}`,
                    description: `Session ${inviteSessionId} is no longer active. Open the lobby to host or join another match.`,
                    robots: 'noindex, nofollow'
                };
            }

            return {
                ...defaultMetadata,
                title: inviteSession.canJoin
                    ? `Join Lobby ${inviteSession.id} • ${DEFAULT_PAGE_TITLE}`
                    : `Spectate Match ${inviteSession.id} • ${DEFAULT_PAGE_TITLE}`,
                description: inviteSession.canJoin
                    ? `A player is waiting in lobby ${inviteSession.id}. Open the game to join the match immediately.`
                    : `A live Infinity Hexagonial Tic-Tac-Toe match is underway in session ${inviteSession.id}. Open to spectate it live.`,
                robots: 'noindex, nofollow'
            };
        }

        return {
            ...defaultMetadata,
            description: DEFAULT_PAGE_DESCRIPTION
        };
    }

    private formatFinishReason(reason: string): string {
        switch (reason) {
            case 'six-in-a-row':
                return 'with a six-in-a-row win';
            case 'disconnect':
                return 'after a disconnect';
            case 'timeout':
                return 'after a timeout';
            case 'terminated':
                return 'when the session was terminated';
            default:
                return 'after the match ended';
        }
    }
}
