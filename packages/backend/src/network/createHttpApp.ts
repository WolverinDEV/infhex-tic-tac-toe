import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { ServerTokens } from '../di/tokens';
import { CorsConfiguration } from './cors';
import { ApiRouter } from './rest/createApiRouter';

@injectable()
export class HttpApplication {
    readonly app: express.Application;

    constructor(
        apiRouter: ApiRouter,
        corsConfiguration: CorsConfiguration,
        @inject(ServerTokens.FrontendDistPath) frontendDistPath: string
    ) {
        const app = express();
        const corsOptions = corsConfiguration.options;

        app.set('trust proxy', true);

        if (corsOptions) {
            app.use(cors(corsOptions));
        }

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
