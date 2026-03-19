import { resolve } from 'node:path';
import pino, { type Logger } from 'pino';
import { RotatingFileStream } from './rotatingFileStream';

export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

const SERVER_LOG_DIRECTORY = 'logs';
const SERVER_LOG_FILE_NAME = 'server.log';
const MAX_LOG_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_LOG_SIZE_BYTES = 500 * 1024 * 1024;

let sharedServerLogFileStream: RotatingFileStream | null = null;

interface CreateRootLoggerOptions {
    level?: string;
    pretty?: boolean;
}

export function createRootLogger(options: CreateRootLoggerOptions = {}): Logger {
    const level = options.level ?? process.env.LOG_LEVEL?.trim() ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    const pretty = options.pretty ?? resolvePrettyLogsSetting(process.env.LOG_PRETTY);
    const consoleStream = pretty ? pino.transport({
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    }) : process.stdout;

    return pino(
        {
            level,
            base: {},
            timestamp: pino.stdTimeFunctions.isoTime,
            formatters: {
                level: (label) => ({ level: label })
            }
        },
        pino.multistream([
            { stream: getServerLogFileStream() },
            { stream: consoleStream }
        ])
    );
}

function getServerLogFileStream(): RotatingFileStream {
    sharedServerLogFileStream ??= new RotatingFileStream({
        filePath: resolve(process.cwd(), SERVER_LOG_DIRECTORY, SERVER_LOG_FILE_NAME),
        maxFileSizeBytes: MAX_LOG_FILE_SIZE_BYTES,
        maxTotalSizeBytes: MAX_TOTAL_LOG_SIZE_BYTES
    });

    return sharedServerLogFileStream;
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
