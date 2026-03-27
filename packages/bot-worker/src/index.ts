import createDummyEngine from "@ih3t/bot-engine-dummy";
import createSealEngine from "@ih3t/bot-engine-seal";
import type { BotEngineInterface, BotWorkerRequest, BotWorkerResponse } from "@ih3t/shared";

let activeEngine: Promise<BotEngineInterface> | null = null;

async function initialize(engine: string): Promise<BotEngineInterface> {
    switch (engine) {
        case `dummy`:
            return await createDummyEngine();

        case `seal`:
            return await createSealEngine();

        default:
            throw new Error(`Unknown engine ${engine}`);
    }
}

async function handleMessage(message: BotWorkerRequest): Promise<BotWorkerResponse> {
    try {
        if (message.type === `init`) {
            if (activeEngine) {
                throw new Error(`engine already initialized`);
            }

            activeEngine = initialize(message.engine);
            const engine = await activeEngine;
            return {
                type: `ready`,
                displayName: engine.getDisplayName(),
                capabilities: engine.getCapabilities(),
            };
        } else if (message.type === `suggestTurn`) {
            if (!activeEngine) {
                throw Error(`no engine active`);
            }

            const engine = await activeEngine;
            return {
                type: `suggestTurnResult`,
                result: await engine.suggestTurn(...message.parameters),
            };
        } else if (message.type === `suggestMove`) {
            if (!activeEngine) {
                throw Error(`no engine active`);
            }

            const engine = await activeEngine;
            return {
                type: `suggestMoveResult`,
                result: await engine.suggestMove(...message.parameters),
            };
        }

        return {
            type: `error`,
            message: `Unsupported Imaseal worker request.`,
        };
    } catch (error) {
        return {
            type: `error`,
            message: error instanceof Error ? error.message : `The Imaseal worker failed.`,
        };
    }
}

addEventListener(
    `message`,
    (event: MessageEvent<{ id: number } & BotWorkerRequest>) => {
        void handleMessage(event.data).then((response) => {
            postMessage({ ...response, id: event.data.id });
        });
    },
);

export { };