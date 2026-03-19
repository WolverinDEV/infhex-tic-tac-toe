import './env';
import 'reflect-metadata';
import { createAppContainer } from './di/createAppContainer';
import { createRootLogger } from './logger';
import { SocketServerGateway } from './network/createSocketServer';
import { ApplicationServer } from './serverRuntime';
import { SessionManager } from './session/sessionManager';
import { startTerminalCommandHandler } from './terminal/startTerminalCommandHandler';

const bootstrapLogger = createRootLogger();
const DEFAULT_SCHEDULED_SHUTDOWN_MS = 10 * 60 * 1000;

async function shutdownSignal(): Promise<NodeJS.Signals> {
    return await new Promise<NodeJS.Signals>(resolve => {
        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.once(signal, () => resolve(signal));
        }
    })
}

async function main() {
    const appContainer = createAppContainer();
    const applicationServer = appContainer.resolve(ApplicationServer);
    const sessionManager = appContainer.resolve(SessionManager);
    const socketServerGateway = appContainer.resolve(SocketServerGateway);

    await applicationServer.start().catch((error: unknown) => {
        bootstrapLogger.fatal({
            err: error,
            event: 'server.startup.failed'
        }, 'Server failed to start');
        process.exit(1);
    });

    const stopTerminalShutdownScheduler = startTerminalCommandHandler({
        logger: bootstrapLogger,
        sessionManager,
        socketServerGateway,
        shutdownDelayMs: DEFAULT_SCHEDULED_SHUTDOWN_MS
    });
    sessionManager.setShutdownHandler(() => {
        stopTerminalShutdownScheduler();
        void applicationServer.shutdown().catch((error: unknown) => {
            bootstrapLogger.error({
                err: error,
                event: 'server.shutdown.failed',
                source: 'scheduled'
            }, 'Scheduled shutdown failed');
            process.exit(1);
        });
    });

    await shutdownSignal().then(signal => {
        bootstrapLogger.info({
            event: 'server.shutdown.signal',
            signal
        }, 'Received shutdown signal');
    });

    stopTerminalShutdownScheduler();

    await applicationServer.shutdown().catch((error: unknown) => {
        bootstrapLogger.error({
            err: error,
            event: 'server.shutdown.failed',
        }, 'Server shutdown failed');
        process.exit(1);
    });

    process.exit(0);
}

void main().catch((error: unknown) => {
    bootstrapLogger.fatal({
        err: error,
        event: 'server.failed'
    }, 'Server loop failed unexpectedly');
    process.exit(1);
});
