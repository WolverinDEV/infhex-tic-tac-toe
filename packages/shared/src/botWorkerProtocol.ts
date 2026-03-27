import { BotEngineCapabilities, BotEngineInterface } from "./botInterface";

export type BotWorkerRequest
    = | { type: `init`, engine: string }
    | { type: `suggestTurn`, parameters: Parameters<BotEngineInterface[`suggestTurn`]> }
    | { type: `suggestMove`, parameters: Parameters<BotEngineInterface[`suggestMove`]> };

export type BotWorkerResponse
    = | {
        type: `ready`
        displayName: string
        capabilities: Readonly<BotEngineCapabilities>
    }
    | {
        type: `suggestTurnResult`
        result: Awaited<ReturnType<BotEngineInterface[`suggestTurn`]>>
    }
    | {
        type: `suggestMoveResult`
        result: Awaited<ReturnType<BotEngineInterface[`suggestMove`]>>
    }
    | {
        type: `error`
        message: string
    };
