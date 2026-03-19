import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { inject, injectable } from 'tsyringe';
import { BackgroundWorkerHub } from './background/backgroundWorkers';
import { ServerTokens } from './di/tokens';
import { HttpApplication } from './network/createHttpApp';
import { SocketServerGateway } from './network/createSocketServer';
import { MongoDatabase } from './persistence/mongoClient';
import { SessionManager } from './session/sessionManager';
import { GameSimulation } from './simulation/gameSimulation';

@injectable()
export class ApplicationServer {
    private readonly server: HttpServer;

    constructor(
        httpApplication: HttpApplication,
        socketServerGateway: SocketServerGateway,
        private readonly backgroundWorkers: BackgroundWorkerHub,
        private readonly simulation: GameSimulation,
        private readonly mongoDatabase: MongoDatabase,
        private readonly sessionManager: SessionManager,
        @inject(ServerTokens.Port) private readonly port: string | number,
        @inject(ServerTokens.RematchTtlMs) private readonly rematchTtlMs: number | null
    ) {
        this.server = createServer(httpApplication.app);
        socketServerGateway.attach(this.server);
    }

    async start(): Promise<void> {
        await this.mongoDatabase.getDatabase();

        this.backgroundWorkers.start({
            rematchTtlMs: this.rematchTtlMs,
            onCleanupExpiredRematches: (maxAgeMs) => {
                this.sessionManager.expireStaleRematches(maxAgeMs);
            }
        });

        this.server.listen(this.port, () => {
            console.log(`Server running on port ${this.port}`);
        });

        this.server.on('close', () => {
            this.backgroundWorkers.stop();
            this.simulation.dispose();
            void this.mongoDatabase.close();
        });

        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.once(signal, () => {
                this.server.close(() => {
                    process.exit(0);
                });
            });
        }
    }
}
