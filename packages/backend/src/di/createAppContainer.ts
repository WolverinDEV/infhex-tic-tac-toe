import { container, type DependencyContainer } from 'tsyringe';
import { BackgroundWorkerHub } from '../background/backgroundWorkers';
import { ServerConfig } from '../config/serverConfig';
import { CorsConfiguration } from '../network/cors';
import { HttpApplication } from '../network/createHttpApp';
import { SocketServerGateway } from '../network/createSocketServer';
import { ApiRouter } from '../network/rest/createApiRouter';
import { GameHistoryRepository } from '../persistence/gameHistoryRepository';
import { MongoDatabase } from '../persistence/mongoClient';
import { MetricsRepository } from '../persistence/metricsRepository';
import { SessionManager } from '../session/sessionManager';
import { SessionStore } from '../session/sessionStore';
import { GameSimulation } from '../simulation/gameSimulation';
import { ApplicationServer } from '../serverRuntime';

export function createAppContainer(): DependencyContainer {
    const appContainer = container.createChildContainer();

    appContainer.registerSingleton(ServerConfig);
    appContainer.registerSingleton(SessionStore);
    appContainer.registerSingleton(GameSimulation);
    appContainer.registerSingleton(MongoDatabase);
    appContainer.registerSingleton(GameHistoryRepository);
    appContainer.registerSingleton(MetricsRepository);
    appContainer.registerSingleton(BackgroundWorkerHub);
    appContainer.registerSingleton(SessionManager);
    appContainer.registerSingleton(CorsConfiguration);
    appContainer.registerSingleton(ApiRouter);
    appContainer.registerSingleton(HttpApplication);
    appContainer.registerSingleton(SocketServerGateway);
    appContainer.registerSingleton(ApplicationServer);

    return appContainer;
}
