import type { Request } from 'express';
import type { Socket } from 'socket.io';
import { zSocketIOClientAuthPayload, type ClientToServerEvents, type ServerToClientEvents } from '@ih3t/shared';

export type RequestClientInfo = {
    deviceId: string;
    ip: string;
    userAgent: string;
    origin: string;
    referer: string | null;
}

export type SocketClientInfo = {
    socketId: string;
    ephemeralClientId: string;
    versionHash: string;
} & RequestClientInfo

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
    const deviceId = request.get('x-device-id') ?? getCookieValue(request.get('cookie'), 'ih3t_device_id') ?? '';

    return {
        deviceId,
        ip: request.ip ?? '',
        userAgent: request.get('user-agent') ?? '',
        origin: request.get('origin') ?? '',
        referer: request.get('referer') ?? null
    };
}

export function getSocketClientInfo(socket: Socket<ClientToServerEvents, ServerToClientEvents>): SocketClientInfo {
    const { deviceId, ephemeralClientId, versionHash } = zSocketIOClientAuthPayload.parse(socket.handshake.auth);
    return {
        deviceId,
        ephemeralClientId,
        versionHash,

        socketId: socket.id,
        ip: socket.handshake.address ?? '',

        userAgent: getHeaderValue(socket.handshake.headers['user-agent']) ?? '',
        origin: getHeaderValue(socket.handshake.headers.origin) ?? '',
        referer: getHeaderValue(socket.handshake.headers.referer)
    };
}
