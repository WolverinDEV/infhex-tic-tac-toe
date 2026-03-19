import './env';
import 'reflect-metadata';
import { createAppContainer } from './di/createAppContainer';
import { createRootLogger } from './logger';
import { ApplicationServer } from './serverRuntime';

const bootstrapLogger = createRootLogger();
const appContainer = createAppContainer();
const applicationServer = appContainer.resolve(ApplicationServer);

await applicationServer.start().catch((error: unknown) => {
    bootstrapLogger.fatal({
        err: error,
        event: 'server.startup.failed'
    }, 'Server failed to start');
    process.exit(1);
});
