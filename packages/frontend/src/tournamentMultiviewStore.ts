import type {
    GameCellPlaceEvent,
    GameState,
    GameStateEvent,
    SessionInfo,
    SessionWatchErrorEvent,
    SessionWatchStartedEvent,
    SessionUpdatedEvent,
} from '@ih3t/shared';
import { createEmptyGameState } from '@ih3t/shared';
import { create } from 'zustand';

import { TOURNAMENT_MULTIVIEW_MAX_TILES } from './utils/tournamentMultiview';

export type TournamentMultiviewTileStatus = `loading` | `live` | `finished` | `unavailable` | `error`;

export type TournamentMultiviewTile = {
    sessionId: string
    status: TournamentMultiviewTileStatus
    session: SessionInfo | null
    gameState: GameState | null
    errorMessage: string | null
};

type TournamentMultiviewStoreState = {
    activeTournamentId: string | null
    selectionsByTournament: Record<string, string[]>
    tilesBySessionId: Record<string, TournamentMultiviewTile>

    activateTournament: (tournamentId: string, eligibleSessionIds: string[]) => void
    deactivateTournament: (tournamentId: string) => void

    addSession: (tournamentId: string, sessionId: string) => void
    removeSession: (tournamentId: string, sessionId: string) => void
    moveSession: (tournamentId: string, sessionId: string, direction: -1 | 1) => void
    markSessionLoading: (sessionId: string) => void

    handleWatchStarted: (payload: SessionWatchStartedEvent) => void
    handleWatchError: (payload: SessionWatchErrorEvent) => void
    handleSessionUpdate: (payload: SessionUpdatedEvent) => void
    handleGameState: (payload: GameStateEvent) => void
    handleGameCellPlace: (payload: GameCellPlaceEvent) => void
};

function deriveTileStatus(session: SessionInfo | null, fallback: TournamentMultiviewTileStatus = `live`): TournamentMultiviewTileStatus {
    if (!session) {
        return fallback;
    }

    if (session.state.status === `finished`) {
        return `finished`;
    }

    if (session.state.status === `in-game`) {
        return `live`;
    }

    return fallback;
}

function mergeGameState(currentGameState: GameState | null, partialGameState: Partial<GameState>): GameState {
    const nextGameState = currentGameState ? structuredClone(currentGameState) : createEmptyGameState();
    Object.assign(nextGameState, partialGameState);
    return nextGameState;
}

function classifyWatchError(message: string): TournamentMultiviewTileStatus {
    if (message === `session unavailable` || message === `Session not found` || message.includes(`not available`)) {
        return `unavailable`;
    }

    return `error`;
}

