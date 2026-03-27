import type { ReactNode } from 'react'

type HudInfoBlockProps = {
  label: string
  children: ReactNode
}

function HudInfoBlock({ label, children }: Readonly<HudInfoBlockProps>) {
  return (
    <div className="border-l border-white/18 pl-3">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className="mt-1">
        {children}
      </div>
    </div>
  )
}

export default HudInfoBlock
