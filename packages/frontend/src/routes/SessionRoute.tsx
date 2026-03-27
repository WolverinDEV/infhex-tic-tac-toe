import { createEmptyGameState } from '@ih3t/shared';
import type { MouseEvent } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';

import GameOverlayFinishedPlayer from '../components/GameOverlayFinishedPlayer';
import GameOverlayFinishedSpectator from '../components/GameOverlayFinishedSpectator';
import GameScreen from '../components/GameScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import WaitingScreen from '../components/WaitingScreen';
import {
    joinSession,
    leaveSession,
    placeCell,
    requestRematch,
    sendSessionChatMessage,
    surrenderGame,
} from '../liveGameClient';
import { useLiveGameStore } from '../liveGameStore';
import { useQueryAccount, useQueryAccountPreferences } from '../query/accountClient';
import { useQueryServerShutdown } from '../query/serverClient';
import { useQuerySessionInfo } from '../query/sessionClient';
import { describeSessionInvite } from '../utils/routeMetadata';
import { buildFinishedGamePath, buildSessionPath } from './archiveRouteState';

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
    return event.button === 0
        && !event.defaultPrevented
        && !event.metaKey
        && !event.altKey
        && !event.ctrlKey
        && !event.shiftKey;
}

function showErrorToast(message: string) {
    toast.error(message, {
        toastId: `error:${message}`,
    });
}

function showSuccessToast(message: string) {
    toast.success(message, {
        toastId: `success:${message}`,
    });
}

function SessionConnectingScreen({ sessionId, isConnected, onBack }: Readonly<{
    sessionId: string
    isConnected: boolean
    onBack: () => void
}>) {
    return (

        <div className="mx-auto flex max-w-3xl items-center justify-center h-full">
            <div className="w-full rounded-4xl border border-white/10 bg-slate-950/55 p-8 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
                <div className="text-xs uppercase tracking-[0.32em] text-sky-200/80">
                    Live Session
                </div>

                <h1 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
                    Joining Match
                </h1>

                <div className="mt-4 break-all text-lg font-bold text-sky-100 sm:text-2xl">
                    {sessionId}
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
                    {isConnected
                        ? `Waiting for the server to confirm this session. If it is still active, you will enter it automatically.`
                        : `Reconnecting to the server so this session can be restored.`}
                </p>

                <button
                    onClick={onBack}
                    className="mt-8 rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                >
                    Back To Lobby
                </button>
            </div>
        </div>
    );
}

function SessionUnavailableScreen({
    sessionId,
    title,
    message,
    primaryActionLabel,
    onPrimaryAction,
    onBack,
}: Readonly<{
    sessionId: string
    title: string
    message: string
    primaryActionLabel: string
    onPrimaryAction: () => void
    onBack: () => void
}>) {
    return (
        <div className="mx-auto flex max-w-3xl items-center justify-center h-full">
            <div className="w-full rounded-4xl border border-white/10 bg-slate-950/55 p-8 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
                <div className="text-xs uppercase tracking-[0.32em] text-amber-200/80">
                    Live Session
                </div>

                <h1 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
                    {title}
                </h1>

                <div className="mt-4 break-all text-lg font-bold text-amber-100 sm:text-2xl">
                    {sessionId}
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
                    {message}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                        onClick={onPrimaryAction}
                        className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900 transition hover:-translate-y-0.5 hover:bg-amber-200"
                    >
                        {primaryActionLabel}
                    </button>

                    <button
                        onClick={onBack}
                        className="rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                    >
                        Back To Lobby
                    </button>
                </div>
            </div>
        </div>
    );
}

