import { container, type DependencyContainer } from 'tsyringe';
import { BackgroundWorkerHub } from '../background/backgroundWorkers';
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
import { ServerTokens } from './tokens';

interface CreateAppContainerOptions {
    frontendDistPath: string;
}

export function createAppContainer(options: CreateAppContainerOptions): DependencyContainer {
    const appContainer = container.createChildContainer();

    appContainer.registerInstance(ServerTokens.FrontendDistPath, options.frontendDistPath);
    appContainer.registerInstance(ServerTokens.MongoUri, requireEnv('MONGODB_URI'));
    appContainer.registerInstance(ServerTokens.MongoDbName, process.env.MONGODB_DB_NAME ?? 'ih3t');
    appContainer.registerInstance(ServerTokens.Port, process.env.PORT || 3001);
    appContainer.registerInstance(ServerTokens.RematchTtlMs, parsePositiveInt(process.env.REMATCH_TTL_MS));

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

function parsePositiveInt(value: string | undefined): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
}

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable ${name}`);
    }

    return value;
}
