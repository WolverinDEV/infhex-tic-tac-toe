import { SandboxBotEngineInfo } from "../../sandbox/botLoader"

interface SandboxBotFactoryModalProps {
    isOpen: boolean
    onClose: () => void

    availableEngines: readonly SandboxBotEngineInfo[],
    selectedEngine: string | null,

    onSelectBotFactory: (botFactory: SandboxBotEngineInfo | null) => void
}

function SandboxBotFactoryModal({
    isOpen,
    onClose,

    availableEngines,
    selectedEngine,

    onSelectBotFactory
}: Readonly<SandboxBotFactoryModalProps>) {
    if (!isOpen) {
        return null
    }

    return (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-md">
            <button
                type="button"
                aria-label="Close bot engine picker"
                className="absolute inset-0"
                onClick={onClose}
            />

            <section className="relative flex flex-col z-10 w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-sky-300/18 bg-[linear-gradient(155deg,rgba(15,23,42,0.97),rgba(17,24,39,0.95)_55%,rgba(30,41,59,0.92))] px-5 py-5 shadow-[0_30px_120px_rgba(2,6,23,0.58)]">
                <div className="absolute -right-10 -top-14 h-24 w-24 rounded-full bg-sky-400/12 blur-3xl" />
                <div className="absolute -left-8 bottom-0 h-20 w-20 rounded-full bg-emerald-300/10 blur-3xl" />

                <div className="flex items-start justify-between gap-4">
                    <div className="pr-6">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-sky-300">Bot Engine</div>
                        <h2 className="mt-1 text-2xl font-bold text-white">Choose an engine</h2>
                        <div className="mt-2 text-sm leading-6 text-slate-300">
                            Pick which bot engine the bot should use.
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close bot engine picker"
                        title="Close bot engine picker"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700/95 shadow-lg transition hover:bg-slate-600"
                    >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M6 6 18 18" />
                            <path d="M18 6 6 18" />
                        </svg>
                    </button>
                </div>

                <div className="mt-5 grid gap-3">
                    {availableEngines.map((engine) => {
                        const isSelected = engine.name === selectedEngine

                        return (
                            <button
                                key={engine.displayName}
                                type="button"
                                onClick={() => onSelectBotFactory(engine)}
                                className={`rounded-2xl border px-4 py-4 text-left transition ${isSelected
                                    ? 'border-sky-300/35 bg-sky-300/10 shadow-[0_8px_18px_rgba(14,165,233,0.1)]'
                                    : 'border-white/10 bg-white/6 hover:border-white/20 hover:bg-white/10'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-white">{engine.displayName}</div>
                                        <div className="mt-1 text-xs leading-5 text-slate-300">{engine.description()}</div>
                                    </div>
                                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${isSelected
                                        ? 'bg-sky-200/15 text-sky-50'
                                        : 'bg-white/8 text-slate-100'
                                        }`}>
                                        {isSelected ? 'Selected' : 'Use'}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {selectedEngine && (
                    <button
                        type="button"
                        onClick={() => onSelectBotFactory(null)}
                        className="rounded-full mt-6 cursor-pointer bg-rose-500/75 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-rose-400 ml-auto"
                    >
                        Disable Bot Engine
                    </button>
                )}

            </section>
        </div>
    )
}

export default SandboxBotFactoryModal