function ConfirmLeaveSessionModal({ onStay, onLeave }: Readonly<{
    onStay: () => void
    onLeave: () => void
}>) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="leave-session-title"
                className="w-full max-w-xl rounded-4xl border border-rose-300/20 bg-slate-950/95 p-8 text-white shadow-[0_30px_120px_rgba(15,23,42,0.55)] sm:p-10"
            >
                <div className="inline-flex rounded-full border border-rose-300/35 bg-rose-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-100">
                    Match In Progress
                </div>

                <h2 id="leave-session-title" className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
                    Leave This Match?
                </h2>

                <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
                    Leaving right now will surrender the match immediately. Stay if you want to keep playing.
                </p>

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        onClick={onStay}
                        className="rounded-full cursor-pointer border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                    >
                        Stay In Match
                    </button>

                    <button
                        onClick={onLeave}
                        className="rounded-full cursor-pointer bg-rose-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-rose-400"
                    >
                        {`Surrender `}

                        <span className="hidden sm:inline">
                            And Leave
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}

const kEmptyGameState = createEmptyGameState();
function SessionRoute() {
    const { sessionId } = useParams<{ sessionId: string }>();

    const navigate = useNavigate();

    const shutdown = useQueryServerShutdown().data ?? null;
    const { data: account } = useQueryAccount({ enabled: true });
    const { data: accountPreferences } = useQueryAccountPreferences({ enabled: account?.user !== null });
    const sessionInfoQuery = useQuerySessionInfo(sessionId ?? null, { enabled: true });

    const blockSessionJoinRef = useRef<boolean>(false);
    const autoPlacedOpeningTileGameKeyRef = useRef<string | null>(null);
    const handledBlockedNavigationRef = useRef(false);

    const [isChatOpen, setIsChatOpen] = useState(false);

    const connection = useLiveGameStore(state => state.connection);
    const session = useLiveGameStore(state => state.session);
    const pendingSessionJoin = useLiveGameStore(state => state.pendingSessionJoin);
    const metadataSession = sessionInfoQuery.data ?? null;

    const autoPlaceOriginTile = accountPreferences?.preferences.autoPlaceOriginTile ?? false;
    const showTilePieceMarkers = accountPreferences?.preferences.tilePieceMarkers ?? false;
    const hideEloInHud = accountPreferences?.preferences.zenModeInGame ?? false;
    const shouldBlockLeave = session?.state.status === `in-game` && session.localParticipantRole === `player`;

    const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname);

    useEffect(() => {
        if (blocker.state !== `unblocked`) {
            return;
        }

        /* reset handled flag */
        handledBlockedNavigationRef.current = false;
    }, [blocker.state]);

    useBeforeUnload((event) => {
        if (!shouldBlockLeave) {
            return;
        }

        event.preventDefault();
        event.returnValue = ``;
    });

    /* handle the blocker in case we don't want to block */
    useEffect(() => {
        if (blocker.state !== `blocked` || shouldBlockLeave) {
            return;
        }

        if (handledBlockedNavigationRef.current) {
            return;
        }

        leaveSession();

        blockSessionJoinRef.current = true;
        handledBlockedNavigationRef.current = true;
        if (blocker.state === `blocked`) {
            blocker.proceed();
        }
    }, [
        blocker, blocker.state, shouldBlockLeave,
    ]);

    /* reset auto join when session id changed */
    useEffect(() => {
        blockSessionJoinRef.current = false;
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId || !session) {
            return;
        }

        if (session.id === sessionId) {
            return;
        }

        /* Session routing path miss match. Navigate where we should belong to */
        blockSessionJoinRef.current = true;
        void navigate(buildSessionPath(sessionId));
    }, [sessionId, session]);

    useEffect(() => {
        if (!sessionId || !connection.isInitialized || !!session) {
            return;
        }

        if (blockSessionJoinRef.current) {
            return;
        }

        joinSession(sessionId);
    }, [
        connection.isInitialized, !!session, sessionId,
    ]);

    useEffect(() => {
        if (!session?.gameState) {
            return;
        }

        if (session.state.status !== `in-game` || session.localParticipantRole !== `player`) {
            return;
        }

        if (session.gameState.currentTurnPlayerId !== session.localParticipantId) {
            return;
        }

        if (session.gameState.cells.length > 0) {
            return;
        }

        if (!autoPlaceOriginTile) {
            return;
        }

        const gameKey = `${session.state.gameId}:${session.localParticipantId}`;
        if (autoPlacedOpeningTileGameKeyRef.current === gameKey) {
            return;
        }

        autoPlacedOpeningTileGameKeyRef.current = gameKey;
        placeCell(0, 0);
    }, [
        autoPlaceOriginTile, session?.state.status, session?.gameState?.cells.length ?? 0 > 0, session?.localParticipantId,
    ]);

    if (!sessionId) {
        return (
            <Navigate to="/" replace />
        );
    }

    const retryJoinSession = () => { joinSession(sessionId); };

    const leaveSessionAndNavigate = () => {
        blockSessionJoinRef.current = true;

        leaveSession();
        void navigate(`/`);
    };

    const handleFinishedGameReviewClick = (
        event: MouseEvent<HTMLAnchorElement>,
        finishedGameId: string,
    ) => {
        if (!isPlainLeftClick(event)) {
            return;
        }

        event.preventDefault();

        blockSessionJoinRef.current = true;

        leaveSession();
        void navigate(buildFinishedGamePath(finishedGameId));
    };

    const inviteFriend = async () => {
        const inviteUrl = new URL(`/`, window.location.origin);
        inviteUrl.searchParams.set(`join`, sessionId);

        try {
            if (navigator.share) {
                await navigator.share({
                    title: `Join my Infinity Hexagonal Tic-Tac-Toe lobby`,
                    text: `Join my lobby directly with this link.`,
                    url: inviteUrl.toString(),
                });
                showSuccessToast(`Invite link shared.`);
                return;
            }

            await navigator.clipboard.writeText(inviteUrl.toString());
            showSuccessToast(`Invite link copied to clipboard.`);
        } catch (error) {
            console.error(`Failed to share invite link:`, error);
            showErrorToast(`Failed to share invite link.`);
        }
    };

    let targetScreen: React.ReactNode = null;
    if (!connection.isInitialized) {
        targetScreen = (
            <SessionConnectingScreen
                sessionId={sessionId}
                isConnected={connection.isConnected}
                onBack={leaveSessionAndNavigate}
            />
        );
    } else if (session?.state.status === `lobby`) {
        const localPlayerName = session.players.find(player => player.id === session.localParticipantId)?.displayName ?? account?.user?.username ?? `unknown`;

        targetScreen = (
            <WaitingScreen
                sessionId={session.id}
                gameOptions={session.gameOptions}

                playerCount={session.players.length}
                localPlayerName={localPlayerName}


                onInviteFriend={() => void inviteFriend()}
                onCancel={leaveSessionAndNavigate}
            />
        );
    } else if (session?.state.status === `in-game` && !session.gameState) {
        /* show the connecting game screen until we got the game state */
        targetScreen = (
            <SessionConnectingScreen
                sessionId={sessionId}
                isConnected={connection.isConnected}
                onBack={leaveSessionAndNavigate}
            />
        );
    } else if (session) {
        let screenOverlay: React.ReactNode;
        if (session.state.status !== `finished`) {
            /* do not display an overlay */
            screenOverlay = null;
        } else if (session.localParticipantRole === `spectator`) {
            const gameId = session.state.gameId;
            screenOverlay = (
                <GameOverlayFinishedSpectator
                    state={session.state}
                    players={session.players}

                    onReviewGame={(event) => handleFinishedGameReviewClick(event, gameId)}
                    onReturnToLobby={leaveSessionAndNavigate}
                />
            );
        } else {
            const gameId = session.state.gameId;
            screenOverlay = (
                <GameOverlayFinishedPlayer
                    state={session.state}
                    players={session.players}
                    localPlayerId={session.localParticipantId}

                    onReviewGame={(event) => handleFinishedGameReviewClick(event, gameId)}
                    onReturnToLobby={leaveSessionAndNavigate}
                    onRequestRematch={requestRematch}
                />
            );
        }

        /*
         * Game state can be null if not yet received and game has finished. 
         * Opting in to show the finish overlay already with an empty game in the background 
         */
        const gameState = session.gameState ?? kEmptyGameState;

        targetScreen = (
            <GameScreen
                sessionId={session.id}

                players={session.players}
                currentPlayerId={session.localParticipantId}
                participantRole={session.localParticipantRole}

                gameId={session.state.gameId}
                gameOptions={session.gameOptions}
                gameState={gameState}

                shutdown={shutdown}
                showConnectionUnstableBadge={connection.isUnstable}

                chat={session.chat}
                isChatOpen={isChatOpen}
                onChatOpenChange={setIsChatOpen}

                interactionEnabled={session.state.status === `in-game`}
                showTilePieceMarkers={showTilePieceMarkers}
                hideEloInHud={hideEloInHud}

                onPlaceCell={placeCell}
                onSendChatMessage={session.localParticipantRole === `player` ? sendSessionChatMessage : undefined}

                leaveLabel={session.localParticipantRole === `player` ? `Surrender` : `Leave Game`}
                onLeave={session.localParticipantRole === `player` && session.state.status === `in-game` ? surrenderGame : leaveSessionAndNavigate}

                overlay={screenOverlay}
            />
        );
    } else if (pendingSessionJoin.status === `failed`) {
        targetScreen = (
            <SessionUnavailableScreen
                sessionId={sessionId}
                title="Session Unavailable"
                message={pendingSessionJoin.errorMessage ?? `The session could not be opened right now. You can retry or return to the lobby.`}
                primaryActionLabel="Retry"
                onPrimaryAction={retryJoinSession}
                onBack={leaveSessionAndNavigate}
            />
        );
    } else if (pendingSessionJoin.status === `not-found`) {
        targetScreen = (
            <SessionUnavailableScreen
                sessionId={sessionId}
                title="Session Not Found"
                message="This live session does not exist anymore. It may have finished already, been closed, or the link may be incorrect."
                primaryActionLabel="Try Again"
                onPrimaryAction={retryJoinSession}
                onBack={leaveSessionAndNavigate}
            />
        );
    } else {
        /* fallback */
        targetScreen = (
            <SessionConnectingScreen
                sessionId={sessionId}
                isConnected={connection.isConnected}
                onBack={leaveSessionAndNavigate}
            />
        );
    }

    let leaveConfirmModal = null;
    if (blocker.state === `blocked` && shouldBlockLeave) {
        leaveConfirmModal = (
            <ConfirmLeaveSessionModal
                onStay={() => blocker.reset()}
                onLeave={() => {
                    if (handledBlockedNavigationRef.current || blocker.state !== `blocked`) {
                        /* already handled */
                        return;
                    }


                    blockSessionJoinRef.current = true;
                    handledBlockedNavigationRef.current = true;
                    leaveSession();

                    if (blocker.state === `blocked`) {
                        blocker.proceed();
                    }
                }}
            />
        );
    }

    return (
        <React.Fragment>
            <PageMetadata
                {...(metadataSession
                    ? describeSessionInvite(metadataSession)
                    : !sessionInfoQuery.isLoading
                        ? {
                            title: `Invite Expired • ${DEFAULT_PAGE_TITLE}`,
                            description: `This live session is no longer active. Open the lobby to host or join another match.`,
                            robots: `noindex, nofollow` as const,
                        }
                        : {
                            title: `Live Session • ${DEFAULT_PAGE_TITLE}`,
                            description: `Join or spectate a live Infinity Hexagonal Tic-Tac-Toe session.`,
                            robots: `noindex, nofollow` as const,
                        })}
            />

            {targetScreen}
            {leaveConfirmModal}
        </React.Fragment>
    );
}

export default SessionRoute;
