import type { CorsOptions } from 'cors';
import { injectable } from 'tsyringe';

@injectable()
export class CorsConfiguration {
    readonly allowedOrigins = this.createAllowedOrigins();
    readonly options: CorsOptions | null = this.createOptions();

    isAllowedOrigin(origin: string): boolean {
        return this.allowedOrigins.has(origin);
    }

    private createAllowedOrigins(): Set<string> {
        const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? ``)
            .split(`,`)
            .map((origin) => origin.trim())
            .filter(Boolean);
        const allowedOrigins = new Set(configuredOrigins);

        if (process.env.NODE_ENV !== `production`) {
            allowedOrigins.add(`http://localhost:3001`);
            allowedOrigins.add(`http://localhost:5173`);
            allowedOrigins.add(`http://127.0.0.1:5173`);
        }

        return allowedOrigins;
    }

    private createOptions(): CorsOptions | null {
        const allowedOrigins = this.allowedOrigins;
        if (allowedOrigins.size === 0) {
            return null;
        }

        return {
            origin(origin, callback) {
                if (!origin || allowedOrigins.has(origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error(`Origin ${origin} is not allowed by CORS`));
            },
            methods: [
                `GET`, `POST`, `PATCH`, `PUT`, `OPTIONS`, `DELETE`,
            ],
            allowedHeaders: [`Content-Type`, `X-Device-Id`],
            credentials: true,
        };
    }
}
