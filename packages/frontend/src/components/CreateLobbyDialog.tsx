import type { AccountProfile, CreateSessionRequest, GameTimeControl, LobbyFirstPlayer, LobbyVisibility } from '@ih3t/shared';
import { useEffect, useMemo, useState } from 'react';

import TimeControlSelector from './TimeControlSelector';

type CreateLobbyDialogProps = {
    isOpen: boolean
    onClose: () => void
    account: AccountProfile | null
    onCreateLobby: (request: CreateSessionRequest) => void
};

const visibilityOptions: {
    value: LobbyVisibility
    title: string
    description: string
}[] = [
        {
            value: `public`,
            title: `Public Lobby`,
            description: `Listed in the live browser.`,
        },
        {
            value: `private`,
            title: `Private Lobby`,
            description: `Hidden until shared directly.`,
        },
    ];

const firstPlayerOptions: {
    value: LobbyFirstPlayer
    title: string
    description: string
}[] = [
        {
            value: `random`,
            title: `Random`,
            description: `Randomly choose who opens the game.`,
        },
        {
            value: `host`,
            title: `Host Starts`,
            description: `The player who creates the lobby takes the first turn.`,
        },
        {
            value: `guest`,
            title: `Guest Starts`,
            description: `The joining player takes the first turn.`,
        },
    ];

const TURN_TIME_STEP_SECONDS = [
    5, 10, 15, 20, 30, 45, 60, 90, 120,
] as const;
const TURN_TIME_DEFAULT = 45;

const MATCH_TIME_STEP_MINUTES = [
    1, 2, 3, 5, 10, 15, 20, 30, 45, 60,
] as const;
const MATCH_TIME_DEFAULT = 5;

const INCREMENT_STEP_SECONDS = [
    0, 1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300,
] as const;
const INCREMENT_DEFAULT = 5;

