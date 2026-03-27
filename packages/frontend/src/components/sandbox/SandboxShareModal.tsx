import { useEffect, useMemo, useState } from 'react'

type SandboxShareModalProps = {
  isOpen: boolean
  isCreating: boolean
  isCopying: boolean
  shareUrl: string | null
  initialName: string | null
  errorMessage: string | null
  onClose: () => void
  onCreate: (name: string) => void
  onCopy: () => void
}

function SandboxShareModal({
  isOpen,
  isCreating,
  isCopying,
  shareUrl,
  initialName,
  errorMessage,
  onClose,
  onCreate,
  onCopy
}: Readonly<SandboxShareModalProps>) {
  const [positionName, setPositionName] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setPositionName('')
      return
    }

    setPositionName(initialName ?? '')
  }, [initialName, isOpen])

  if (!isOpen) {
    return null
  }

  const trimmedName = positionName.trim()
  const validationMessage = useMemo(() => {
    if (trimmedName.length === 0) {
      return 'Enter a name for this position.'
    }

    if (trimmedName.length > 80) {
      return 'Position names can be at most 80 characters long.'
    }

    return null
  }, [trimmedName])
  const visibleErrorMessage = errorMessage ?? validationMessage
  const isLinkReady = Boolean(shareUrl)

  return (
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl rounded-[1.5rem] border border-violet-300/20 bg-slate-900/95 px-6 py-6 text-center shadow-[0_30px_120px_rgba(15,23,42,0.58)] backdrop-blur sm:px-8 sm:py-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-200/80 sm:text-xs">
          Share Position
        </div>
        <h2 className="mt-3 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
          {isLinkReady ? 'Sandbox Link Ready' : 'Name This Position'}
        </h2>
        <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base">
          {isLinkReady
            ? 'Anyone with this link can load the current sandbox position onto their own board.'
            : 'Give this sandbox position a name before creating the share link.'}
        </p>

        {!isLinkReady && (
          <input
            value={positionName}
            onChange={(event) => setPositionName(event.target.value)}
            placeholder="Opening Trap, Ladder Test, Endgame Study..."
            autoFocus
            className="mt-6 w-full rounded-2xl border border-violet-300/15 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-slate-500 focus:border-violet-300/40 focus:bg-slate-950 focus:ring-2 focus:ring-violet-300/12"
          />
        )}

        {isLinkReady && (
          <>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Position Name</div>
              <div className="mt-1 truncate text-sm text-white">{trimmedName}</div>
            </div>

            <input
              value={shareUrl ?? ''}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className="mt-4 w-full rounded-2xl border border-sky-300/15 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-slate-500 focus:border-sky-300/40 focus:bg-slate-950 focus:ring-2 focus:ring-sky-300/12"
            />
          </>
        )}

        {visibleErrorMessage && (
          <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/8 px-4 py-3 text-left text-sm text-rose-100">
            {visibleErrorMessage}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
          >
            Close
          </button>
          {isLinkReady ? (
            <button
              onClick={onCopy}
              disabled={isCopying}
              className="rounded-full bg-violet-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isCopying ? 'Copying...' : 'Copy Link'}
            </button>
          ) : (
            <button
              onClick={() => onCreate(trimmedName)}
              disabled={Boolean(validationMessage) || isCreating}
              className="rounded-full bg-violet-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isCreating ? 'Creating...' : 'Create Link'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SandboxShareModal
