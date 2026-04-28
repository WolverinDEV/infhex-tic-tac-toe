import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type DisplayShortcuts = {
    showNthLastMoveShortcuts?: boolean
    showUndoRedoShortcuts?: boolean
};

function isEditableEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return target.isContentEditable
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;
}

function InfoIcon() {
    return (
        <svg
            aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 10v5" />
            <path d="M12 7.5h.01" />
        </svg>
    );
}

function KeyboardIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2.5" />
            <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h6M16 14h.01" />
        </svg>
    );
}

function MouseIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="3" width="10" height="18" rx="5" />
            <path d="M12 3v6" />
        </svg>
    );
}

function ShortcutKey({
    children,
}: Readonly<{
    children: string
}>) {
    return (
        <span className="inline-flex items-center rounded-md border border-white/10 bg-white/7 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
            {children}
        </span>
    );
}

function ShortcutRow({
    label,
    description,
}: Readonly<{
    label: ReactNode
    description: string
}>) {
    return (
        <>
            <div className="flex flex-wrap gap-1.5 self-center">
                {label}
            </div>

            <div className="flex text-sm leading-6 text-slate-300 ">
                {description}
            </div>
        </>
    );
}

function ShortcutSection({
    title,
    icon,
    children,
}: Readonly<{
    title: string
    icon: ReactNode
    children: ReactNode
}>) {
    return (
        <section className="rounded-3xl border border-sky-300/10 bg-sky-300/6 p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                {icon}
                {title}
            </div>

            <div className="mt-3 gap-y-3 gap-x-3 grid grid-cols-[fit-content(40%)_1fr]">
                {children}
            </div>
        </section>
    );
}

function BoardHelpOverlay({
    showNthLastMoveShortcuts,
    showUndoRedoShortcuts,
    onClose,
}: Readonly<DisplayShortcuts & {
    onClose: () => void
}>) {
    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/76 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Board help"
                className="w-full max-w-4xl max-h-full rounded-[2rem] overflow-y-auto border border-white/10 bg-slate-950/96 p-5 text-white shadow-[0_30px_120px_rgba(2,6,23,0.7)] sm:p-6"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-200/75">
                            Board Help
                        </div>

                        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                            Shortcuts and markup
                        </h2>

                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                            Review recent moves, mark up candidate lines, and navigate the board without leaving the game.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => onClose()}
                        className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/10"
                    >
                        Close
                    </button>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <ShortcutSection title="Keyboard" icon={<KeyboardIcon />}>
                        {showNthLastMoveShortcuts && (
                            <ShortcutRow
                                label={(
                                    <ShortcutKey>
                                        1-9
                                    </ShortcutKey>
                                )}
                                description="Show and center the nth last move on the board."
                            />
                        )}

                        {showUndoRedoShortcuts && (
                            <>
                                <ShortcutRow
                                    label={(
                                        <ShortcutKey>
                                            Arrow Left
                                        </ShortcutKey>
                                    )}
                                    description="Undo the last move."
                                />

                                <ShortcutRow
                                    label={(
                                        <ShortcutKey>
                                            Arrow Right
                                        </ShortcutKey>
                                    )}
                                    description="Redo the next move."
                                />
                            </>
                        )}

                        <ShortcutRow
                            label={(
                                <>
                                    <ShortcutKey>
                                        ?
                                    </ShortcutKey>

                                    <ShortcutKey>
                                        F1
                                    </ShortcutKey>
                                </>
                            )}
                            description="Open this help card."
                        />

                        <ShortcutRow
                            label={(
                                <ShortcutKey>
                                    Esc
                                </ShortcutKey>
                            )}
                            description="Close this help card."
                        />
                    </ShortcutSection>

                    <ShortcutSection title="Mouse" icon={<MouseIcon />}>
                        <ShortcutRow
                            label={(
                                <ShortcutKey>
                                    Right Drag
                                </ShortcutKey>
                            )}
                            description="Draw a markup line or mark a single cell."
                        />

                        <ShortcutRow
                            label={(
                                <ShortcutKey>
                                    Right Click
                                </ShortcutKey>
                            )}
                            description="Remove an existing mark."
                        />

                        <ShortcutRow
                            label={(
                                <>
                                    <ShortcutKey>
                                        Shift
                                    </ShortcutKey>

                                    /

                                    <ShortcutKey>
                                        Ctrl
                                    </ShortcutKey>

                                    +

                                    <ShortcutKey>
                                        Right Drag
                                    </ShortcutKey>
                                </>
                            )}
                            description="Draw markup in yellow."
                        />

                        <ShortcutRow
                            label={(
                                <>
                                    <ShortcutKey>
                                        Alt
                                    </ShortcutKey>

                                    +

                                    <ShortcutKey>
                                        Right Drag
                                    </ShortcutKey>
                                </>
                            )}
                            description="Draw markup in blue."
                        />

                        <ShortcutRow
                            label={(
                                <>
                                    <ShortcutKey>
                                        Shift
                                    </ShortcutKey>

                                    +

                                    <ShortcutKey>
                                        Left Drag
                                    </ShortcutKey>
                                </>
                            )}
                            description="Start drawing without using the right mouse button."
                        />
                    </ShortcutSection>
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-300">
                    Drag to pan, use the mouse wheel or pinch to zoom, and click or tap an empty hex on your turn to place a tile.
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={() => onClose()}
                        className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold shadow-lg transition hover:bg-sky-500"
                    >
                        Continue Game
                    </button>
                </div>
            </div>
        </div>
    );
}

function HelpButton({
    onClick,
}: Readonly<{
    onClick: () => void
}>) {
    return (
        <button
            className="absolute bottom-0 left-0 p-5 cursor-pointer"
            title="Board help"
            onClick={(event) => {
                onClick();
                event.currentTarget.blur();
            }}
        >
            <InfoIcon />
        </button>
    );
}

function BoardHelp({
    showNthLastMoveShortcuts = false,
    showUndoRedoShortcuts = false,
}: Readonly<DisplayShortcuts>) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || isEditableEventTarget(event.target)) {
                return;
            }

            if (event.key === `Escape`) {
                setIsOpen(false);
                return;
            }

            const shouldOpenHelp = event.key === `?` || event.key === `F1`;
            if (!shouldOpenHelp) {
                return;
            }

            event.preventDefault();
            setIsOpen(true);
        };

        document.addEventListener(`keydown`, handleKeyDown);
        return () => document.removeEventListener(`keydown`, handleKeyDown);
    }, []);

    return (
        <>
            {isOpen && (
                <BoardHelpOverlay
                    showNthLastMoveShortcuts={showNthLastMoveShortcuts}
                    showUndoRedoShortcuts={showUndoRedoShortcuts}
                    onClose={() => setIsOpen(false)}
                />
            )}

            <HelpButton onClick={() => setIsOpen(true)} />
        </>
    );
}

export default BoardHelp;
