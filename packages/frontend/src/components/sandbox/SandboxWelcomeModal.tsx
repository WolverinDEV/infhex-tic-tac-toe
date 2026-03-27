type SandboxWelcomeModalProps = {
  isOpen: boolean
  onStartCleanBoard: () => void
  onImportPosition: () => void
}

function SandboxWelcomeModal({
  isOpen,
  onStartCleanBoard,
  onImportPosition
}: Readonly<SandboxWelcomeModalProps>) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <div className="pointer-events-auto w-full max-w-lg rounded-[1.75rem] border border-emerald-300/25 bg-slate-900/95 px-6 py-6 text-center shadow-[0_30px_120px_rgba(15,23,42,0.58)] backdrop-blur sm:px-8 sm:py-8">
        <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-emerald-100">
          Sandbox Mode
        </div>
        <h1 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
          Local Free Play
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base">
          Sandbox mode is a local board with no clock. Control both players yourself, hand either side to a bot,
          and reset any time. Start from an empty board or load a shared position.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={onImportPosition}
            className="w-full rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
          >
            Import Position
          </button>
          <button
            onClick={onStartCleanBoard}
            className="w-full rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-300"
          >
            New Board
          </button>
        </div>
      </div>
    </div>
  )
}

export default SandboxWelcomeModal
