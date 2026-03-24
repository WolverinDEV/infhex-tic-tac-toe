import { getSocketUrl } from "./query/apiClient"

export type EarlySocket = {
    socketUrl: string,
    socket: WebSocket,

    consumeTimeout: ReturnType<typeof setTimeout>,
    events: (() => void)[],
}

function createEarlySocket(url: string): EarlySocket {
    let targetUrl = url
        .replace("https://", "wss://")
        .replace("http://", "ws://")

    if (!targetUrl.endsWith("/")) {
        targetUrl = `${targetUrl}/`
    }

    const socketUrl = `${targetUrl}socket.io/?EIO=4&transport=websocket`
    const socket = new WebSocket(socketUrl)

    const earlySocket: EarlySocket = {
        socketUrl,
        socket,

        consumeTimeout: setTimeout(() => {
            console.warn(`Early connect to ${targetUrl} has not been used!`);
            socket.close();
        }, 30_000),
        events: [],
    };

    socket.onerror = event => { earlySocket.events.push(() => socket.onerror?.(event)) }
    socket.onopen = event => { earlySocket.events.push(() => socket.onopen?.(event)) }
    socket.onmessage = event => { earlySocket.events.push(() => socket.onmessage?.(event)) }
    socket.onclose = event => { earlySocket.events.push(() => socket.onclose?.(event)) }

    console.log(`Early connect to ${targetUrl}`);
    return earlySocket;
}

function consumeEarlySocket(socket: EarlySocket): WebSocket {
    clearTimeout(socket.consumeTimeout);
    setTimeout(() => {
        for (const eventCallback of socket.events) {
            eventCallback()
        }
    }, 0);

    return socket.socket;
}

let earlyWebSocket: EarlySocket | null = null;
export function takeEarlyWebSocket(url: string): WebSocket | null {
    if (url !== earlyWebSocket?.socketUrl) {
        return null;
    }

    const socket = earlyWebSocket;
    earlyWebSocket = null;
    return consumeEarlySocket(socket);
}

if (!import.meta.env.SSR) {
    /* do not create the web socket in SSR mode */
    earlyWebSocket = createEarlySocket(getSocketUrl());
}