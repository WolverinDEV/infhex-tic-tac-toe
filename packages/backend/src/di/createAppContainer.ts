import { container, type DependencyContainer } from 'tsyringe';

import { AdminStatsService } from '../admin/adminStatsService';
import { ServerSettingsService } from '../admin/serverSettingsService';
import { ServerShutdownService } from '../admin/serverShutdownService';
import { AuthRepository } from '../auth/authRepository';
import { AuthService } from '../auth/authService';
import { AccountBotService } from '../bots/accountBotService';
import { ServerConfig } from '../config/serverConfig';
import { EloHandler } from '../elo/eloHandler';
import { EloRepository } from '../elo/eloRepository';
import { LeaderboardService } from '../leaderboard/leaderboardService';
import { createRootLogger, ROOT_LOGGER } from '../logger';
import { MetricsTracker } from '../metrics/metricsTracker';
import { CorsConfiguration } from '../network/cors';
import { HttpApplication } from '../network/createHttpApp';
import { SocketServerGateway } from '../network/createSocketServer';
import { ApiQueryService } from '../network/rest/apiQueryService';
import { ApiRouter } from '../network/rest/createApiRouter';
import { AccountBotRepository } from '../persistence/accountBotRepository';
import { DatabaseMigrationRunner } from '../persistence/databaseMigrationRunner';
import { GameHistoryRepository } from '../persistence/gameHistoryRepository';
import { MetricsRepository } from '../persistence/metricsRepository';
import { MongoDatabase } from '../persistence/mongoClient';
import { SandboxPositionRepository } from '../persistence/sandboxPositionRepository';
import { ServerSettingsRepository } from '../persistence/serverSettingsRepository';
import { SandboxPositionService } from '../sandbox/sandboxPositionService';
import { ApplicationServer } from '../serverRuntime';
import { SessionManager } from '../session/sessionManager';
import { GameSimulation } from '../simulation/gameSimulation';
import { GameTimeControlManager } from '../simulation/gameTimeControlManager';

export function createAppContainer(): DependencyContainer {
    const appContainer = container.createChildContainer();

    appContainer.registerSingleton(ServerConfig);
    const serverConfig = appContainer.resolve(ServerConfig);
    appContainer.registerInstance(ROOT_LOGGER, createRootLogger({
        level: serverConfig.logLevel,
        pretty: serverConfig.prettyLogs,
    }));
    appContainer.registerSingleton(GameSimulation);
    appContainer.registerSingleton(GameTimeControlManager);
    appContainer.registerSingleton(MongoDatabase);
    appContainer.registerSingleton(DatabaseMigrationRunner);
    appContainer.registerSingleton(AuthRepository);
    appContainer.registerSingleton(AuthService);
    appContainer.registerSingleton(AccountBotRepository);
    appContainer.registerSingleton(AccountBotService);
    appContainer.registerSingleton(EloRepository);
    appContainer.registerSingleton(EloHandler);
    appContainer.registerSingleton(ServerSettingsRepository);
    appContainer.registerSingleton(ServerSettingsService);
    appContainer.registerSingleton(ServerShutdownService);
    appContainer.registerSingleton(AdminStatsService);
    appContainer.registerSingleton(LeaderboardService);
    appContainer.registerSingleton(GameHistoryRepository);
    appContainer.registerSingleton(MetricsRepository);
    appContainer.registerSingleton(MetricsTracker);
    appContainer.registerSingleton(SandboxPositionRepository);
    appContainer.registerSingleton(SandboxPositionService);
    appContainer.registerSingleton(SessionManager);
    appContainer.registerSingleton(CorsConfiguration);
    appContainer.registerSingleton(ApiQueryService);
    appContainer.registerSingleton(ApiRouter);
    appContainer.registerSingleton(HttpApplication);
    appContainer.registerSingleton(SocketServerGateway);
    appContainer.registerSingleton(ApplicationServer);

    return appContainer;
}
