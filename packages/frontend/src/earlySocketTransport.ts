import { WebSocket } from "engine.io-client"
import { takeEarlyWebSocket } from "./earlySocketConnection";

export class EarlyWebSocket extends WebSocket {
    createSocket(uri: string, protocols: string | string[] | undefined, opts: Record<string, any>) {
        const socket = takeEarlyWebSocket(uri);
        if (socket && socket.readyState < window.WebSocket.CLOSING) {
            console.info(`Used early socket for socker.io connection. Early socket state ${socket.readyState}.`);
            return socket;
        }

        return super.createSocket(uri, protocols, opts)
    }
}