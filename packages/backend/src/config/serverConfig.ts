import '../env.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectable } from 'tsyringe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

@injectable()
export class ServerConfig {
    readonly frontendDistPath = join(__dirname, '../../../frontend/dist');
    readonly mongoUri = this.requireEnv('MONGODB_URI');
    readonly mongoDbName = process.env.MONGODB_DB_NAME ?? 'ih3t';
    readonly port: string | number = process.env.PORT || 3001;
    readonly rematchTtlMs = this.parsePositiveInt(process.env.REMATCH_TTL_MS);

    private requireEnv(name: string): string {
        const value = process.env[name]?.trim();
        if (!value) {
            throw new Error(`Missing required environment variable ${name}`);
        }

        return value;
    }

    private parsePositiveInt(value: string | undefined): number | null {
        if (!value) {
            return null;
        }

        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return null;
        }

        return parsed;
    }
}
