import type { BotEngineInterface } from '@ih3t/shared'
import { WorkerBotClient, WorkerBotInterface } from './botWorkerClient'
import { NavLink } from 'react-router';
import React from 'react';

export type SandboxBotEngineInfo = {
    name: string,
    displayName: string,
    description: () => React.ReactNode,
}

export const kSandboxBotEngines: readonly SandboxBotEngineInfo[] = [
    {
        name: "dummy",
        displayName: "Dummy Bot",
        description: () => "A dummy bot implementation just placing cells as close to the center as possible.",
    },
    {
        name: "seal",
        displayName: "Seal Bot",
        description: () => (
            <React.Fragment>
                Imaseal&apos;s bot implementation based of a minimax search with alpha-beta pruning
                (<NavLink to={"https://github.com/Ramora0/HexTicTacToe"} target={"_blank"} >available on GitHub</ NavLink >).
            </React.Fragment>
        )
    }
];

export async function createSandboxBot(engine: string): Promise<BotEngineInterface> {
    const worker = new Worker(new URL("./botWorker.ts", import.meta.url), { type: 'module' })
    const workerClient = new WorkerBotClient(worker)

    try {
        const response = await workerClient.request({ type: 'init', engine })
        if (response.type !== 'ready') {
            throw new Error(`Unexpected bot worker response: ${response.type}`)
        }

        return new WorkerBotInterface(workerClient, response.displayName, response.capabilities)
    } catch (error) {
        workerClient.dispose()
        throw error
    }
}
