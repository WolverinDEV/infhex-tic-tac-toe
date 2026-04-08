import '../env.js';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { injectable } from 'tsyringe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

@injectable()
export class ServerConfig {
    readonly isDevelopment = process.env.NODE_ENV !== `production`;
    readonly frontendDistPath = this.parsePathEnv(`FRONTEND_DIST_PATH`) ?? resolve(__dirname, `../../../frontend/dist`);
    readonly mongoUri = this.requireEnv(`MONGODB_URI`, `mongodb://127.0.0.1:27017`);
    readonly mongoDbName = process.env.MONGODB_DB_NAME ?? `ih3t`;
    readonly mongoUseMemoryFallback = this.parseBoolean(process.env.MONGODB_USE_MEMORY) ?? process.env.NODE_ENV !== `production`;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    readonly port: string | number = process.env.PORT || 3001;
    readonly authSecret = this.requireEnv(`AUTH_SECRET`, `development-auth-secret`);
    readonly discordClientId = this.requireFirstEnv([`AUTH_DISCORD_ID`, `DISCORD_CLIENT_ID`], `development-discord-client-id`);
    readonly discordClientSecret = this.requireFirstEnv([`AUTH_DISCORD_SECRET`, `DISCORD_CLIENT_SECRET`], `development-discord-client-secret`);
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    readonly logLevel = process.env.LOG_LEVEL?.trim() || (process.env.NODE_ENV === `production` ? `info` : `debug`);
    readonly prettyLogs = this.parseBoolean(process.env.LOG_PRETTY) ?? process.env.NODE_ENV !== `production`;

    toLogObject() {
        return {
            frontendDistPath: this.frontendDistPath,
            mongoDbName: this.mongoDbName,
            mongoUriConfigured: true,
            mongoUseMemoryFallback: this.mongoUseMemoryFallback,
            port: this.port,
            authSecretConfigured: true,
            discordClientConfigured: true,
            logLevel: this.logLevel,
            prettyLogs: this.prettyLogs,
        };
    }

    private requireEnv(name: string, developmentFallback?: string): string {
        const value = process.env[name]?.trim();
        if (!value) {
            if (this.isDevelopment && developmentFallback) {
                return developmentFallback;
            }

            throw new Error(`Missing required environment variable ${name}`);
        }

        return value;
    }

    private requireFirstEnv(envNames: readonly string[], developmentFallback?: string): string {
        const activeDevelopmentFallback = this.isDevelopment ? developmentFallback ?? null : null;

        for (const name of envNames) {
            const value = process.env[name]?.trim();
            if (value) {
                return value;
            }
        }

        if (activeDevelopmentFallback) {
            return activeDevelopmentFallback;
        }

        throw new Error(`Missing required environment variable ${envNames.join(` or `)}`);
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
}
