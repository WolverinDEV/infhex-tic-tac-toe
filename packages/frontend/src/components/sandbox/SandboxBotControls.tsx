import type { BotEngineCapabilities, SandboxPlayerSlot } from '@ih3t/shared';
import React, { useEffect, useState } from 'react';

import type { SandboxPlayerMode } from '../../sandbox/sandboxBotSettings';

type SandboxBotControlsProps = {
    botDisplayName: string | null
    botCapabilities: Readonly<BotEngineCapabilities> | null
    botAvailabilityMessage: string | null
    playerModes: Record<SandboxPlayerSlot, SandboxPlayerMode>
    currentTurnPlayerSlot: SandboxPlayerSlot | null
    timeoutMs: number
    isBotThinking: boolean
    isCurrentTurnBotControlled: boolean
    botErrorMessage: string | null
    onPlayerModeChange: (playerSlot: SandboxPlayerSlot, nextMode: SandboxPlayerMode) => void
    onTimeoutMsChange: (timeoutMs: number) => void
};

const PLAYER_OPTIONS: readonly {
    slot: SandboxPlayerSlot
    title: string
    subtitle: string
}[] = [
    {
        slot: `player-1`,
        title: `Player 1`,
        subtitle: `Opens the game at the origin.`,
    },
    {
        slot: `player-2`,
        title: `Player 2`,
        subtitle: `Responds after the first turn.`,
    },
];

function SandboxBotControls({
    botDisplayName,
    botAvailabilityMessage,
    playerModes,
    currentTurnPlayerSlot,
    timeoutMs,
    botErrorMessage,
    onPlayerModeChange,
    onTimeoutMsChange,
}: Readonly<SandboxBotControlsProps>) {
    const controlsDisabled = !botDisplayName;
    const botButtonDisabled = controlsDisabled;

    const [timeoutMsText, setTimeoutMsText] = useState<string | null>(null);

    useEffect(() => {
        if (!timeoutMsText) {
            return;
        }

        const id = setTimeout(
            () => {
                setTimeoutMsText(null);
                onTimeoutMsChange(Number.parseInt(timeoutMsText, 10));
            },
            1000,
        );
        return () => clearTimeout(id);
    }, [timeoutMsText]);

    return (
        <React.Fragment>

            {botAvailabilityMessage && (
                <div className="mt-3 rounded-[0.9rem] border border-amber-300/20 bg-amber-300/10 px-3 py-2.5 text-xs leading-5 text-amber-50/85">
                    {botAvailabilityMessage}
                </div>
            )}

            {botErrorMessage && (
                <div className="mt-3 rounded-[0.9rem] border border-rose-300/20 bg-rose-300/10 px-3 py-2.5 text-xs leading-5 text-rose-50/90">
                    {botErrorMessage}
                </div>
            )}

            <div className={`mt-3 grid gap-2 transition ${controlsDisabled ? `pointer-events-none opacity-40` : ``}`}>
                {PLAYER_OPTIONS.map((playerOption) => {
                    const isCurrentTurn = currentTurnPlayerSlot === playerOption.slot;
                    const selectedMode = playerModes[playerOption.slot];

                    return (
                        <div
                            key={playerOption.slot}
                            className={`rounded-[0.9rem] border px-3 py-3 ${isCurrentTurn
                                ? `border-sky-300/25 bg-sky-300/8`
                                : `border-white/10 bg-white/5`
                            }`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-white">
                                        {playerOption.title}
                                    </div>

                                    <div className="text-[11px] leading-4.5 text-slate-300">
                                        {playerOption.subtitle}
                                    </div>
                                </div>

                                {isCurrentTurn && (
                                    <div className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                                        To Move
                                    </div>
                                )}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => onPlayerModeChange(playerOption.slot, `human`)}
                                    className={`rounded-[0.9rem] border px-3 py-2 text-sm font-medium transition ${selectedMode === `human`
                                        ? controlsDisabled
                                            ? `border-white/10 bg-white/6 text-slate-200`
                                            : `border-emerald-300/35 bg-emerald-300/10 text-white`
                                        : `border-white/10 bg-white/6 text-slate-200 hover:bg-white/10`
                                    }`}
                                >
                                    Human
                                </button>

                                <button
                                    type="button"
                                    onClick={() => onPlayerModeChange(playerOption.slot, `bot`)}
                                    disabled={botButtonDisabled}
                                    className={`rounded-[0.9rem] border px-3 py-2 text-sm font-medium transition ${selectedMode === `bot`
                                        ? `border-sky-300/35 bg-sky-300/10 text-white`
                                        : botButtonDisabled
                                            ? `cursor-not-allowed border-white/8 bg-white/4 text-slate-500`
                                            : `border-white/10 bg-white/6 text-slate-200 hover:bg-white/10`
                                    }`}
                                >
                                    Bot
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className={`mt-3 rounded-[0.9rem] border border-white/10 bg-white/5 px-3 py-3 transition ${controlsDisabled ? `pointer-events-none opacity-40` : ``}`}>
                <label className="block text-[11px] uppercase tracking-[0.22em] text-slate-400" htmlFor="sandbox-bot-timeout">
                    Timeout Per Request
                </label>

                <div className="mt-2 flex items-center gap-2">
                    <input
                        id="sandbox-bot-timeout"
                        type="number"

                        min={100}
                        max={60000}
                        step={100}
                        disabled={controlsDisabled}
                        value={timeoutMsText ?? timeoutMs}

                        onChange={(event) => setTimeoutMsText(event.target.value)}
                        onBlur={() => {
                            if (!timeoutMsText) {
                                return;
                            }

                            setTimeoutMsText(null);
                            onTimeoutMsChange(Number.parseInt(timeoutMsText, 10));
                        }}

                        className="w-full rounded-[0.8rem] border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-300/35"
                    />

                    <div className="rounded-[0.8rem] border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-200">
                        ms
                    </div>
                </div>

                <div className="mt-2 text-[11px] leading-5 text-slate-300">
                    Single-move bots may use this budget more than once during the same turn.
                </div>
            </div>
        </React.Fragment>
    );
}

export default SandboxBotControls;
