import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { ServerConfig } from '../config/serverConfig';
import { ROOT_LOGGER } from '../logger';
import { CorsConfiguration } from './cors';
import { ApiRouter } from './rest/createApiRouter';

@injectable()
export class HttpApplication {
    readonly app: express.Application;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ApiRouter) apiRouter: ApiRouter,
        @inject(CorsConfiguration) corsConfiguration: CorsConfiguration,
        @inject(ServerConfig) serverConfig: ServerConfig
    ) {
        const app = express();
        const logger = rootLogger.child({ component: 'http-application' });
        const corsOptions = corsConfiguration.options;
        const frontendDistPath = serverConfig.frontendDistPath;

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
            app.use(express.static(frontendDistPath));
            app.get(/^(?!\/api(?:\/|$)|\/socket\.io(?:\/|$)).*/, (_req, res) => {
                res.sendFile(join(frontendDistPath, 'index.html'));
            });
        }

        this.app = app;
    }
}
