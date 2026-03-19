import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { BackgroundWorkerHub } from './background/backgroundWorkers';
import { ServerConfig } from './config/serverConfig';
import { ROOT_LOGGER } from './logger';
import { HttpApplication } from './network/createHttpApp';
import { SocketServerGateway } from './network/createSocketServer';
import { MongoDatabase } from './persistence/mongoClient';
import { SessionManager } from './session/sessionManager';
import { GameSimulation } from './simulation/gameSimulation';

@injectable()
export class ApplicationServer {
    private readonly server: HttpServer;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        httpApplication: HttpApplication,
        socketServerGateway: SocketServerGateway,
        private readonly backgroundWorkers: BackgroundWorkerHub,
        private readonly simulation: GameSimulation,
        private readonly mongoDatabase: MongoDatabase,
        private readonly sessionManager: SessionManager,
        private readonly serverConfig: ServerConfig
    ) {
        this.logger = rootLogger.child({ component: 'application-server' });
        this.server = createServer(httpApplication.app);
        socketServerGateway.attach(this.server);
    }

    async start(): Promise<void> {
        this.logger.info({
            event: 'server.starting',
            port: this.serverConfig.port
        }, 'Starting server');

        await this.mongoDatabase.getDatabase();

        this.backgroundWorkers.start({
            rematchTtlMs: this.serverConfig.rematchTtlMs,
            onCleanupExpiredRematches: (maxAgeMs) => {
                this.sessionManager.expireStaleRematches(maxAgeMs);
            }
        });

        this.server.listen(this.serverConfig.port, () => {
            this.logger.info({
                event: 'server.listening',
                port: this.serverConfig.port
            }, 'Server listening');
        });

        this.server.on('error', (error) => {
            this.logger.error({
                err: error,
                event: 'server.error'
            }, 'HTTP server error');
        });

        this.server.on('close', () => {
            this.logger.info({
                event: 'server.closed'
            }, 'Server closed');
            this.backgroundWorkers.stop();
            this.simulation.dispose();
            void this.mongoDatabase.close().catch((error: unknown) => {
                this.logger.error({
                    err: error,
                    event: 'mongo.close.error'
                }, 'Failed to close MongoDB client');
            });
        });

        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.once(signal, () => {
                this.logger.info({
                    event: 'server.shutdown.signal',
                    signal
                }, 'Received shutdown signal');
                this.server.close(() => {
                    process.exit(0);
                });
            });
        }
    }
}
