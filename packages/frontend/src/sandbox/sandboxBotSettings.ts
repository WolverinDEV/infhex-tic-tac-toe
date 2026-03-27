import type { SandboxPlayerSlot } from '@ih3t/shared';

export type SandboxPlayerMode = `human` | `bot`;

export const DEFAULT_SANDBOX_BOT_TIMEOUT_MS = 1_500;
export const MIN_SANDBOX_BOT_TIMEOUT_MS = 100;
export const MAX_SANDBOX_BOT_TIMEOUT_MS = 60_000;

const SANDBOX_BOT_TIMEOUT_STORAGE_KEY = `ih3t-sandbox-bot-timeout-ms`;

export function sanitizeSandboxBotTimeoutMs(value: number | null | undefined) {
    if (!Number.isFinite(value)) {
        return DEFAULT_SANDBOX_BOT_TIMEOUT_MS;
    }

    return Math.max(
        MIN_SANDBOX_BOT_TIMEOUT_MS,
        Math.min(MAX_SANDBOX_BOT_TIMEOUT_MS, Math.round(value ?? DEFAULT_SANDBOX_BOT_TIMEOUT_MS)),
    );
}

export function readSandboxBotTimeoutMs() {
    if (typeof window === `undefined`) {
        return DEFAULT_SANDBOX_BOT_TIMEOUT_MS;
    }

    const storedValue = window.localStorage.getItem(SANDBOX_BOT_TIMEOUT_STORAGE_KEY);
    if (!storedValue) {
        return DEFAULT_SANDBOX_BOT_TIMEOUT_MS;
    }

    return sanitizeSandboxBotTimeoutMs(Number.parseInt(storedValue, 10));
}

export function persistSandboxBotTimeoutMs(timeoutMs: number) {
    if (typeof window === `undefined`) {
        return;
    }

    window.localStorage.setItem(
        SANDBOX_BOT_TIMEOUT_STORAGE_KEY,
        String(sanitizeSandboxBotTimeoutMs(timeoutMs)),
    );
}

export function createDefaultSandboxPlayerModes(): Record<SandboxPlayerSlot, SandboxPlayerMode> {
    return {
        'player-1': `human`,
        'player-2': `human`,
    };
}
