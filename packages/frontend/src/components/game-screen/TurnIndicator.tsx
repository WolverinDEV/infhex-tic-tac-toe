import { getPlayerLabel } from '../../utils/gameBoard';

type TurnIndicatorProps = {
    playerIds: readonly string[]
    playerNames: Readonly<Record<string, string>>
    currentTurnPlayerId: string | null
    placementsRemaining: number
    activePlayerColor: string
    isSpectator: boolean
    canPlaceCell: boolean
};

function TurnIndicator({
    playerIds,
    playerNames,
    currentTurnPlayerId,
    placementsRemaining,
    activePlayerColor,
    isSpectator,
    canPlaceCell,
}: Readonly<TurnIndicatorProps>) {
    const spectatorAccentTextStyle = isSpectator ? { color: activePlayerColor } : undefined;
    const spectatorAccentDotStyle = isSpectator ? { backgroundColor: activePlayerColor } : undefined;

    const turnHeadline = isSpectator
        ? `Spectating`
        : canPlaceCell
            ? `It's your turn`
            : `Opponents turn`;

    const spectatorTurnDetail = !currentTurnPlayerId
        ? `Waiting for the next player to move.`
        : `${getPlayerLabel(playerIds, currentTurnPlayerId, playerNames)} to move.`;

    const turnDetail = isSpectator
        ? spectatorTurnDetail
        : canPlaceCell
            ? `${placementsRemaining} ${placementsRemaining === 1 ? `placement` : `placements`} left.`
            : `${placementsRemaining} ${placementsRemaining === 1 ? `placement` : `placements`} left for the opponent.`;

    return (
        <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
                <div
                    className={`flex min-w-0 items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] leading-tight ${canPlaceCell
                        ? `text-emerald-500`
                        : isSpectator
                            ? `text-sky-300`
                            : `text-slate-300`
                    }`}
                    style={spectatorAccentTextStyle}
                >
                    <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${canPlaceCell ? `bg-emerald-500` : isSpectator ? `` : `bg-slate-400`}`}
                        style={isSpectator ? spectatorAccentDotStyle : undefined}
                    />

                    <span className="min-w-0 truncate">
                        {turnHeadline}
                    </span>
                </div>

                <div className="mt-0.5 truncate text-xs leading-tight text-slate-300">
                    {turnDetail}
                </div>
            </div>

            <div className="shrink-0 pt-0.5">
                <div className="inline-flex items-center justify-end gap-1 px-1.5 py-1 sm:gap-1.5 sm:px-2">
                    <div className="flex w-8 gap-1 sm:w-10">
                        {Array.from({ length: 2 }, (_, index) => {
                            const isFilled = index >= 2 - placementsRemaining;
                            const color = isFilled
                                ? canPlaceCell
                                    ? `bg-emerald-500`
                                    : isSpectator
                                        ? ``
                                        : `bg-white/90`
                                : `bg-white/30`;

                            return (
                                <span
                                    key={index}
                                    className={`h-1.5 flex-1 rounded-full ${color}`}
                                    style={isFilled && isSpectator ? { backgroundColor: activePlayerColor } : undefined}
                                />
                            );
                        })}
                    </div>

                    <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {placementsRemaining}
                        {` `}
                        left
                    </span>
                </div>
            </div>
        </div>
    );
}

export default TurnIndicator;
