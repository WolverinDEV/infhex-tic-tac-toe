import pino, { type Logger } from 'pino';

export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

interface CreateRootLoggerOptions {
    level?: string;
    pretty?: boolean;
}

export function createRootLogger(options: CreateRootLoggerOptions = {}): Logger {
    const level = options.level ?? process.env.LOG_LEVEL?.trim() ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    const pretty = options.pretty ?? resolvePrettyLogsSetting(process.env.LOG_PRETTY);

    return pino(
        {
            level,
            base: {},
            timestamp: pino.stdTimeFunctions.isoTime,
            formatters: {
                level: (label) => ({ level: label })
            }
        },
        pretty ? pino.transport({
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }) : undefined
    );
}

function resolvePrettyLogsSetting(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }

    if (normalized === 'false') {
        return false;
    }

    return process.env.NODE_ENV !== 'production';
}
