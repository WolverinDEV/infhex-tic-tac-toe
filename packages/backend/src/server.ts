import './env';
import 'reflect-metadata';
import { createAppContainer } from './di/createAppContainer';
import { ApplicationServer } from './serverRuntime';

const appContainer = createAppContainer();
const applicationServer = appContainer.resolve(ApplicationServer);

await applicationServer.start().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
