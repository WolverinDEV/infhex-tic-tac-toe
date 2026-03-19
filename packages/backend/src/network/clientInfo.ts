import type { Request } from 'express';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ih3t/shared';

export interface RequestClientInfo {
    deviceId: string | null;
    ip: string | null;
    userAgent: string | null;
    origin: string | null;
    referer: string | null;
}

export interface SocketClientInfo extends RequestClientInfo {
    socketId: string;
}

function getHeaderValue(value: string | string[] | undefined): string | null {
    if (typeof value === 'string') {
        return value;
    }

    return value?.[0] ?? null;
}

export function getCookieValue(cookieHeader: string | null | undefined, cookieName: string): string | null {
    if (!cookieHeader) {
        return null;
    }

    const cookiePrefix = `${cookieName}=`;
    const cookie = cookieHeader
        .split(';')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(cookiePrefix));

    if (!cookie) {
        return null;
    }

    try {
        return decodeURIComponent(cookie.slice(cookiePrefix.length));
    } catch {
        return cookie.slice(cookiePrefix.length);
    }
}

export function getRequestClientInfo(request: Request): RequestClientInfo {
    const deviceId = request.get('x-device-id') ?? getCookieValue(request.get('cookie'), 'ih3t_device_id');

    return {
        deviceId,
        ip: request.ip ?? null,
        userAgent: request.get('user-agent') ?? null,
        origin: request.get('origin') ?? null,
        referer: request.get('referer') ?? null
    };
}

export function getSocketClientInfo(socket: Socket<ClientToServerEvents, ServerToClientEvents>): SocketClientInfo {
    const authDeviceId = typeof socket.handshake.auth.deviceId === 'string'
        ? socket.handshake.auth.deviceId
        : null;
    const cookieDeviceId = getCookieValue(getHeaderValue(socket.handshake.headers.cookie), 'ih3t_device_id');

    return {
        deviceId: authDeviceId ?? cookieDeviceId,
        socketId: socket.id,
        ip: socket.handshake.address ?? null,
        userAgent: getHeaderValue(socket.handshake.headers['user-agent']),
        origin: getHeaderValue(socket.handshake.headers.origin),
        referer: getHeaderValue(socket.handshake.headers.referer)
    };
}
