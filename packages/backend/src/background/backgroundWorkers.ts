import { injectable } from 'tsyringe';
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

    constructor(private readonly metricsRepository: MetricsRepository) {}

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
    }

    stop(): void {
        if (!this.cleanupTimer) {
            return;
        }

        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
    }

    track(event: string, details: MetricDetails): void {
        const document = {
            event,
            timestamp: new Date().toISOString(),
            details
        };

        console.log(JSON.stringify(document));
        void this.metricsRepository.persist(document);
    }
}
