import {
    GameCellPlaceEvent,
    type GameState,
    GameStateEvent,
    type MatchClaimWinState,
    SessionChatEvent,
    SessionId,
    type SessionClaimWinEvent,
    type SessionInfo,
    SessionJoinedEvent,
    SessionParticipantRole,
} from '@ih3t/shared';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

type PendingSessionJoinState
    = | { status: `idle`; sessionId: null; errorMessage: null }
    | { status: `pending`; sessionId: SessionId; errorMessage: null }
    | { status: `not-found`; sessionId: SessionId; errorMessage: string }
    | { status: `failed`; sessionId: SessionId; errorMessage: string };

type ActiveSession = SessionInfo & {
    localParticipantId: string
    localParticipantRole: SessionParticipantRole

    gameState: GameState
};

type LiveGameStoreState = {
    connection: {
        isConnected: boolean
        isInitialized: boolean
        isUnstable: boolean
    }

    session: ActiveSession | null
    claimWinState: MatchClaimWinState | null
    pendingSessionJoin: PendingSessionJoinState

    onSocketConnected: () => void
    onSocketInitialized: () => void
    onSocketDisconnected: () => void
    setConnectionUnstable: (isUnstable: boolean) => void

    startJoiningSession: (sessionId: SessionId) => void
    failJoiningSession: (sessionId: SessionId, errorMessage: string) => void

    setupSession: (payload: SessionJoinedEvent) => void
    clearSession: () => void

    handleSessionUpdate: (payload: Partial<SessionInfo> & { id: SessionInfo[`id`] }) => void
    handleSessionChatEvent: (payload: SessionChatEvent) => void

    handleGameState: (payload: GameStateEvent) => void
    handleGameCellPlace: (payload: GameCellPlaceEvent) => void
    handleClaimWinEvent: (payload: SessionClaimWinEvent) => void
};

export const useLiveGameStore = create<LiveGameStoreState>()(
    immer<LiveGameStoreState>((set) => ({
        connection: {
            isConnected: false,
            isInitialized: false,
            isUnstable: false,
            currentPlayerId: ``,
        },
        pendingSessionJoin: { status: `idle`, sessionId: null, errorMessage: null },
        session: null,
        claimWinState: null,
        game: null,

        onSocketConnected: () => set(state => {
            state.connection.isConnected = true;
            state.connection.isInitialized = false;
            state.connection.isUnstable = false;
            state.session = null;
        }),
        onSocketInitialized: () => set(state => {
            state.connection.isInitialized = true;
            state.connection.isUnstable = false;
        }),
        onSocketDisconnected: () => set(state => {
            state.connection.isConnected = false;
            state.connection.isInitialized = false;
            state.connection.isUnstable = false;
            state.pendingSessionJoin = { status: `idle`, sessionId: null, errorMessage: null };
        }),
        setConnectionUnstable: (isUnstable) => set(state => {
            state.connection.isUnstable = state.connection.isConnected && isUnstable;
        }),

        startJoiningSession: (sessionId) => set(state => {
            state.pendingSessionJoin = {
                status: `pending`,
                sessionId,
                errorMessage: null,
            };
        }),
        failJoiningSession: (sessionId, errorMessage) => set(state => {
            if (state.pendingSessionJoin.sessionId !== sessionId) {
                return;
            }

            state.pendingSessionJoin = {
                status: errorMessage === `Session not found` ? `not-found` : `failed`,
                sessionId,
                errorMessage,
            };
        }),
        setupSession: (payload) => set(state => {
            state.pendingSessionJoin = { status: `idle`, sessionId: null, errorMessage: null };
            state.claimWinState = null;
            state.session = {
                ...payload.session,
                gameState: payload.gameState,

                localParticipantId: payload.participantId,
                localParticipantRole: payload.participantRole,
            };
        }),
        handleSessionUpdate: (payload) => set(state => {
            if (state.session?.id !== payload.id) {
                /* update is not for the currently active session */
                return;
            }

            Object.assign(state.session, payload);
        }),
        handleSessionChatEvent: event => set(state => {
            if (state.session?.id !== event.sessionId) {
                return;
            }

            const chat = state.session.chat;
            chat.displayNames[event.message.senderId] = event.senderDisplayName;
            chat.messages = [...chat.messages, event.message];
        }),
        handleGameState: event => set(state => {
            if (state.session?.id !== event.sessionId) {
                return;
            }

            Object.assign(state.session.gameState, event.gameState);
        }),
        handleGameCellPlace: event => set(state => {
            if (state.session?.id !== event.sessionId) {
                return;
            }

            Object.assign(state.session.gameState, event.state);
            state.session.gameState.cells = [
                ...state.session.gameState.cells,
                event.cell,
            ];
        }),
        handleClaimWinEvent: (event) => set(state => {
            if (state.session?.id !== event.sessionId) {
                return;
            }

            state.claimWinState = event.state;
        }),
        clearSession: () => set(state => {
            state.pendingSessionJoin = { status: `idle`, sessionId: null, errorMessage: null };
            state.session = null;
            state.claimWinState = null;
        }),
    })),
);
