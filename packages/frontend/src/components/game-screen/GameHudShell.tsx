import type { ReactNode, Ref } from 'react'
import { cn } from '../../utils/cn'

interface GameHudShellProps {
    role: 'left' | 'right'
    isOpen: boolean
    onOpen: () => void
    onClose: () => void
    openTitle: string
    openIcon: ReactNode
    closeTitle: string
    children: ReactNode
    openButtonBadge?: ReactNode
    panelRef?: Ref<HTMLDivElement>
}

function CloseIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6 18 18" />
            <path d="M18 6 6 18" />
        </svg>
    )
}

function GameHudShell({
    role: side,
    isOpen,
    onOpen,
    onClose,
    openTitle,
    openIcon,
    closeTitle,
    children,
    openButtonBadge,
    panelRef,
}: Readonly<GameHudShellProps>) {
    if (!isOpen) {
        /* just render as icon */
        return (
            <button
                type="button"
                onClick={onOpen}
                title={openTitle}
                className="relative pointer-events-auto self-end flex mr-3 mb-3 h-10 w-10 items-center justify-center rounded-full bg-slate-700/95 text-white shadow-lg transition hover:bg-slate-600"
            >
                {openIcon}
                {openButtonBadge}
            </button>
        )
    }


    return (
        <div
            ref={panelRef}
            className={cn(
                "pointer-events-auto z-[20]",
                "w-auto md:w-full md:max-w-sm",
                "overflow-hidden",
                "bg-slate-800",
                "px-4 py-4",
                "ml-auto",
                "shadow-[0_12px_45px_rgba(15,23,42,0.22)]",
                "backdrop-blur-md outline-none",
                "absolute",
                "bottom-0 left-0 right-0",
                "md:relative",
                "md:rounded-tl-[1.5rem] md:rounded-tr-none",
                side === "right" && "md:rounded-bl-[1.5rem] md:mb-4"
            )}
        >
            <div className="pointer-events-auto absolute right-3 top-3 z-10">
                <button
                    type="button"
                    onClick={onClose}
                    title={closeTitle}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/95 shadow-lg transition hover:bg-slate-600"
                >
                    <CloseIcon />
                </button>
            </div>

            {children}
        </div>
    )
}

export default GameHudShell
