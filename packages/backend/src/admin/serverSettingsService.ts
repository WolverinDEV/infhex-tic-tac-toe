import {
    DEFAULT_SERVER_SETTINGS,
    type ServerSettings,
    zServerSettings,
} from '@ih3t/shared';
import type { Logger } from 'pino';
import { inject, injectable } from 'tsyringe';

import type { AccountUserProfile } from '../auth/authRepository';
import { ROOT_LOGGER } from '../logger';
import { ServerSettingsRepository } from '../persistence/serverSettingsRepository';

@injectable()
export class ServerSettingsService {
    private readonly logger: Logger;
    private settings: ServerSettings = { ...DEFAULT_SERVER_SETTINGS };
    private initialized = false;

    constructor(
        @inject(ROOT_LOGGER) rootLogger: Logger,
        @inject(ServerSettingsRepository) private readonly repository: ServerSettingsRepository,
    ) {
        this.logger = rootLogger.child({ component: `server-settings-service` });
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.settings = await this.repository.getSettings();
        this.initialized = true;

        this.logger.info({
            event: `server-settings.loaded`,
            maxConcurrentGames: this.settings.maxConcurrentGames,
        }, `Loaded server settings`);
    }

    getSettings(): ServerSettings {
        return { ...this.settings };
    }

    async updateSettings(settings: ServerSettings, updatedBy: AccountUserProfile): Promise<ServerSettings> {
        const normalizedSettings = zServerSettings.parse(settings);
        const persistedSettings = await this.repository.updateSettings(normalizedSettings, updatedBy);
        this.settings = persistedSettings;
        this.initialized = true;
        return { ...persistedSettings };
    }
}
