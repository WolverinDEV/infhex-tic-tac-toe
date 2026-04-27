import type Tracker from '@openreplay/tracker';

import { APP_VERSION_HASH } from './appVersion';

type OpenReplayUser = {
    id: string;
    username: string;
};

let tracker: Tracker | null = null;
let trackerStartPromise: Promise<void> | null = null;
let cachedSessionId: string | null = null;
let trackedUser: OpenReplayUser | null = null;

function isBrowser(): boolean {
    return typeof window !== `undefined` && typeof document !== `undefined`;
}

function normalizeSessionId(value: string | null | undefined): string | null {
    return value && value.trim().length > 0 ? value : null;
}

function setCachedSessionId(value: string | null | undefined): void {
    cachedSessionId = normalizeSessionId(value);

    if (typeof window !== `undefined`) {
        window.__IH3T_OPENREPLAY_SESSION_ID__ = cachedSessionId ?? undefined;
    }
}

export function getOpenReplaySessionId(): string | null {
    const windowSessionId = typeof window !== `undefined`
        ? normalizeSessionId(window.__IH3T_OPENREPLAY_SESSION_ID__)
        : null;

    return windowSessionId ?? cachedSessionId;
}

export function createTrackedHeaders(init?: HeadersInit): Headers {
    const headers = new Headers(init);
    const sessionId = getOpenReplaySessionId();
    if (sessionId) {
        headers.set(`X-OpenReplay-SessionId`, sessionId);
    }

    return headers;
}

function applyTrackedUser(): void {
    if (!tracker || !trackedUser) {
        return;
    }

    tracker.setUserID(trackedUser.id);
    tracker.setMetadata(`username`, trackedUser.username);
}

export function trackOpenReplayUser(user: OpenReplayUser | null): void {
    trackedUser = user;
    applyTrackedUser();
}

export function initializeOpenReplay(): Promise<void> {
    if (!isBrowser()) {
        return Promise.resolve();
    }

    if (trackerStartPromise) {
        return trackerStartPromise;
    }

    const projectKey = import.meta.env.VITE_OPENREPLAY_PROJECT_KEY?.trim();
    const ingestPoint = import.meta.env.VITE_OPENREPLAY_INGEST_POINT?.trim();
    if (!projectKey) {
        return Promise.resolve();
    }

    trackerStartPromise = (async () => {
        try {
            const [
                { default: Tracker },
                { default: trackerAssist },
            ] = await Promise.all([
                import(`@openreplay/tracker`),
                import(`@openreplay/tracker-assist`),
            ]);
            tracker = new Tracker({
                projectKey,
                ingestPoint,
            });
            tracker.use(trackerAssist());

            await tracker.start({
                metadata: {
                    appVersion: APP_VERSION_HASH,
                },
            });

            setCachedSessionId(tracker.getSessionID());
            applyTrackedUser();
        } catch (error) {
            tracker = null;
            trackerStartPromise = null;
            console.error(`Failed to initialize OpenReplay`, error);
        }
    })();

    return trackerStartPromise;
}