export const useTournamentMultiviewStore = create<TournamentMultiviewStoreState>((set) => ({
    activeTournamentId: null,
    selectionsByTournament: {},
    tilesBySessionId: {},

    activateTournament: (tournamentId, eligibleSessionIds) => set((state) => {
        if (state.activeTournamentId === tournamentId) {
            return state;
        }

        const hasStoredSelection = Object.prototype.hasOwnProperty.call(state.selectionsByTournament, tournamentId);
        const storedSelection = state.selectionsByTournament[tournamentId] ?? [];
        const nextSelection = hasStoredSelection
            ? storedSelection.slice(0, TOURNAMENT_MULTIVIEW_MAX_TILES)
            : eligibleSessionIds.slice(0, TOURNAMENT_MULTIVIEW_MAX_TILES);

        return {
            activeTournamentId: tournamentId,
            selectionsByTournament: {
                ...state.selectionsByTournament,
                [tournamentId]: nextSelection,
            },
        };
    }),

    deactivateTournament: (tournamentId) => set((state) => {
        if (state.activeTournamentId !== tournamentId) {
            return state;
        }

        return {
            activeTournamentId: null,
        };
    }),

    addSession: (tournamentId, sessionId) => set((state) => {
        const currentSelection = state.selectionsByTournament[tournamentId] ?? [];
        if (currentSelection.includes(sessionId) || currentSelection.length >= TOURNAMENT_MULTIVIEW_MAX_TILES) {
            return state;
        }

        return {
            selectionsByTournament: {
                ...state.selectionsByTournament,
                [tournamentId]: [...currentSelection, sessionId],
            },
        };
    }),

    removeSession: (tournamentId, sessionId) => set((state) => {
        const currentSelection = state.selectionsByTournament[tournamentId] ?? [];
        const nextSelection = currentSelection.filter((entry) => entry !== sessionId);
        const nextTiles = { ...state.tilesBySessionId };
        delete nextTiles[sessionId];

        return {
            selectionsByTournament: {
                ...state.selectionsByTournament,
                [tournamentId]: nextSelection,
            },
            tilesBySessionId: nextTiles,
        };
    }),

    moveSession: (tournamentId, sessionId, direction) => set((state) => {
        const currentSelection = state.selectionsByTournament[tournamentId] ?? [];
        const currentIndex = currentSelection.indexOf(sessionId);
        if (currentIndex === -1) {
            return state;
        }

        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= currentSelection.length) {
            return state;
        }

        const nextSelection = currentSelection.slice();
        [nextSelection[currentIndex], nextSelection[nextIndex]] = [nextSelection[nextIndex], nextSelection[currentIndex]];

        return {
            selectionsByTournament: {
                ...state.selectionsByTournament,
                [tournamentId]: nextSelection,
            },
        };
    }),

    markSessionLoading: (sessionId) => set((state) => ({
        tilesBySessionId: {
            ...state.tilesBySessionId,
            [sessionId]: {
                sessionId,
                session: state.tilesBySessionId[sessionId]?.session ?? null,
                gameState: state.tilesBySessionId[sessionId]?.gameState ?? null,
                errorMessage: null,
                status: `loading`,
            },
        },
    })),

    handleWatchStarted: (payload) => set((state) => ({
        tilesBySessionId: {
            ...state.tilesBySessionId,
            [payload.session.id]: {
                sessionId: payload.session.id,
                session: payload.session,
                gameState: payload.gameState,
                errorMessage: null,
                status: deriveTileStatus(payload.session),
            },
        },
    })),

    handleWatchError: (payload) => set((state) => {
        const currentTile = state.tilesBySessionId[payload.sessionId] ?? null;
        if (currentTile?.session?.state.status === `finished`) {
            return {
                tilesBySessionId: {
                    ...state.tilesBySessionId,
                    [payload.sessionId]: {
                        ...currentTile,
                        errorMessage: null,
                        status: `finished`,
                    },
                },
            };
        }

        return {
            tilesBySessionId: {
                ...state.tilesBySessionId,
                [payload.sessionId]: {
                    sessionId: payload.sessionId,
                    session: currentTile?.session ?? null,
                    gameState: currentTile?.gameState ?? null,
                    errorMessage: payload.message,
                    status: classifyWatchError(payload.message),
                },
            },
        };
    }),

    handleSessionUpdate: (payload) => set((state) => {
        const currentTile = state.tilesBySessionId[payload.sessionId];
        if (!currentTile?.session) {
            return state;
        }

        const nextSession: SessionInfo = {
            ...currentTile.session,
            ...payload.session,
            id: payload.sessionId,
        };

        return {
            tilesBySessionId: {
                ...state.tilesBySessionId,
                [payload.sessionId]: {
                    ...currentTile,
                    session: nextSession,
                    status: deriveTileStatus(nextSession, currentTile.status),
                },
            },
        };
    }),

    handleGameState: (payload) => set((state) => {
        const currentTile = state.tilesBySessionId[payload.sessionId];
        if (!currentTile) {
            return state;
        }

        return {
            tilesBySessionId: {
                ...state.tilesBySessionId,
                [payload.sessionId]: {
                    ...currentTile,
                    gameState: mergeGameState(currentTile.gameState, payload.gameState),
                },
            },
        };
    }),

    handleGameCellPlace: (payload) => set((state) => {
        const currentTile = state.tilesBySessionId[payload.sessionId];
        if (!currentTile) {
            return state;
        }

        const nextGameState = mergeGameState(currentTile.gameState, payload.state);
        nextGameState.cells = [...nextGameState.cells, payload.cell];

        return {
            tilesBySessionId: {
                ...state.tilesBySessionId,
                [payload.sessionId]: {
                    ...currentTile,
                    gameState: nextGameState,
                },
            },
        };
    }),
}));
