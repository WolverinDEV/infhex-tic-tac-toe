import type { BotEngineCapabilities, SandboxPlayerSlot } from '@ih3t/shared';

import { SandboxBotEngineInfo } from '../../sandbox/botLoader';
import type { SandboxPlayerMode } from '../../sandbox/sandboxBotSettings';
import GameHudShell from '../game-screen/GameHudShell';
import SandboxBotControls from './SandboxBotControls';

function getBotCapabilitiesLabel(botCapabilities: Readonly<BotEngineCapabilities> | null) {
    if (!botCapabilities) {
        return null;
    }

    if (botCapabilities.suggestTurn && botCapabilities.suggestMove) {
        return `Supports full turns and single-move continuations.`;
    }

    if (botCapabilities.suggestTurn) {
        return `Supports only full turns.`;
    }

    if (botCapabilities.suggestMove) {
        return `Supports one move at a time suggestions.`;
    }

    return `Does not support any move generation capability.`;
}


type SandboxBotPanelProps = {
    isOpen: boolean

    selectedFactory: SandboxBotEngineInfo | null,

    botDisplayName: string | null
    botCapabilities: Readonly<BotEngineCapabilities> | null
    botAvailabilityMessage: string | null
    botPlayerModes: Record<SandboxPlayerSlot, SandboxPlayerMode>
    currentTurnPlayerSlot: SandboxPlayerSlot | null
    botTimeoutMs: number
    isBotThinking: boolean
    isCurrentTurnBotControlled: boolean
    botErrorMessage: string | null
    onClose: () => void
    onOpen: () => void
    onChangeBotEngine: () => void
    onBotPlayerModeChange: (playerSlot: SandboxPlayerSlot, nextMode: SandboxPlayerMode) => void
    onBotTimeoutMsChange: (timeoutMs: number) => void
};

function SandboxBotPanel({
    isOpen,
    onOpen,
    onClose,

    selectedFactory,

    botDisplayName,
    botCapabilities,
    botAvailabilityMessage,
    botPlayerModes,

    currentTurnPlayerSlot,
    botTimeoutMs,
    isBotThinking,
    isCurrentTurnBotControlled,
    botErrorMessage,
    onChangeBotEngine,
    onBotPlayerModeChange,
    onBotTimeoutMsChange,
}: Readonly<SandboxBotPanelProps>) {
    const capabilityLabel = getBotCapabilitiesLabel(botCapabilities);
    return (
        <GameHudShell
            isOpen={isOpen}
            onOpen={onOpen}
            onClose={onClose}

            closeTitle="Close"
            openTitle="Open"

            openIcon={
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6V4" />
                    <path d="M15 6V4" />
                    <rect x="5" y="7" width="14" height="10" rx="4" />
                    <path d="M8.5 11h.01" />
                    <path d="M15.5 11h.01" />
                    <path d="M9 14h6" />
                    <path d="M7 17v2" />
                    <path d="M17 17v2" />
                </svg>
            }
            role="right"
        >
            <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-sky-300">
                    Sandbox Bot
                </div>

                <h2 className="mt-1 text-xl font-bold text-white">
                    Bot Controls
                </h2>

                <div className="mt-2 text-sm leading-6 text-slate-300">
                    Add a bot to either side, adjust the request timeout, and switch back to human control whenever you want.
                </div>
            </div>

            <div className="mt-4 items-center grid grid-cols-[1fr_auto] gap-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                        Engine
                    </div>

                    <div className="mt-1 text-sm font-semibold text-white">
                        {selectedFactory?.displayName ?? `None`}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onChangeBotEngine}
                    className="rounded-full ml-3 border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
                >
                    Change
                </button>

                <div className="col-span-2 text-xs leading-5 text-slate-300">
                    {selectedFactory?.description()} 
                    {` `}
                    {capabilityLabel}
                </div>
            </div>

            <SandboxBotControls
                botDisplayName={botDisplayName}
                botCapabilities={botCapabilities}
                botAvailabilityMessage={botAvailabilityMessage}
                playerModes={botPlayerModes}
                currentTurnPlayerSlot={currentTurnPlayerSlot}
                timeoutMs={botTimeoutMs}
                isBotThinking={isBotThinking}
                isCurrentTurnBotControlled={isCurrentTurnBotControlled}
                botErrorMessage={botErrorMessage}
                onPlayerModeChange={onBotPlayerModeChange}
                onTimeoutMsChange={onBotTimeoutMsChange}
            />
        </GameHudShell>
    );
}

export default SandboxBotPanel;
