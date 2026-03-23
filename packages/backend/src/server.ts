import './env';
import 'reflect-metadata';
import { createAppContainer } from './di/createAppContainer';
import { createRootLogger } from './logger';
import { ServerShutdownService } from './admin/serverShutdownService';
import { ApplicationServer } from './serverRuntime';

const bootstrapLogger = createRootLogger();
const DEFAULT_SCHEDULED_SHUTDOWN_MS = 10 * 60 * 1000;
const IMMEDIATE_SHUTDOWN_SIGNAL_COUNT = 3;
const FORCED_SHUTDOWN_SIGNAL_COUNT = 5;

async function main() {
    const appContainer = createAppContainer();
    const applicationServer = appContainer.resolve(ApplicationServer);
    const serverShutdownService = appContainer.resolve(ServerShutdownService);

    await applicationServer.start().catch((error: unknown) => {
        bootstrapLogger.fatal({
            err: error,
            event: 'server.startup.failed'
        }, 'Server failed to start');
        process.exit(1);
    });

    const shutdownCompleted = new Promise<void>(resolve => {
        let signalCount = 0;

        serverShutdownService.setShutdownHandler(() => {
            void applicationServer.shutdown()
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
        });

        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.on(signal, () => {
                signalCount += 1;

                if (signalCount >= FORCED_SHUTDOWN_SIGNAL_COUNT) {
                    bootstrapLogger.warn(
                        {
                            event: 'server.shutdown.signal-forced',
                            signal,
                            signalCount
                        },
                        'Received fith shutdown signal; force exiting'
                    );
                    process.exit(0);
                } else if (signalCount >= IMMEDIATE_SHUTDOWN_SIGNAL_COUNT) {
                    bootstrapLogger.warn(
                        {
                            event: 'server.shutdown.signal-immediate',
                            signal,
                            signalCount
                        },
                        'Received third shutdown signal; exiting without waiting'
                    );
                    serverShutdownService.requestImmediateShutdown();
                    return;
                }

                const existingShutdown = serverShutdownService.getShutdownState();
                const shutdown = serverShutdownService.requestShutdown(DEFAULT_SCHEDULED_SHUTDOWN_MS);
                bootstrapLogger.info(
                    {
                        event: existingShutdown ? 'server.shutdown.signal-repeat' : 'server.shutdown.signal',
                        signal,
                        signalCount,
                        shutdownAt: new Date(shutdown.gracefulTimeout).toISOString(),
                        timeoutMs: shutdown.gracefulTimeout - shutdown.scheduledAt
                    },
                    existingShutdown
                        ? `Received shutdown signal ${signalCount}/${FORCED_SHUTDOWN_SIGNAL_COUNT}; graceful shutdown already scheduled`
                        : 'Received shutdown signal; scheduled graceful shutdown'
                );
            });
        }
    });

    await shutdownCompleted;

    process.exit(0);
}

process.on("unhandledrejection", rejection => {
    rejection.preventDefault();
    bootstrapLogger.error(
        {
            event: 'server.unhandled-rejection',
            rejection
        },
        'Unhandled promise rejection'
    );
});

process.on("uncaughtException", event => {
    bootstrapLogger.error(
        {
            event: 'server.uncaught-exception',
            exception: event
        },
        'Unhandled promise rejection'
    );
});

void main().catch((error: unknown) => {
    bootstrapLogger.fatal({
        err: error,
        event: 'server.failed'
    }, 'Server loop failed unexpectedly');
    process.exit(1);
});
