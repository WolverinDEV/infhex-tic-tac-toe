const DEVICE_ID_STORAGE_KEY = `ih3t-device-id`;
const DEVICE_ID_COOKIE_NAME = `ih3t_device_id`;
const DEVICE_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function generateDeviceId(): string {
    if (typeof crypto !== `undefined` && typeof crypto.randomUUID === `function`) {
        return crypto.randomUUID();
    }

    return `device-${Math.random().toString(36)
        .slice(2)}-${Date.now().toString(36)}`;
}

function getCookieValue(name: string): string | null {
    if (typeof document === `undefined`) {
        return null;
    }

    const cookiePrefix = `${name}=`;
    const cookie = document.cookie
        .split(`;`)
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(cookiePrefix));

    if (!cookie) {
        return null;
    }

    return decodeURIComponent(cookie.slice(cookiePrefix.length));
}

function persistDeviceId(deviceId: string): void {
    if (typeof window !== `undefined`) {
        window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }

    if (typeof document !== `undefined`) {
        document.cookie = `${DEVICE_ID_COOKIE_NAME}=${encodeURIComponent(deviceId)}; max-age=${DEVICE_ID_COOKIE_MAX_AGE_SECONDS}; path=/; samesite=lax`;
    }
}

export function getOrCreateDeviceId(): string {
    const cookieDeviceId = getCookieValue(DEVICE_ID_COOKIE_NAME);
    const storedDeviceId = typeof window !== `undefined`
        ? window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
        : null;
    const deviceId = storedDeviceId ?? cookieDeviceId ?? generateDeviceId();

    persistDeviceId(deviceId);
    return deviceId;
}
