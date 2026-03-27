import { BotEngineCapabilities, BotEngineInterface, BotEngineSuggestionResult, GameState, HexCoordinate } from "@ih3t/shared";

import { BotWorkerRequest, BotWorkerResponse } from "../../../shared/src/botWorkerProtocol";

type PendingRequest = {
    resolve: (response: BotWorkerResponse) => void
    reject: (error: Error) => void
};

export class WorkerBotClient {
    private nextRequestId = 1;
    private readonly pendingRequests = new Map<number, PendingRequest>();
    private disposed = false;

    constructor(private readonly worker: Worker) {
        worker.addEventListener(`message`, this.handleMessage);
        worker.addEventListener(`error`, this.handleError);
        worker.addEventListener(`messageerror`, this.handleMessageError);
    }

    private handleMessage = (event: MessageEvent<{ id: number } & BotWorkerResponse>) => {
        const pendingRequest = this.pendingRequests.get(event.data.id);
        if (!pendingRequest) {
            return;
        }

        this.pendingRequests.delete(event.data.id);
        if (event.data.type === `error`) {
            pendingRequest.reject(new Error(event.data.message));
            return;
        }

        pendingRequest.resolve(event.data);
    };

    private handleError = (event: ErrorEvent) => {
        this.failAllPendingRequests(new Error(event.message || `bot worker crashed.`));
    };

    private handleMessageError = () => {
        this.failAllPendingRequests(new Error(`The bot worker returned an unreadable response.`));
    };

    private failAllPendingRequests(error: Error) {
        for (const pendingRequest of this.pendingRequests.values()) {
            pendingRequest.reject(error);
        }

        this.pendingRequests.clear();
    }

    async request(request: BotWorkerRequest): Promise<BotWorkerResponse> {
        if (this.disposed) {
            throw new Error(`The bot worker has already been disposed.`);
        }

        const id = this.nextRequestId++;
        return await new Promise<BotWorkerResponse>((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({
                ...request,
                id,
            });
        });
    }

    dispose() {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.worker.removeEventListener(`message`, this.handleMessage);
        this.worker.removeEventListener(`error`, this.handleError);
        this.worker.removeEventListener(`messageerror`, this.handleMessageError);
        this.failAllPendingRequests(new Error(`The bot worker was disposed.`));
        this.worker.terminate();
    }
}

export class WorkerBotInterface implements BotEngineInterface {
    constructor(
        private readonly workerClient: WorkerBotClient,
        private readonly displayName: string,
        private readonly capabilities: Readonly<BotEngineCapabilities>,
    ) { }

    getDisplayName(): string {
        return this.displayName;
    }

    getCapabilities(): Readonly<BotEngineCapabilities> {
        return this.capabilities;
    }

    async suggestMove(gameState: GameState, timeoutMs: number): Promise<BotEngineSuggestionResult<HexCoordinate>> {
        const response = await this.workerClient.request({
            type: `suggestMove`,
            parameters: [
                gameState,
                timeoutMs,
            ],
        });

        if (response.type !== `suggestMoveResult`) {
            throw new Error(`Unexpected bot worker response: ${response.type}`);
        }

        return response.result;
    }

    async suggestTurn(gameState: GameState, timeoutMs: number): Promise<BotEngineSuggestionResult<[HexCoordinate, HexCoordinate]>> {
        const response = await this.workerClient.request({
            type: `suggestTurn`,
            parameters: [
                gameState,
                timeoutMs,
            ],
        });

        if (response.type !== `suggestTurnResult`) {
            throw new Error(`Unexpected bot worker response: ${response.type}`);
        }

        return response.result;
    }

    shutdown(): void {
        this.workerClient.dispose();
    }
}