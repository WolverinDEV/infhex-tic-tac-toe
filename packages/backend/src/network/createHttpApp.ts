import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import cors from 'cors';
import express from 'express';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { AuthService } from '../auth/authService';
import { ServerConfig } from '../config/serverConfig';
import { ROOT_LOGGER } from '../logger';
import { CorsConfiguration } from './cors';
import { FrontendSsrRenderer } from './frontendSsr';
import { ApiQueryService } from './rest/apiQueryService';
import { ApiRouter } from './rest/createApiRouter';

@injectable()
export class HttpApplication {
    readonly app: express.Application;
    private readonly frontendDistPath: string;
    private readonly frontendSsrRenderer: FrontendSsrRenderer;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(AuthService) authService: AuthService,
        @inject(ApiQueryService) apiQueryService: ApiQueryService,
        @inject(ApiRouter) apiRouter: ApiRouter,
        @inject(CorsConfiguration) corsConfiguration: CorsConfiguration,
        @inject(ServerConfig) serverConfig: ServerConfig,
    ) {
        const app = express();
        const logger = rootLogger.child({ component: `http-application` });
        const corsOptions = corsConfiguration.options;
        this.frontendDistPath = `${serverConfig.frontendDistPath}/client`;
        this.frontendSsrRenderer = new FrontendSsrRenderer({
            apiQueryService,
            ssrDistPath: serverConfig.frontendDistPath,
        });

        app.set(`trust proxy`, true);

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
                remoteAddress: req.ip,
            });

            res.on(`finish`, () => {
                const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
                requestLogger.trace({
                    event: `http.request.completed`,
                    statusCode: res.statusCode,
                    durationMs: Number(durationMs.toFixed(3)),
                    contentLength: res.getHeader(`content-length`) ?? null,
                    userAgent: req.get(`user-agent`) ?? null,
                }, `HTTP request completed`);
            });

            next();
        });

        app.use(`/auth`, express.urlencoded({ extended: false }), express.json(), authService.handler);
        app.use(`/api`, apiRouter.router);
        app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (!(error instanceof z.ZodError)) {
                next(error);
                return;
            }

            logger.warn({
                err: error,
                event: `http.request.invalid`,
                method: req.method,
                path: req.originalUrl,
                issues: error.issues,
            }, `HTTP request validation failed`);

            const friendlyMessage = error.issues
                .map((issue) => {
                    const field = issue.path.length > 0 ? issue.path.join(`.`) : `input`;
                    return `${field}: ${issue.message}`;
                })
                .join(`; `);

            res.status(400).json({
                error: friendlyMessage,
                issues: error.issues,
            });
        });

        if (existsSync(this.frontendDistPath)) {
            app.use(express.static(this.frontendDistPath, { index: false }));
            app.get(/^(?!\/api(?:\/|$)|\/socket\.io(?:\/|$)).*/, async (req, res) => {
                const joinRedirectUrl = this.resolveJoinRedirectUrl(req);
                if (joinRedirectUrl) {
                    res.redirect(302, joinRedirectUrl);
                    return;
                }

                const archiveRedirectUrl = this.resolveArchiveRedirectUrl(req);
                if (archiveRedirectUrl) {
                    res.redirect(302, archiveRedirectUrl);
                    return;
                }

                const html = await this.frontendSsrRenderer.render(req);
                res.type(`html`).send(html);
            });
        }

        this.app = app;
    }

    private resolveJoinRedirectUrl(req: express.Request): string | null {
        if (req.path !== `/`) {
            return null;
        }

        const origin = `${req.protocol}://${req.get(`host`)}`;
        const url = new URL(req.originalUrl || req.url, origin);
        const sessionId = String(url.searchParams.get(`join`) ?? ``).trim();
        if (!sessionId) {
            return null;
        }

        return `/session/${encodeURIComponent(sessionId)}`;
    }

    private resolveArchiveRedirectUrl(req: express.Request): string | null {
        if (req.path !== `/games` && req.path !== `/account/games`) {
            return null;
        }

        const origin = `${req.protocol}://${req.get(`host`)}`;
        const url = new URL(req.originalUrl || req.url, origin);
        const atValue = Number.parseInt(url.searchParams.get(`at`) ?? ``, 10);
        if (Number.isFinite(atValue) && atValue > 0) {
            return null;
        }

        url.searchParams.set(`at`, String(Date.now()));
        return `${url.pathname}?${url.searchParams.toString()}`;
    }
}
