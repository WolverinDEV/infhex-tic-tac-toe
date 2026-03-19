import './env';
import 'reflect-metadata';
import { createAppContainer } from './di/createAppContainer';
import { createRootLogger } from './logger';
import { ApplicationServer } from './serverRuntime';
import { SessionManager } from './session/sessionManager';

const bootstrapLogger = createRootLogger();
const DEFAULT_SCHEDULED_SHUTDOWN_MS = 10 * 60 * 1000;

async function shutdownSignal(): Promise<NodeJS.Signals> {
    return await new Promise<NodeJS.Signals>(resolve => {
        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.once(signal, () => resolve(signal));
        }
    })
}

function startTerminalShutdownScheduler(sessionManager: SessionManager): () => void {
    const logger = bootstrapLogger.child({ component: 'terminal-shutdown' });
    let stopped = false;
    let bufferedInput = '';

    const stop = () => {
        if (stopped) {
            return;
        }

        stopped = true;
        process.stdin.off('data', handleData);
        process.stdin.pause();
    };

    const handleCommand = (command: string) => {
        if (!command) {
            return;
        }

        if (command.toLowerCase() !== 'shutdown') {
            logger.warn({
                event: 'terminal.command.ignored',
                command
            }, 'Unknown terminal command');
            return;
        }

        const existingShutdown = sessionManager.getShutdownState();
        const shutdown = sessionManager.scheduleShutdown(DEFAULT_SCHEDULED_SHUTDOWN_MS);
        logger.info({
            event: existingShutdown ? 'shutdown.schedule.unchanged' : 'shutdown.schedule.commanded',
            shutdownAt: new Date(shutdown.shutdownAt).toISOString(),
            timeoutMs: shutdown.shutdownAt - shutdown.scheduledAt
        }, existingShutdown
            ? 'Shutdown was already scheduled'
            : 'Scheduled graceful shutdown from terminal');
    };

    const handleData = (chunk: string | Buffer) => {
        bufferedInput += chunk.toString();

        let newlineIndex = bufferedInput.indexOf('\n');
        while (newlineIndex >= 0) {
            const command = bufferedInput.slice(0, newlineIndex).trim();
            bufferedInput = bufferedInput.slice(newlineIndex + 1);
            handleCommand(command);
            newlineIndex = bufferedInput.indexOf('\n');
        }
    };

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', handleData);
    process.stdin.resume();
    logger.info({
        event: 'terminal.command.ready',
        command: 'shutdown',
        timeoutMs: DEFAULT_SCHEDULED_SHUTDOWN_MS
    }, 'Type "shutdown" and press Enter to schedule a graceful shutdown');

    return stop;
}

async function main() {
    const appContainer = createAppContainer();
    const applicationServer = appContainer.resolve(ApplicationServer);
    const sessionManager = appContainer.resolve(SessionManager);

    await applicationServer.start().catch((error: unknown) => {
        bootstrapLogger.fatal({
            err: error,
            event: 'server.startup.failed'
        }, 'Server failed to start');
        process.exit(1);
    });

    const stopTerminalShutdownScheduler = startTerminalShutdownScheduler(sessionManager);
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
