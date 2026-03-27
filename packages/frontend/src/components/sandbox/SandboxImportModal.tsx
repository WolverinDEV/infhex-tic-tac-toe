import { useEffect, useState } from 'react';

type SandboxImportModalProps = {
    isOpen: boolean
    isLoading: boolean
    errorMessage: string | null
    parsePositionId: (value: string) => string | null
    onClose: () => void
    onImport: (positionId: string) => void
    onInputChange: () => void
};

function SandboxImportModal({
    isOpen,
    isLoading,
    errorMessage,
    parsePositionId,
    onClose,
    onImport,
    onInputChange,
}: Readonly<SandboxImportModalProps>) {
    const [inputValue, setInputValue] = useState(``);

    useEffect(() => {
        if (!isOpen) {
            setInputValue(``);
        }
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const parsedPositionId = parsePositionId(inputValue);
    const hasInput = inputValue.trim().length > 0;
    const validationMessage = hasInput && !parsedPositionId
        ? `Enter a valid sandbox position id or link.`
        : null;
    const visibleErrorMessage = validationMessage ?? errorMessage;

    return (
        <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="pointer-events-auto w-full max-w-lg rounded-3xl border border-sky-300/20 bg-slate-900/95 px-6 py-6 text-center shadow-[0_30px_120px_rgba(15,23,42,0.58)] backdrop-blur sm:px-8 sm:py-8">
                <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-emerald-100">
                    Sandbox Mode
                </div>

                <h1 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
                    Import Position
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base">
                    Paste a shared sandbox ID or a full sandbox link to load that position onto your board.
                </p>

                <input
                    value={inputValue}
                    onChange={(event) => {
                        setInputValue(event.target.value);
                        onInputChange();
                    }}
                    placeholder="abc1234 or https://..."
                    autoFocus
                    className="mt-6 w-full rounded-2xl border border-sky-300/15 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-slate-500 focus:border-sky-300/40 focus:bg-slate-950 focus:ring-2 focus:ring-sky-300/12"
                    style={{ colorScheme: `dark` }}
                />

                {visibleErrorMessage && (
                    <div className="mt-3 rounded-2xl border border-rose-600/60 bg-rose-500/10 px-4 py-3 text-left text-sm text-rose-600">
                        {visibleErrorMessage}
                    </div>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={() => {
                            if (parsedPositionId) {
                                onImport(parsedPositionId);
                            }
                        }}
                        disabled={isLoading || !parsedPositionId}
                        className="rounded-full bg-sky-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isLoading ? `Loading...` : `Import`}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SandboxImportModal;
