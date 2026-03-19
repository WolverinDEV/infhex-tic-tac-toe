import type { Logger } from 'pino';
import { SocketServerGateway } from '../network/createSocketServer';
import { SessionManager, type TerminalSessionStatus } from '../session/sessionManager';

interface StartTerminalCommandHandlerOptions {
    logger: Logger;
    sessionManager: SessionManager;
    socketServerGateway: SocketServerGateway;
    shutdownDelayMs: number;
}

export function startTerminalCommandHandler({
    logger: rootLogger,
    sessionManager,
    socketServerGateway,
    shutdownDelayMs
}: StartTerminalCommandHandlerOptions): () => void {
    const logger = rootLogger.child({ component: 'terminal-shutdown' });
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

        const normalizedCommand = command.toLowerCase();
        if (normalizedCommand === 'shutdown') {
            const existingShutdown = sessionManager.getShutdownState();
            const shutdown = sessionManager.scheduleShutdown(shutdownDelayMs);
            logger.info({
                event: existingShutdown ? 'shutdown.schedule.unchanged' : 'shutdown.schedule.commanded',
                shutdownAt: new Date(shutdown.shutdownAt).toISOString(),
                timeoutMs: shutdown.shutdownAt - shutdown.scheduledAt
            }, existingShutdown
                ? 'Shutdown was already scheduled'
                : 'Scheduled graceful shutdown from terminal');
            return;
        }

        if (normalizedCommand === 'status') {
            logRuntimeStatus(logger, sessionManager, socketServerGateway);
            return;
        }

        logger.warn({
            event: 'terminal.command.ignored',
            command
        }, 'Unknown terminal command');
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
        commands: ['status', 'shutdown'],
        timeoutMs: shutdownDelayMs
    }, 'Type "status" to inspect live activity or "shutdown" to schedule a graceful shutdown');

    return stop;
}

function logRuntimeStatus(
    logger: Logger,
    sessionManager: SessionManager,
    socketServerGateway: SocketServerGateway
) {
    const now = Date.now();
    const sessions = sessionManager.getTerminalSessionStatuses(now);
    const connectionStatus = socketServerGateway.getConnectionStatus();
    const liveGameCount = sessions.filter((session) => session.state === 'ingame').length;
    const waitingSessionCount = sessions.filter((session) => session.state === 'lobby').length;
    const reconnectingSuffix = connectionStatus.reconnectingClientCount > 0
        ? `, ${connectionStatus.reconnectingClientCount} reconnecting`
        : '';

    logger.info({
        event: 'terminal.command.status',
        connectedClientCount: connectionStatus.connectedClientCount,
        reconnectingClientCount: connectionStatus.reconnectingClientCount,
        liveGameCount,
        waitingSessionCount,
        totalSessionCount: sessions.length
    }, `Connected clients: ${connectionStatus.connectedClientCount}${reconnectingSuffix}; live games: ${liveGameCount}; waiting sessions: ${waitingSessionCount}`);

    if (sessions.length === 0) {
        logger.info({
            event: 'terminal.command.status.empty'
        }, 'No active sessions');
        return;
    }

    for (const session of sessions.sort(compareTerminalSessions)) {
        logger.info({
            event: 'terminal.command.status.session',
            sessionId: session.sessionId,
            state: session.state,
            playerCount: session.playerCount,
            spectatorCount: session.spectatorCount,
            moveCount: session.moveCount,
            createdAt: new Date(session.createdAt).toISOString(),
            startedAt: session.startedAt === null ? null : new Date(session.startedAt).toISOString(),
            currentTurnPlayerId: session.currentTurnPlayerId,
            placementsRemaining: session.placementsRemaining
        }, formatTerminalSessionStatus(session));
    }
}

function compareTerminalSessions(a: TerminalSessionStatus, b: TerminalSessionStatus): number {
    if (a.state !== b.state) {
        return sessionStateOrder(a.state) - sessionStateOrder(b.state);
    }

    return a.createdAt - b.createdAt;
}

function sessionStateOrder(state: TerminalSessionStatus['state']): number {
    switch (state) {
        case 'ingame':
            return 0;
        case 'lobby':
            return 1;
        case 'finished':
            return 2;
        default:
            return 3;
    }
}

function formatTerminalSessionStatus(session: TerminalSessionStatus): string {
    const participants = `${session.playerCount} player${session.playerCount === 1 ? '' : 's'}, ${session.spectatorCount} spectator${session.spectatorCount === 1 ? '' : 's'}`;
    const moveText = `move ${session.moveCount}`;

    if (session.state === 'ingame') {
        return `Session ${session.sessionId}: in game for ${formatDuration(session.gameDurationMs ?? 0)}, currently at ${moveText}, ${participants}, current turn ${session.currentTurnPlayerId ?? 'n/a'} (${session.placementsRemaining} placement${session.placementsRemaining === 1 ? '' : 's'} remaining)`;
    }

    if (session.state === 'lobby') {
        return `Session ${session.sessionId}: waiting in lobby for ${formatDuration(session.totalLifetimeMs)}, ${participants}`;
    }

    return `Session ${session.sessionId}: finished at ${moveText}, ${participants}`;
}

function formatDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}