function SelectableOptions({ onClick, selected, title, description, disabled = false }: Readonly<{ onClick: () => void, selected: boolean, title: string, description: string, disabled?: boolean }>) {
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

function CreateLobbyDialog({
    isOpen,
    onClose,
    account,
    onCreateLobby,
}: Readonly<CreateLobbyDialogProps>) {
    const canCreateRatedLobby = Boolean(account);
    const [visibility, setVisibility] = useState<LobbyVisibility>(`public`);
    const [timeControlMode, setTimeControlMode] = useState<GameTimeControl[`mode`]>(`match`);
    const [rated, setRated] = useState(canCreateRatedLobby);
    const [firstPlayer, setFirstPlayer] = useState<LobbyFirstPlayer>(`random`);
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
    const [turnTimeStepIndex, setTurnTimeStepIndex] = useState(TURN_TIME_STEP_SECONDS.indexOf(TURN_TIME_DEFAULT));
    const [matchTimeStepIndex, setMatchTimeStepIndex] = useState(MATCH_TIME_STEP_MINUTES.indexOf(MATCH_TIME_DEFAULT));
    const [incrementStepIndex, setIncrementStepIndex] = useState(INCREMENT_STEP_SECONDS.indexOf(INCREMENT_DEFAULT));

    useEffect(() => {
        setRated(canCreateRatedLobby);
    }, [canCreateRatedLobby]);

    useEffect(() => {
        if (isOpen) {
            setShowAdvancedOptions(false);
        }
    }, [isOpen]);

    const turnTimeSeconds = TURN_TIME_STEP_SECONDS[turnTimeStepIndex];
    const matchTimeMinutes = MATCH_TIME_STEP_MINUTES[matchTimeStepIndex];
    const incrementSeconds = INCREMENT_STEP_SECONDS[incrementStepIndex];

    const selectedTimeControl = useMemo<GameTimeControl>(() => {
        if (timeControlMode === `turn`) {
            return {
                mode: `turn`,
                turnTimeMs: turnTimeSeconds * 1000,
            };
        }

        if (timeControlMode === `match`) {
            return {
                mode: `match`,
                mainTimeMs: matchTimeMinutes * 60 * 1000,
                incrementMs: incrementSeconds * 1000,
            };
        }

        return {
            mode: `unlimited`,
        };
    }, [
        incrementSeconds, matchTimeMinutes, timeControlMode, turnTimeSeconds,
    ]);

    const firstPlayerTitle = firstPlayerOptions.find((option) => option.value === firstPlayer)?.title ?? `Random`;

    if (!isOpen) {
        return null;
    }

    const handleCreate = () => {
        onCreateLobby({
            lobbyOptions: {
                visibility,
                timeControl: selectedTimeControl,
                rated,
                firstPlayer,
            },
        });
    };

    const badges = [
        rated ? `rated` : `casual`,
        visibility === `private` ? `Private` : `Public`,
        firstPlayerTitle
    ]

    return (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-md flex flex-col">
            <div
                className="absolute inset-0"
                onClick={onClose}
            />

            <div className="relative my-auto z-10 flex self-center items-center justify-center">
                <section className="relative my-auto w-full max-w-2xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[linear-gradient(155deg,rgba(15,23,42,0.97),rgba(17,24,39,0.95)_55%,rgba(30,41,59,0.92))] p-3.5 text-white shadow-[0_24px_80px_rgba(2,6,23,0.55)] sm:p-4">
                    <div className="absolute -right-10 -top-14 h-20 w-20 rounded-full bg-sky-400/16 blur-3xl" />
                    <div className="absolute -left-8 bottom-0 h-16 w-16 rounded-full bg-amber-300/12 blur-3xl" />

                    <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                                    Create Lobby
                                </div>

                                <h2 className="mt-1 text-lg font-black uppercase tracking-[0.05em] text-white sm:text-xl">
                                    Lobby Setup
                                </h2>
                            </div>

                            <button
                                type="button"
                                aria-expanded={showAdvancedOptions}
                                onClick={() => setShowAdvancedOptions((value) => !value)}
                                className="cursor-pointer inline-flex items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100 transition hover:-translate-y-0.5 hover:bg-sky-400/18"
                            >
                                {showAdvancedOptions ? `Simple Settings` : `Advanced Settings`}
                            </button>
                        </div>

                        <div className="mt-3 flex flex-col gap-4 sm:gap-6">
                            {!showAdvancedOptions && (
                                <section className="p-0">
                                    <div className="rounded-[0.9rem] flex flex-row pb-2.5 text-xs leading-5 text-slate-300 gap-2">
                                        {badges.map(name => (
                                            <div className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                                                {name}
                                            </div>
                                        ))}
                                    </div>

                                    <TimeControlSelector
                                        mode={timeControlMode}
                                        selectedTimeControl={selectedTimeControl}
                                        turnTimeSeconds={turnTimeSeconds}
                                        matchTimeMinutes={matchTimeMinutes}
                                        incrementSeconds={incrementSeconds}
                                        turnTimeStepCount={TURN_TIME_STEP_SECONDS.length}
                                        matchTimeStepCount={MATCH_TIME_STEP_MINUTES.length}
                                        incrementStepCount={INCREMENT_STEP_SECONDS.length}
                                        turnTimeStepIndex={turnTimeStepIndex}
                                        matchTimeStepIndex={matchTimeStepIndex}
                                        incrementStepIndex={incrementStepIndex}
                                        onModeChange={setTimeControlMode}
                                        onTurnTimeStepIndexChange={setTurnTimeStepIndex}
                                        onMatchTimeStepIndexChange={setMatchTimeStepIndex}
                                        onIncrementStepIndexChange={setIncrementStepIndex}
                                    />
                                </section>
                            )}

                            {showAdvancedOptions && (
                                <>
                                    <section className="p-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                                                    Mode
                                                </div>
                                            </div>

                                            <div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${rated ? `bg-amber-300/15 text-amber-100` : `bg-white/8 text-slate-100`}`}>
                                                {rated ? `rated` : `casual`}
                                            </div>
                                        </div>

                                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                                            <SelectableOptions
                                                onClick={() => setRated(false)}
                                                selected={!rated}
                                                title="Casual"
                                                description="Casual unrated game"
                                            />

                                            <SelectableOptions
                                                onClick={() => {
                                                    if (canCreateRatedLobby) {
                                                        setRated(true);
                                                    }
                                                }}
                                                selected={rated}
                                                disabled={!canCreateRatedLobby}
                                                title="Rated"
                                                description="Rated game with ELO"
                                            />
                                        </div>

                                        {!canCreateRatedLobby && (
                                            <div className="mt-2.5 rounded-[0.9rem] border border-amber-300/20 bg-amber-300/10 px-3 py-2.5 text-xs leading-5 text-amber-50/85">
                                                Rated lobbies are for authenticated players only.
                                            </div>
                                        )}
                                    </section>

                                    <section className="p-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                                                    Visibility
                                                </div>
                                            </div>

                                            <div className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                                                {visibility}
                                            </div>
                                        </div>

                                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                                            {visibilityOptions.map((option) => {
                                                const selected = visibility === option.value;

                                                return (
                                                    <SelectableOptions
                                                        key={option.value}

                                                        onClick={() => setVisibility(option.value)}
                                                        selected={selected}

                                                        title={option.title}
                                                        description={option.description}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </section>

                                    <section className="p-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                                                    First Player
                                                </div>
                                            </div>

                                            <div className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                                                {firstPlayer}
                                            </div>
                                        </div>

                                        <div className="mt-2.5 grid gap-2 md:grid-cols-3">
                                            {firstPlayerOptions.map((option) => {
                                                const selected = firstPlayer === option.value;

                                                return (
                                                    <SelectableOptions
                                                        key={option.value}
                                                        onClick={() => setFirstPlayer(option.value)}
                                                        selected={selected}
                                                        title={option.title}
                                                        description={option.description}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </section>


                                    <section>
                                        <TimeControlSelector
                                            mode={timeControlMode}
                                            selectedTimeControl={selectedTimeControl}
                                            turnTimeSeconds={turnTimeSeconds}
                                            matchTimeMinutes={matchTimeMinutes}
                                            incrementSeconds={incrementSeconds}
                                            turnTimeStepCount={TURN_TIME_STEP_SECONDS.length}
                                            matchTimeStepCount={MATCH_TIME_STEP_MINUTES.length}
                                            incrementStepCount={INCREMENT_STEP_SECONDS.length}
                                            turnTimeStepIndex={turnTimeStepIndex}
                                            matchTimeStepIndex={matchTimeStepIndex}
                                            incrementStepIndex={incrementStepIndex}
                                            onModeChange={setTimeControlMode}
                                            onTurnTimeStepIndexChange={setTurnTimeStepIndex}
                                            onMatchTimeStepIndexChange={setMatchTimeStepIndex}
                                            onIncrementStepIndexChange={setIncrementStepIndex}
                                        />
                                    </section>
                                </>
                            )}
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-3">
                            <button
                                onClick={onClose}
                                className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 transition hover:bg-white/12"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleCreate}
                                className="rounded-full bg-amber-300 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
                            >
                                Create Lobby
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default CreateLobbyDialog;
