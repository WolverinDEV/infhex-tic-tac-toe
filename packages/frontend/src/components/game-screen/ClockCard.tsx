import type { ReactNode } from 'react';

import { formatMinutesSeconds } from '../../utils/duration';

type ClockCardProps = {
    label: string
    timeMs?: number | null
    valueLabel?: string
    markerColor?: string
    isHighlighted?: boolean
    isTimeEmphasized?: boolean
    trailingBadge?: ReactNode
};

function ClockCard({
    label,
    timeMs = null,
    valueLabel,
    markerColor,
    isHighlighted = false,
    isTimeEmphasized = false,
    trailingBadge,
}: Readonly<ClockCardProps>) {
    const hasPlayerMarker = markerColor !== undefined;
    const paddingClassName = hasPlayerMarker
        ? `px-2 py-1.5 sm:px-2.5 sm:py-2`
        : `px-2.5 py-1.5 sm:px-3 sm:py-2`;
    const value = valueLabel ?? formatMinutesSeconds(timeMs);

    return (
        <div
            className={`rounded-md border ${paddingClassName} ${isHighlighted
                ? `border-emerald-300/35 bg-emerald-400/12 shadow-[0_0_0_1px_rgba(110,231,183,0.12)]`
                : `border-white/10 bg-white/6`
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    {hasPlayerMarker && (
                        <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: markerColor }}
                        />
                    )}

                    <span
                        className={hasPlayerMarker
                            ? `min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 sm:text-[11px]`
                            : `min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[10px]`}
                    >
                        {label}
                    </span>

                    {trailingBadge}
                </div>

                {valueLabel ? (
                    <div className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-slate-200 sm:text-sm">
                        {value}
                    </div>
                ) : (
                    <div className={`shrink-0 text-base font-black tabular-nums leading-none sm:text-lg ${isHighlighted || isTimeEmphasized ? `text-emerald-100` : `text-white`}`}>
                        {value}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ClockCard;
