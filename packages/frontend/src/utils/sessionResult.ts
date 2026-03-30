import type { SessionFinishReason, SessionParticipant, SessionStateFinished } from '@ih3t/shared';

export function getSpectatorRematchStatus(players: SessionParticipant[], state: SessionStateFinished) {
    const connectedPlayers = players.filter(player => player.connection.status !== `disconnected`);
    const requestingPlayers = players.filter(player => state.rematchAcceptedPlayerIds.includes(player.id));

    if (state.finishReason === `terminated`) {
        return {
            label: `Rematch Unavailable`,
            message: `This result does not support a rematch.`,
            className: `border-white/12 bg-white/7 text-slate-100`,
            accentClassName: `text-white/70`,
        };
    } else if (connectedPlayers.length === 0) {
        return {
            label: `Rematch Unavailable`,
            message: `Both players left the session.`,
            className: `border-rose-200/20 bg-rose-400/10 text-rose-50`,
            accentClassName: `text-rose-100/80`,
        };
    } else if (connectedPlayers.length !== players.length) {
        return {
            label: `Rematch Unavailable`,
            message: `One player left the session.`,
            className: `border-rose-200/20 bg-rose-400/10 text-rose-50`,
            accentClassName: `text-rose-100/80`,
        };
    } else if (requestingPlayers.length === 0) {
        return {
            label: `Rematch Available`,
            message: `No one has asked for a rematch yet.`,
            className: `border-white/12 bg-white/7 text-slate-100`,
            accentClassName: `text-white/70`,
        };
    } else if (requestingPlayers.length < players.length) {
        const rematchRequestLabel = requestingPlayers[0]?.displayName?.trim() || `A player`;
        return {
            label: `Rematch Requested`,
            message: `${rematchRequestLabel} want to play another round.`,
            className: `border-emerald-200/20 bg-emerald-400/10 text-emerald-50`,
            accentClassName: `text-emerald-100/80`,
        };
    } else {
        return {
            label: `Rematch Starting`,
            message: `Both players accepted the rematch.`,
            className: `border-sky-200/20 bg-sky-400/10 text-sky-50`,
            accentClassName: `text-sky-100/80`,
        };
    }
}

export function getSessionFinishReasonLabel(reason: SessionFinishReason | null | undefined) {
    if (reason === `six-in-a-row`) {
        return `Six In A Row`;
    }

    if (reason === `timeout`) {
        return `Timeout`;
    }

    if (reason === `surrender`) {
        return `Surrender`;
    }

    if (reason === `disconnect`) {
        return `Disconnect`;
    }

    if (reason === `draw-agreement`) {
        return `Draw`;
    }

    return `Terminated`;
}

export function getSessionFinishReasonSentenceLabel(reason: SessionFinishReason | null | undefined) {
    if (reason === `six-in-a-row`) {
        return `Six in a row`;
    }

    if (reason === `timeout`) {
        return `Timeout`;
    }

    if (reason === `surrender`) {
        return `Surrender`;
    }

    if (reason === `disconnect`) {
        return `Disconnect`;
    }

    if (reason === `draw-agreement`) {
        return `Draw`;
    }

    return `Terminated`;
}

type ResultMessageVariant = `win` | `lose` | `draw`;

const kResultMessages: Record<`${ResultMessageVariant}-${SessionFinishReason}`, string> = {
    "win-six-in-a-row": `You completed a six-tile row.`,
    "win-surrender": `The other player surrendered.`,
    "win-timeout": `The other player ran out of time.`,
    'win-disconnect': `The other player disconnected.`,
    'win-draw-agreement': `Both players agreed to a draw.`,
    'win-terminated': `The match has been terminated.`,

    'lose-six-in-a-row': `The other player completed a six-tile row.`,
    'lose-surrender': `You surrendered the match.`,
    'lose-timeout': `You ran out of time.`,
    'lose-disconnect': `You left the match before it finished.`,
    'lose-draw-agreement': `Both players agreed to a draw.`,
    'lose-terminated': `The match has been terminated.`,

    'draw-six-in-a-row': `The match ended without a winner.`,
    'draw-surrender': `The match ended without a winner.`,
    'draw-timeout': `The match ended without a winner.`,
    'draw-disconnect': `The match ended without a winner.`,
    'draw-draw-agreement': `Both players agreed to a draw.`,
    'draw-terminated': `The match has been terminated.`,
};

export function getPlayerResultMessage(variant: ResultMessageVariant, finishReason: SessionFinishReason) {
    return kResultMessages[`${variant}-${finishReason}`];
}

export function getSpectatorResultTitle(reason: SessionFinishReason | null | undefined, winnerName: string | null) {
    if (winnerName) {
        return `${winnerName} Won`;
    }

    if (reason === `draw-agreement`) {
        return `Match Drawn`;
    }

    return `Match Finished`;
}

export function getSpectatorResultMessage(
    reason: SessionFinishReason | null | undefined,
    winnerName: string | null,
) {
    const winningPlayerLabel = winnerName ?? `A player`;

    if (reason === `timeout`) {
        return `${winningPlayerLabel} won on time after the other player ran out of time.`;
    }

    if (reason === `six-in-a-row`) {
        return `${winningPlayerLabel} connected six hexagons in a row.`;
    }

    if (reason === `surrender`) {
        return `${winningPlayerLabel} won after the other player surrendered.`;
    }

    if (reason === `disconnect`) {
        return `${winningPlayerLabel} won after the other player disconnected.`;
    }

    if (reason === `draw-agreement`) {
        return `Both players agreed to end the match in a draw.`;
    }

    return `The match was terminated before a winner could be declared.`;
}
