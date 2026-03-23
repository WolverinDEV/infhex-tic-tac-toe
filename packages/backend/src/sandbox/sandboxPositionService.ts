import { randomInt } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import type { SandboxGamePosition, SandboxPositionName } from '@ih3t/shared';
import { SandboxPositionRepository, type LoadedSandboxPositionRecord } from '../persistence/sandboxPositionRepository';

const SHORT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_ID_LENGTH = 7;
const MAX_SHORT_ID_ATTEMPTS = 10;

export class SandboxPositionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SandboxPositionError';
    }
}

@injectable()
export class SandboxPositionService {
    constructor(
        @inject(SandboxPositionRepository) private readonly sandboxPositionRepository: SandboxPositionRepository
    ) {}

    async createPosition(gamePosition: SandboxGamePosition, name: SandboxPositionName, userProfileId: string): Promise<string> {
        for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt += 1) {
            const id = this.generateShortId();

            try {
                return await this.sandboxPositionRepository.createPosition({
                    id,
                    name,
                    gamePosition,
                    createdAt: Date.now(),
                    createdBy: userProfileId
                });
            } catch (error: unknown) {
                if (isMongoDuplicateKeyError(error)) {
                    continue;
                }

                throw error;
            }
        }

        throw new SandboxPositionError('Failed to generate a sandbox position id.');
    }

    async loadPosition(id: string): Promise<LoadedSandboxPositionRecord | null> {
        return await this.sandboxPositionRepository.getPositionAndIncrementLoadCount(id);
    }

    async getPosition(id: string): Promise<LoadedSandboxPositionRecord | null> {
        return await this.sandboxPositionRepository.getPosition(id);
    }

    private generateShortId(): string {
        let id = '';
        for (let characterIndex = 0; characterIndex < SHORT_ID_LENGTH; characterIndex += 1) {
            const alphabetIndex = randomInt(0, SHORT_ID_ALPHABET.length);
            id += SHORT_ID_ALPHABET[alphabetIndex];
        }

        return id;
    }
}

function isMongoDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && typeof (error as { code?: unknown }).code === 'number'
        && (error as { code: number }).code === 11000;
}
