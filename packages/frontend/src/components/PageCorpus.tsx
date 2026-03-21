function RefreshIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
            <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16.5 4.5v3.7h-3.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function BackIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
            <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

interface PageCorpusProperties {
    category: React.ReactNode,
    title: React.ReactNode,
    description: React.ReactNode,
    children?: React.ReactNode,

    back?: string,
    onBack?: () => void,

    onRefresh?: () => void,
}

const PageCorpus = ({ category, title, description, children, back, onBack, onRefresh }: PageCorpusProperties) => {
    return (
        <div className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.16),_transparent_24%),linear-gradient(135deg,_#020617,_#0f172a_45%,_#111827)] text-white">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[92rem] flex-col gap-4">
                <div className="shrink-0 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between px-4 py-4 sm:px-6 sm:py-6">
                    <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3 lg:block">
                            <div>
                                <p className="text-sm uppercase tracking-[0.32em] text-sky-200/80">
                                    {category}
                                </p>
                                <h1 className="mt-2 text-2xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
                                    {title}
                                </h1>
                            </div>

                            <div className="flex items-center gap-2 lg:hidden">
                                <button
                                    onClick={onBack}
                                    aria-label="Back to lobby"
                                    className="inline-flex items-center justify-center rounded-full bg-amber-300 p-2.5 text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
                                >
                                    <BackIcon />
                                </button>
                                {onRefresh && (
                                    <button
                                        onClick={onRefresh}
                                        aria-label="Refresh archive"
                                        className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 p-2.5 text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                                    >
                                        <RefreshIcon />
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:mt-4 sm:text-base sm:leading-7">
                            {description}
                        </p>
                    </div>

                    <div className="hidden items-center justify-end gap-3 lg:flex">
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                aria-label="Refresh archive"
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                            >
                                Refresh
                            </button>
                        )}
                        <button
                            onClick={onBack}
                            className="hidden rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200 sm:inline-flex"
                        >
                            {back ?? "Back To Lobby"}
                        </button>
                    </div>
                </div>

                {children}
            </div>
        </div>
    )
};
export default PageCorpus;