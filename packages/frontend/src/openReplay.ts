import { APP_VERSION_HASH } from './appVersion';

type OpenReplayUser = {
    id: string;
    username: string;
};

type TrackerSingleton = typeof import("@openreplay/tracker").tracker;

let trackerSingleton: TrackerSingleton | null = null;
let trackerStartPromise: Promise<void> | null = null;
let trackedUser: OpenReplayUser | null = null;

function isBrowser(): boolean {
    return typeof window !== `undefined` && typeof document !== `undefined`;
}


export function createTrackedHeaders(init?: HeadersInit): Headers {
    const headers = new Headers(init);
    const sessionId = trackerSingleton?.getSessionID();
    if (sessionId) {
        headers.set(`X-OpenReplay-SessionId`, sessionId);
    }

    return headers;
}

function applyTrackedUser(): void {
    if (!trackerSingleton || !trackedUser) {
        return;
    }

    trackerSingleton.setUserID(trackedUser.id);
    trackerSingleton.setMetadata(`username`, trackedUser.username);
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
                tracker,
                trackerAssist,
            ] = await Promise.all([
                import(`@openreplay/tracker`).then(module => module.tracker),
                import(`@openreplay/tracker-assist`).then(module => module.default),
            ]);

            trackerSingleton = tracker;
            tracker.configure({
                projectKey,
                ingestPoint,

                revID: APP_VERSION_HASH,

                /* else requestAnimationFrame will constantly be called */
                capturePerformance: false,

                /* do not capture the games canvas */
                canvas: {
                    disableCanvas: true,
                },
            });

            tracker.use(trackerAssist());

            await tracker.start();
            applyTrackedUser();
        } catch (error) {
            trackerSingleton = null;
            trackerStartPromise = null;
            console.error(`Failed to initialize OpenReplay`, error);
        }
    })();

    return trackerStartPromise;
}
