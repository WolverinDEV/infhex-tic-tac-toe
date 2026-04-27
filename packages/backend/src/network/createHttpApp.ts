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
import { getRequestClientInfo } from './clientInfo';
import { CorsConfiguration } from './cors';
import { FrontendSsrRenderer } from './frontendSsr';
import { ApiQueryService, ApiRequestError } from './rest/apiQueryService';
import { ApiRouter } from './rest/createApiRouter';

type HttpErrorContext = {
    err?: Error;
    issues?: z.ZodIssue[];
    responseBody?: unknown;
};

function getHttpErrorContext(response: express.Response): HttpErrorContext | null {
    return (response.locals as { httpErrorContext?: HttpErrorContext }).httpErrorContext ?? null;
}

function setHttpErrorContext(response: express.Response, context: Partial<HttpErrorContext>): void {
    const locals = response.locals as { httpErrorContext?: HttpErrorContext };
    locals.httpErrorContext = {
        ...locals.httpErrorContext,
        ...context,
    };
}

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
            const client = getRequestClientInfo(req);
            const originalJson = res.json.bind(res);
            const requestLogger = logger.child({
                requestId,
                method: req.method,
                path: req.originalUrl,
                remoteAddress: req.ip,
                deviceId: client.deviceId,
                openReplaySessionId: client.openReplaySessionId,
            });

            res.json = ((body: unknown) => {
                if (res.statusCode >= 400) {
                    setHttpErrorContext(res, { responseBody: body });
                }

                return originalJson(body);
            }) as typeof res.json;

            res.on(`finish`, () => {
                const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
                const event = res.statusCode >= 400 ? `http.request.failed` : `http.request.completed`;
                const logContext = {
                    event,
                    statusCode: res.statusCode,
                    durationMs: Number(durationMs.toFixed(3)),
                    contentLength: res.getHeader(`content-length`) ?? null,
                    userAgent: req.get(`user-agent`) ?? null,
                    ...getHttpErrorContext(res),
                };

                if (res.statusCode >= 500) {
                    requestLogger.error(logContext, `HTTP request failed`);
                    return;
                }

                if (res.statusCode >= 400) {
                    requestLogger.warn(logContext, `HTTP request failed`);
                    return;
                }

                requestLogger.trace(logContext, `HTTP request completed`);
            });

            next();
        });

        app.use(`/auth`, express.urlencoded({ extended: false }), express.json(), authService.handler);
        app.use(`/api`, apiRouter.router);

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

        app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (!(error instanceof z.ZodError)) {
                next(error);
                return;
            }

            setHttpErrorContext(res, {
                err: error,
                issues: error.issues,
            });

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
        app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (res.headersSent) {
                next(error);
                return;
            }

            if (error instanceof ApiRequestError) {
                setHttpErrorContext(res, { err: error });
                res.status(error.statusCode).json({ error: error.message });
                return;
            }

            const normalizedError = error instanceof Error ? error : new Error(`Unexpected server error`);
            setHttpErrorContext(res, { err: normalizedError });
            res.status(500).json({ error: `Internal server error.` });
        });

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
        const now = Date.now();
        const atValue = Number.parseInt(url.searchParams.get(`at`) ?? ``, 10);
        if (Number.isFinite(atValue) && atValue > 0 && Math.abs(now - atValue) <= 2 * 60 * 1000) {
            return null;
        }

        url.searchParams.set(`at`, String(now));
        return `${url.pathname}?${url.searchParams.toString()}`;
    }
}
