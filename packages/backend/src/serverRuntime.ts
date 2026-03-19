import net from "node:net";
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
import { randomUUID } from "node:crypto";

@injectable()
export class ApplicationServer {
    private readonly logger: Logger;

    private readonly server: HttpServer;
    private readonly serverConnections = new Map<string, net.Socket>();

    private shutdownPromise: Promise<void> | null = null;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(HttpApplication) httpApplication: HttpApplication,
        @inject(SocketServerGateway) private readonly socketServerGateway: SocketServerGateway,
        @inject(BackgroundWorkerHub) private readonly backgroundWorkers: BackgroundWorkerHub,
        @inject(GameSimulation) private readonly simulation: GameSimulation,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(ServerConfig) private readonly serverConfig: ServerConfig
    ) {
        this.logger = rootLogger.child({ component: 'application-server' });
        this.server = createServer(httpApplication.app);
        socketServerGateway.attach(this.server);

        httpApplication.app.use((req, res, next) => {
            const requestId = randomUUID();
            res.on('close', () => {
                this.serverConnections.delete(requestId);
            });

            this.serverConnections.set(requestId, req.socket);
            next();
        });
    }

    async start(): Promise<void> {
        this.logger.info({
            event: 'server.config',
            config: this.serverConfig.toLogObject()
        }, 'Loaded server config');

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
        });

        await new Promise<void>((resolve, reject) => {
            const onListenError = (error: Error) => {
                reject(error);
            };

            this.server.once('error', onListenError);
            this.server.listen(this.serverConfig.port, () => {
                this.server.off('error', onListenError);
                this.logger.info({
                    event: 'server.listening',
                    port: this.serverConfig.port
                }, 'Server listening');
                resolve();
            });
        });
    }

    async shutdown(): Promise<void> {
        if (this.shutdownPromise) {
            return this.shutdownPromise;
        }

        this.shutdownPromise = (async () => {
            this.logger.info({ event: 'server.shutting-down' }, 'Shutting down server');

            await this.shutdownHttpServer();

            this.backgroundWorkers.stop();
            this.simulation.dispose();

            try {
                await this.mongoDatabase.close();
            } catch (error: unknown) {
                this.logger.error({
                    err: error,
                    event: 'mongo.close.error'
                }, 'Failed to close MongoDB client');
                throw error;
            }
        })();

        return this.shutdownPromise;
    }

    private async shutdownHttpServer() {
        if (!this.server.listening) {
            return;
        }

        this.logger.debug({ event: 'server.shutting-down' }, 'Stopping HTTP server');
        this.socketServerGateway.shutdownConnections();

        setTimeout(() => {
            /* force close connections */
            for (const connection of this.serverConnections.values()) {
                connection.destroy(new Error("forced close due to server shutdown"));
            }
        }, 5_000);

        await Promise.race([
            new Promise<void>((resolve) => {
                this.server.close((error) => {
                    if (error) {
                        this.logger.error({
                            err: error,
                            event: 'http.close.error'
                        }, 'Failed to shutdown the HTTP server');
                    }
                    resolve();
                });
            }),
            new Promise(resolve => setTimeout(resolve, 1_000)),
        ]);
        this.logger.debug({ event: 'server.shutting-down' }, 'HTTP server stopped');
    }
}
