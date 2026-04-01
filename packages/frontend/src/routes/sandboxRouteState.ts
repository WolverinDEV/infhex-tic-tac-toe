import type { SandboxGamePosition, SandboxPlayerSlot } from '@ih3t/shared';

export type SandboxRouteInitialPosition = {
    name: string
    gamePosition: SandboxGamePosition
};

export type SandboxRouteBotGame = {
    engineName?: string
    botPlayerSlot: SandboxPlayerSlot
};

export type SandboxRouteState = {
    initialPosition?: SandboxRouteInitialPosition
    botGame?: SandboxRouteBotGame
};
