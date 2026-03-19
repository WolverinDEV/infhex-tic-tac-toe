import './env';
import 'reflect-metadata';
import { createAppContainer } from './di/createAppContainer';
import { createRootLogger } from './logger';
import { ApplicationServer } from './serverRuntime';

const bootstrapLogger = createRootLogger();

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

    await applicationServer.start().catch((error: unknown) => {
        bootstrapLogger.fatal({
            err: error,
            event: 'server.startup.failed'
        }, 'Server failed to start');
        process.exit(1);
    });

    await shutdownSignal().then(signal => {
        bootstrapLogger.info({
            event: 'server.shutdown.signal',
            signal
        }, 'Received shutdown signal');
    });

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