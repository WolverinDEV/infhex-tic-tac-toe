import '../env.js';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { injectable } from 'tsyringe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

@injectable()
export class ServerConfig {
    readonly frontendDistPath = this.parsePathEnv(`FRONTEND_DIST_PATH`) ?? resolve(__dirname, `../../../frontend/dist`);
    readonly mongoUri = this.requireEnv(`MONGODB_URI`);
    readonly mongoDbName = process.env.MONGODB_DB_NAME ?? `ih3t`;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    readonly port: string | number = process.env.PORT || 3001;
    readonly authSecret = this.requireEnv(`AUTH_SECRET`);
    readonly discordClientId = this.requireFirstEnv(`AUTH_DISCORD_ID`, `DISCORD_CLIENT_ID`);
    readonly discordClientSecret = this.requireFirstEnv(`AUTH_DISCORD_SECRET`, `DISCORD_CLIENT_SECRET`);
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    readonly logLevel = process.env.LOG_LEVEL?.trim() || (process.env.NODE_ENV === `production` ? `info` : `debug`);
    readonly prettyLogs = this.parseBoolean(process.env.LOG_PRETTY) ?? process.env.NODE_ENV !== `production`;
    readonly botHttpTimeoutMs = this.parseIntegerEnv(`BOT_HTTP_TIMEOUT_MS`) ?? 15_000;

    toLogObject() {
        return {
            frontendDistPath: this.frontendDistPath,
            mongoDbName: this.mongoDbName,
            mongoUriConfigured: true,
            port: this.port,
            authSecretConfigured: true,
            discordClientConfigured: true,
            logLevel: this.logLevel,
            prettyLogs: this.prettyLogs,
            botHttpTimeoutMs: this.botHttpTimeoutMs,
        };
    }

    private requireEnv(name: string): string {
        const value = process.env[name]?.trim();
        if (!value) {
            throw new Error(`Missing required environment variable ${name}`);
        }

        return value;
    }

    private requireFirstEnv(...names: string[]): string {
        for (const name of names) {
            const value = process.env[name]?.trim();
            if (value) {
                return value;
            }
        }

        throw new Error(`Missing required environment variable ${names.join(` or `)}`);
    }

    private parsePathEnv(name: string): string | null {
        const value = process.env[name]?.trim();
        if (!value) {
            return null;
        }

        return resolve(value);
    }

    private parseBoolean(value: string | undefined): boolean | null {
        if (!value) {
            return null;
        }

        const normalized = value.trim().toLowerCase();
        if (normalized === `true`) {
            return true;
        }

        if (normalized === `false`) {
            return false;
        }

        return null;
    }

    private parseIntegerEnv(name: string): number | null {
        const value = process.env[name]?.trim();
        if (!value) {
            return null;
        }

        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
}
