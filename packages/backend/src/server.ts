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
const IMMEDIATE_SHUTDOWN_SIGNAL_COUNT = 3;
const FORCED_SHUTDOWN_SIGNAL_COUNT = 5;

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
    const shutdownCompleted = new Promise<void>(resolve => {
        let shutdownPromise: Promise<void> | null = null;
        let signalCount = 0;

        const runApplicationShutdown = () => {
            stopTerminalShutdownScheduler();
            if (shutdownPromise) {
                return shutdownPromise;
            }

            shutdownPromise = applicationServer.shutdown()
                .then(() => {
                    resolve();
                })
                .catch((error: unknown) => {
                    bootstrapLogger.error({
                        err: error,
                        event: 'server.shutdown.failed',
                        source: 'scheduled'
                    }, 'Scheduled shutdown failed');
                    process.exit(1);
                });

            return shutdownPromise;
        };

        sessionManager.setShutdownHandler(() => {
            void runApplicationShutdown();
        });

        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.on(signal, () => {
                signalCount += 1;

                if (signalCount >= FORCED_SHUTDOWN_SIGNAL_COUNT) {
                    bootstrapLogger.warn({
                        event: 'server.shutdown.signal-forced',
                        signal,
                        signalCount
                    }, 'Received fith shutdown signal; force exiting');
                    process.exit(0);
                } else if (signalCount >= IMMEDIATE_SHUTDOWN_SIGNAL_COUNT) {
                    bootstrapLogger.warn({
                        event: 'server.shutdown.signal-immediate',
                        signal,
                        signalCount
                    }, 'Received third shutdown signal; exiting without waiting');
                    runApplicationShutdown();
                    return;
                }

                const existingShutdown = sessionManager.getShutdownState();
                const shutdown = sessionManager.scheduleShutdown(DEFAULT_SCHEDULED_SHUTDOWN_MS);
                bootstrapLogger.info({
                    event: existingShutdown ? 'server.shutdown.signal-repeat' : 'server.shutdown.signal',
                    signal,
                    signalCount,
                    shutdownAt: new Date(shutdown.shutdownAt).toISOString(),
                    timeoutMs: shutdown.shutdownAt - shutdown.scheduledAt
                }, existingShutdown
                    ? `Received shutdown signal ${signalCount}/${FORCED_SHUTDOWN_SIGNAL_COUNT}; graceful shutdown already scheduled`
                    : 'Received shutdown signal; scheduled graceful shutdown');
            });
        }
    });

    await shutdownCompleted;

    process.exit(0);
}

void main().catch((error: unknown) => {
    bootstrapLogger.fatal({
        err: error,
        event: 'server.failed'
    }, 'Server loop failed unexpectedly');
    process.exit(1);
});
