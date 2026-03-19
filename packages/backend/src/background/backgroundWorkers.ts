import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';
import { ROOT_LOGGER } from '../logger';
import type { MetricDetails } from '../persistence/metricsRepository';
import { MetricsRepository } from '../persistence/metricsRepository';

interface BackgroundWorkerOptions {
    rematchTtlMs?: number | null;
    cleanupIntervalMs?: number;
    onCleanupExpiredRematches?: (maxAgeMs: number) => void;
}

@injectable()
export class BackgroundWorkerHub {
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MetricsRepository) private readonly metricsRepository: MetricsRepository
    ) {
        this.logger = rootLogger.child({ component: 'background-worker-hub' });
    }

    start(options: BackgroundWorkerOptions = {}): void {
        const { rematchTtlMs, cleanupIntervalMs, onCleanupExpiredRematches } = options;
        if (!rematchTtlMs || rematchTtlMs <= 0 || !onCleanupExpiredRematches) {
            return;
        }

        this.stop();

        const intervalMs = cleanupIntervalMs ?? Math.min(rematchTtlMs, 30_000);
        this.cleanupTimer = setInterval(() => {
            onCleanupExpiredRematches(rematchTtlMs);
        }, intervalMs);
        this.cleanupTimer.unref?.();
        this.logger.info({
            event: 'rematch-cleanup.started',
            rematchTtlMs,
            intervalMs
        }, 'Started rematch cleanup worker');
    }

    stop(): void {
        if (!this.cleanupTimer) {
            return;
        }

        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
        this.logger.info({
            event: 'rematch-cleanup.stopped'
        }, 'Stopped rematch cleanup worker');
    }

    track(event: string, details: MetricDetails): void {
        const document = {
            event,
            timestamp: new Date().toISOString(),
            details
        };

        this.logger.info({
            event: 'metric.tracked',
            metricEvent: event,
            details
        }, 'Tracked metric');
        void this.metricsRepository.persist(document);
    }
}
