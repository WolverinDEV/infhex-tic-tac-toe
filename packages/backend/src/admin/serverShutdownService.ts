import type { ShutdownState } from '@ih3t/shared';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { ROOT_LOGGER } from '../logger';

const DEFAULT_SHUTDOWN_DELAY_MS = 10 * 60 * 1000;

type ShutdownMode = 'gracefull' | 'deadline-reached' | 'immediate';
type ShutdownBlockerCallback = () => boolean;

interface ServerShutdownServiceEventHandlers {
    shutdownUpdated?: (shutdown: ShutdownState | null) => void;
}

export interface ShutdownHook {
    tryShutdown(): void;
}

@injectable()
export class ServerShutdownService {
    private readonly logger: Logger;
    private readonly shutdownBlockers = new Set<ShutdownBlockerCallback>();
    private eventHandlers: ServerShutdownServiceEventHandlers = {};
    private pendingShutdown: ShutdownState | null = null;
    private gracefulTimeout: ReturnType<typeof setTimeout> | null = null;
    private shutdownInProgress = false;
    private shutdownHandler: (() => void) | null = null;

    constructor(@inject(ROOT_LOGGER) rootLogger: Logger) {
        this.logger = rootLogger.child({ component: 'server-shutdown-service' });
    }

    setEventHandlers(eventHandlers: ServerShutdownServiceEventHandlers): void {
        this.eventHandlers = eventHandlers;
    }

    setShutdownHandler(handler: () => void): void {
        this.shutdownHandler = handler;
        if (this.shutdownInProgress) {
            handler();
        }
    }

    createShutdownHook(callback: ShutdownBlockerCallback): ShutdownHook {
        this.shutdownBlockers.add(callback);

        return {
            tryShutdown: () => this.tryShutdown("gracefull"),
        };
    }

    isShutdownPending(): boolean {
        return this.shutdownInProgress || this.pendingShutdown !== null;
    }

    getShutdownState(): ShutdownState | null {
        if (!this.pendingShutdown) {
            return null;
        }

        return { ...this.pendingShutdown };
    }

    requestShutdown(gracefulTimeout = DEFAULT_SHUTDOWN_DELAY_MS): ShutdownState {
        if (this.pendingShutdown) {
            return { ...this.pendingShutdown };
        }

        const issuedAt = Date.now();
        this.pendingShutdown = {
            scheduledAt: issuedAt,
            gracefulTimeout: issuedAt + gracefulTimeout
        };
        this.shutdownInProgress = false;

        this.clearGracefulTimeout();
        this.gracefulTimeout = setTimeout(() => this.handleGracefulTimeout(), gracefulTimeout);

        this.emitShutdownUpdated();
        this.logger.info(
            {
                event: 'shutdown.scheduled',
                issuedAt: issuedAt,
                shutdownAt: this.pendingShutdown.gracefulTimeout
            },
            'Scheduled server shutdown'
        );

        setTimeout(() => this.tryShutdown('gracefull'), 0);
        return { ...this.pendingShutdown };
    }

    cancelShutdown(): boolean {
        if (!this.pendingShutdown) {
            return false;
        }

        const cancelledShutdown = { ...this.pendingShutdown };
        this.pendingShutdown = null;
        this.shutdownInProgress = false;
        this.clearGracefulTimeout();
        this.emitShutdownUpdated();
        this.logger.info(
            {
                event: 'shutdown.cancelled',
                issuedAt: cancelledShutdown.scheduledAt,
                gracefulTimeout: cancelledShutdown.gracefulTimeout
            },
            'Cancelled pending server shutdown'
        );

        return true;
    }

    requestImmediateShutdown(): void {
        this.executeApplicationShutdown('immediate');
    }

    private tryShutdown(trigger: Exclude<ShutdownMode, 'immediate'>): void {
        if (!this.pendingShutdown || this.shutdownInProgress) {
            return;
        }

        const blocked = Array.from(this.shutdownBlockers).some((callback) => callback());
        if (blocked) {
            return;
        }

        this.executeApplicationShutdown(trigger);
    }

    private handleGracefulTimeout(): void {
        if (!this.pendingShutdown) {
            return;
        }

        this.clearGracefulTimeout();
        this.logger.info(
            {
                event: 'shutdown.deadline-reached',
                gracefulTimeout: this.pendingShutdown.gracefulTimeout
            },
            'Graceful shutdown deadline reached; executing forceful shutdown'
        );

        this.executeApplicationShutdown("deadline-reached");
    }

    private executeApplicationShutdown(mode: ShutdownMode): void {
        if (this.shutdownInProgress) {
            return;
        }

        this.shutdownInProgress = true;
        this.clearGracefulTimeout();
        this.logger.info(
            {
                event: 'shutdown.execute',
                mode: mode,
            },
            "Executing server shutdown"
        );

        void this.shutdownHandler?.();
    }

    private emitShutdownUpdated(): void {
        this.eventHandlers.shutdownUpdated?.(this.getShutdownState());
    }

    private clearGracefulTimeout(): void {
        if (!this.gracefulTimeout) {
            return;
        }

        clearTimeout(this.gracefulTimeout);
        this.gracefulTimeout = null;
    }
}
