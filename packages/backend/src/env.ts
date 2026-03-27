import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPaths = [
    resolve(__dirname, `../.env`),
    resolve(__dirname, `../../../.env`),
    resolve(__dirname, `../.env.local`),
    resolve(__dirname, `../../../.env.local`),
];

for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
        continue;
    }

    config({ path: envPath, override: false });
}
