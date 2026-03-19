import './env';
import 'reflect-metadata';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContainer } from './di/createAppContainer';
import { ApplicationServer } from './serverRuntime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDistPath = join(__dirname, '../../frontend/dist');

const appContainer = createAppContainer({
    frontendDistPath
});
const applicationServer = appContainer.resolve(ApplicationServer);

void applicationServer.start().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
