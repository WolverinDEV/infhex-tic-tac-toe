import type { ReactNode } from 'react'

interface FinishedGameReviewLayoutProps {
  onBack: () => void
  onRetry: () => void
  children: ReactNode
}

function FinishedGameReviewLayout({
  onBack,
  onRetry,
  children
}: Readonly<FinishedGameReviewLayoutProps>) {
  return (
    <div className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.16),_transparent_22%),linear-gradient(135deg,_#020617,_#0f172a_45%,_#111827)] text-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[92rem] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-sky-200/80">Replay Viewer</p>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
              Finished Match Review
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRetry}
              className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
            >
              Refresh
            </button>
            <button
              onClick={onBack}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
            >
              Back To Archive
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}

export default FinishedGameReviewLayout
