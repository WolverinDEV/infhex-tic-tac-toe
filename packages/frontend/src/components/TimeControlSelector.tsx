import type { GameTimeControl } from '@ih3t/shared';

import { formatGameTimeSeconds } from '../utils/gameTimeControl';

const timeControlModeOptions: {
    value: GameTimeControl[`mode`]
    title: string
    description: string
}[] = [
        {
            value: `match`,
            title: `Match Based`,
            description: `A main clock between 1m and 60m plus an increment after each completed turn.`,
        },
        {
            value: `turn`,
            title: `Turn Based`,
            description: `A time limit per turn between 5s and 120s.`,
        },
        {
            value: `unlimited`,
            title: `Unlimited`,
            description: `No clock configured.`,
        },
    ];

type SelectableOptionProps = {
    onClick: () => void
    selected: boolean
    title: string
    description: string
    disabled?: boolean
};

function SelectableOption({ onClick, selected, title, description, disabled = false }: Readonly<SelectableOptionProps>) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex flex-col items-start rounded-[0.9rem] border p-3 text-left transition ${selected
                ? `border-sky-300/35 bg-sky-300/10 shadow-[0_8px_18px_rgba(14,165,233,0.1)]`
                : disabled
                    ? `cursor-not-allowed border-white/8 bg-white/4 opacity-60`
                    : `border-white/10 bg-white/6 hover:border-white/20 hover:bg-white/10`
                }`}
        >
            <div className="flex flex-row items-center text-sm font-bold text-white">
                <span className={`mr-2 inline-block h-3.5 w-3.5 align-sub rounded-full border ${selected ? `border-sky-200 bg-sky-300` : `border-white/20 bg-slate-900/40`}`} />
                {title}
            </div>

            <div className="mt-1 text-[11px] leading-4.5 text-slate-300">
                {description}
            </div>
        </button>
    );
}

export function formatTimeControlSummary(timeControl: GameTimeControl): string {
    if (timeControl.mode === `turn`) {
        return `${formatGameTimeSeconds(timeControl.turnTimeMs / 1000)} turns`;
    }

    if (timeControl.mode === `match`) {
        return `${timeControl.mainTimeMs / 60_000}m + ${formatGameTimeSeconds(timeControl.incrementMs / 1000)}`;
    }

    return `No clock`;
}

type TimeControlSelectorProps = {
    mode: GameTimeControl[`mode`]
    selectedTimeControl: GameTimeControl
    turnTimeSeconds: number
    matchTimeMinutes: number
    incrementSeconds: number
    turnTimeStepCount: number
    matchTimeStepCount: number
    incrementStepCount: number
    turnTimeStepIndex: number
    matchTimeStepIndex: number
    incrementStepIndex: number
    onModeChange: (mode: GameTimeControl[`mode`]) => void
    onTurnTimeStepIndexChange: (index: number) => void
    onMatchTimeStepIndexChange: (index: number) => void
    onIncrementStepIndexChange: (index: number) => void
    emptyMessage?: string
};

function TimeControlSelector({
    mode,
    selectedTimeControl,
    turnTimeSeconds,
    matchTimeMinutes,
    incrementSeconds,
    turnTimeStepCount,
    matchTimeStepCount,
    incrementStepCount,
    turnTimeStepIndex,
    matchTimeStepIndex,
    incrementStepIndex,
    onModeChange,
    onTurnTimeStepIndexChange,
    onMatchTimeStepIndexChange,
    onIncrementStepIndexChange,
    emptyMessage = `No clock will be configured.`,
}: Readonly<TimeControlSelectorProps>) {
    return (
        <>
            <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Time Control
                </div>

                <div className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                    {formatTimeControlSummary(selectedTimeControl)}
                </div>
            </div>

            <div className="mt-2.5 grid gap-2 md:grid-cols-3">
                {timeControlModeOptions.map((option) => {
                    const selected = mode === option.value;

                    return (
                        <SelectableOption
                            key={option.value}
                            onClick={() => onModeChange(option.value)}
                            selected={selected}
                            title={option.title}
                            description={option.description}
                        />
                    );
                })}
            </div>

            <div className="mt-2.5 flex flex-col rounded-[0.9rem] border border-white/10 bg-slate-950/35 p-3 lg:h-[7.25em]">
                {mode === `unlimited` ? (
                    <div className="my-auto text-center text-sm leading-5 text-slate-300">
                        {emptyMessage}
                    </div>
                ) : mode === `turn` ? (
                    <div className="space-y-2.5">
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                Turn Time
                            </div>

                            <div className="mt-0.5 text-lg font-bold text-white">
                                {formatGameTimeSeconds(turnTimeSeconds)}
                            </div>
                        </div>

                        <input
                            type="range"
                            min={0}
                            max={turnTimeStepCount - 1}
                            step={1}
                            value={turnTimeStepIndex}
                            onChange={(event) => onTurnTimeStepIndexChange(Number(event.target.value))}
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-300"
                        />

                        <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            <span>
                                5s
                            </span>

                            <span>
                                120s
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2.5">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                    Main Time
                                </div>

                                <div className="mt-0.5 text-lg font-bold text-white">
                                    {matchTimeMinutes}
                                    m
                                </div>
                            </div>

                            <input
                                type="range"
                                min={0}
                                max={matchTimeStepCount - 1}
                                step={1}
                                value={matchTimeStepIndex}
                                onChange={(event) => onMatchTimeStepIndexChange(Number(event.target.value))}
                                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-300"
                            />

                            <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                <span>
                                    1m
                                </span>

                                <span>
                                    60m
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                    Increment
                                </div>

                                <div className="mt-0.5 text-lg font-bold text-white">
                                    {formatGameTimeSeconds(incrementSeconds)}
                                </div>
                            </div>

                            <input
                                type="range"
                                min={0}
                                max={incrementStepCount - 1}
                                step={1}
                                value={incrementStepIndex}
                                onChange={(event) => onIncrementStepIndexChange(Number(event.target.value))}
                                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-300"
                            />

                            <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                <span>
                                    0s
                                </span>

                                <span>
                                    5m
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default TimeControlSelector;
