import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';

import { ROOT_LOGGER } from '../logger';
import type { MetricDetails } from '../persistence/metricsRepository';
import { MetricsRepository } from '../persistence/metricsRepository';

@injectable()
export class MetricsTracker {
    private readonly logger: Logger;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(MetricsRepository) private readonly metricsRepository: MetricsRepository,
    ) {
        this.logger = rootLogger.child({ component: `metrics-tracker` });
    }

    track(event: string, details: MetricDetails): void {
        const document = {
            event,
            timestamp: new Date().toISOString(),
            details,
        };

        this.logger.trace({
            event: `metric.tracked`,
            metricEvent: event,
            details,
        }, `Tracked metric`);
        void this.metricsRepository.persist(document);
    }
}
