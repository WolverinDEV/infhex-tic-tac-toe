import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import net from "node:net";

import { CronJob } from 'cron';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';

import { ServerSettingsService } from './admin/serverSettingsService';
import { ServerConfig } from './config/serverConfig';
import { EloRepository } from './elo/eloRepository';
import { ROOT_LOGGER } from './logger';
import { HttpApplication } from './network/createHttpApp';
import { SocketServerGateway } from './network/createSocketServer';
import { DatabaseMigrationRunner } from './persistence/databaseMigrationRunner';
import { MongoDatabase } from './persistence/mongoClient';
import { SessionManager } from './session/sessionManager';
import { GameTimeControlManager } from './simulation/gameTimeControlManager';
import { TournamentService } from './tournament/tournamentService';

@injectable()
export class ApplicationServer {
    private readonly logger: Logger;

    private readonly server: HttpServer;
    private readonly serverConnections = new Map<string, net.Socket>();
    private readonly cronJobs: CronJob[] = [];

    private shutdownPromise: Promise<void> | null = null;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(HttpApplication) httpApplication: HttpApplication,
        @inject(SocketServerGateway) private readonly socketServerGateway: SocketServerGateway,
        @inject(GameTimeControlManager) private readonly timeControl: GameTimeControlManager,
        @inject(DatabaseMigrationRunner) private readonly databaseMigrationRunner: DatabaseMigrationRunner,
        @inject(MongoDatabase) private readonly mongoDatabase: MongoDatabase,
        @inject(EloRepository) private readonly eloRepository: EloRepository,
        @inject(ServerSettingsService) private readonly serverSettingsService: ServerSettingsService,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(TournamentService) private readonly tournamentService: TournamentService,
        @inject(ServerConfig) private readonly serverConfig: ServerConfig,
    ) {
        this.logger = rootLogger.child({ component: `application-server` });
        this.server = createServer(httpApplication.app);
        socketServerGateway.attach(this.server);

        httpApplication.app.use((req, res, next) => {
            const requestId = randomUUID();
            res.on(`close`, () => {
                this.serverConnections.delete(requestId);
            });

            this.serverConnections.set(requestId, req.socket);
            next();
        });
    }

    async start(): Promise<void> {
        this.logger.info({
            event: `server.config`,
            config: this.serverConfig.toLogObject(),
        }, `Loaded server config`);

        this.logger.info({
            event: `server.starting`,
            port: this.serverConfig.port,
        }, `Starting server`);

        await this.databaseMigrationRunner.run();
        await this.eloRepository.initialize();
        await this.serverSettingsService.initialize();

        await this.startCronJobs();

        this.server.on(`error`, (error) => {
            this.logger.error({
                err: error,
                event: `server.error`,
            }, `HTTP server error`);
        });

        this.server.on(`close`, () => {
            this.logger.info({
                event: `server.closed`,
            }, `Server closed`);
        });

        await new Promise<void>((resolve, reject) => {
            const onListenError = (error: Error) => {
                reject(error);
            };

            this.server.once(`error`, onListenError);
            this.server.listen(this.serverConfig.port, () => {
                this.server.off(`error`, onListenError);
                this.logger.info({
                    event: `server.listening`,
                    port: this.serverConfig.port,
                }, `Server listening`);
                resolve();
            });
        });
    }

    async shutdown(): Promise<void> {
        if (this.shutdownPromise) {
            return this.shutdownPromise;
        }

        this.shutdownPromise = (async () => {
            this.logger.info({ event: `server.shutting-down` }, `Shutting down server`);

            await this.shutdownHttpServer();

            await this.stopCronJobs();
            this.timeControl.dispose();

            try {
                await this.mongoDatabase.close();
            } catch (error: unknown) {
                this.logger.error({
                    err: error,
                    event: `mongo.close.error`,
                }, `Failed to close MongoDB client`);
                throw error;
            }
        })();

        return this.shutdownPromise;
    }

    private async shutdownHttpServer() {
        if (!this.server.listening) {
            return;
        }

        this.logger.debug({ event: `server.shutting-down` }, `Stopping HTTP server`);
        await this.socketServerGateway.shutdownConnections();

        setTimeout(() => {
            /* force close connections */
            for (const connection of this.serverConnections.values()) {
                connection.destroy(new Error(`forced close due to server shutdown`));
            }
        }, 5_000);

        await Promise.race([
            new Promise<void>((resolve) => {
                this.server.close((error) => {
                    if (error) {
                        this.logger.error({
                            err: error,
                            event: `http.close.error`,
                        }, `Failed to shutdown the HTTP server`);
                    }
                    resolve();
                });
            }),
            new Promise(resolve => setTimeout(resolve, 1_000)),
        ]);
        this.logger.debug({ event: `server.shutting-down` }, `HTTP server stopped`);
    }

    private scheduleCronJob(options: {
        name: string,
        time: string,
        callback: () => Promise<void>,
    }) {
        const job = CronJob.from({
            cronTime: options.time,
            start: true,
            onTick: () => {
                this.logger.debug(
                    {
                        event: `cronjob.execute`,
                        cronName: options.name,
                    },
                    `Executing cron job`,
                );

                options.callback()
                    .then(() => {
                        this.logger.debug({
                            event: `cronjob.executed`,
                            cronName: options.name,
                        }, `Cron job executed successfully`);
                    })
                    .catch(error => {
                        this.logger.warn({
                            event: `cronjob.error`,
                            cronName: options.name,
                            cronTime: options.time,
                            error,
                        }, `Cron job execution failed with error`);
                    });
            },
        });

        this.cronJobs.push(job);
        this.logger.info({
            event: `cronjob.started`,
            cronName: options.name,
            cronTime: options.time,
        }, `Started a new cron job`);
    }

    private async startCronJobs() {
        await this.stopCronJobs();

        this.scheduleCronJob({
            name: `Session Tick`,
            time: `*/10 * * * * *`,
            callback: () => this.sessionManager.tickAllSessions(),
        });

        this.scheduleCronJob({
            name: `Tournament Reconcile`,
            time: `*/10 * * * * *`,
            callback: () => this.tournamentService.reconcileAllTournaments(),
        });

        this.logger.info({
            event: `lobby-cleanup.started`,
            cronTime: `0 * * * * *`,
        }, `Started lobby cleanup cron job`);
    }

    private async stopCronJobs() {
        while (this.cronJobs.length > 0) {
            const job = this.cronJobs.pop();
            void job?.stop();
        }
    }
}
