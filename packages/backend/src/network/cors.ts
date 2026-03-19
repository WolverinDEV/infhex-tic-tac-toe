import { injectable } from 'tsyringe';
import type { CorsOptions } from 'cors';

@injectable()
export class CorsConfiguration {
    readonly options: CorsOptions | null = this.createOptions();

    private createOptions(): CorsOptions | null {
        const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean);
        const allowedOrigins = new Set(configuredOrigins);

        if (process.env.NODE_ENV !== 'production') {
            allowedOrigins.add('http://localhost:5173');
            allowedOrigins.add('http://127.0.0.1:5173');
        }

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
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'X-Device-Id'],
            credentials: true
        };
    }
}
