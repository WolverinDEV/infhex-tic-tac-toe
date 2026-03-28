import type { GameState, LobbyOptions, SessionChat, SessionParticipant, SessionParticipantRole, ShutdownState } from '@ih3t/shared';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import { playTilePlacedSound } from '../soundEffects';
import { getPlayerTileColor } from '../utils/gameBoard';
import GameBoardCanvas from './game-screen/GameBoardCanvas';
import GameChatBox from './game-screen/GameChatBox';
import GameScreenHud, { HudPlayerInfo } from './game-screen/GameScreenHud';
import ShutdownTimer from './game-screen/ShutdownTimer';
import TurnTimerHud from './game-screen/TurnTimerHud';
import useGameBoard from './game-screen/useGameBoard';

type GameScreenProps = {
    sessionId: string
    gameId: string
    players: SessionParticipant[]
    gameOptions: LobbyOptions
    participantRole: SessionParticipantRole
    currentPlayerId: string
    gameState: GameState
    shutdown: ShutdownState | null
    showConnectionUnstableBadge?: boolean
    onPlaceCell: (x: number, y: number) => void
    onLeave: () => void
    leaveLabel?: string
    overlay?: ReactNode
    interactionEnabled?: boolean
    showTilePieceMarkers?: boolean
    hideEloInHud?: boolean

    chat: SessionChat
    isChatOpen: boolean
    onChatOpenChange: (isOpen: boolean) => void
    onSendChatMessage?: (message: string) => void
};

function GameScreen({
    sessionId,
    gameId,
    players,
    gameOptions,
    participantRole,
    currentPlayerId,
    gameState,
    shutdown,
    showConnectionUnstableBadge = false,
    onPlaceCell,
    onLeave,
    leaveLabel,
    overlay,
    interactionEnabled = true,
    showTilePieceMarkers = false,
    hideEloInHud = false,

    chat,
    isChatOpen,
    onChatOpenChange,
    onSendChatMessage,
}: Readonly<GameScreenProps>) {
    const previousCellCountRef = useRef(gameState.cells.length);
    const isSpectator = participantRole === `spectator`;
    const isOwnTurn = Boolean(currentPlayerId) && gameState.currentTurnPlayerId === currentPlayerId;
    const canPlaceCell = interactionEnabled && !isSpectator && isOwnTurn;

    const hudPlayerInfo = useMemo(() => {
        return players.map<HudPlayerInfo>(player => ({
            playerId: player.id,
            profileId: player.profileId,
            isBot: player.isBot ?? false,

            displayName: player.displayName,
            displayColor: getPlayerTileColor(gameState.playerTiles, player.id),

            rankingEloScore: player.rating.eloScore,

            isConnected: player.connection.status === `connected`,
        }));
    }, [gameState.playerTiles, players]);

    useEffect(() => {
        previousCellCountRef.current = gameState.cells.length;
    }, [
        currentPlayerId, participantRole, gameId,
    ]);

    const {
        canvasRef,
        canvasClassName,
        canvasHandlers,
        renderableCellCount,
        resetView,
    } = useGameBoard({
        gameState: gameState,
        highlightedCells: gameState.winner?.cells ?? `turn`,
        localPlayerId: isSpectator ? null : currentPlayerId,
        interactionEnabled,
        showTilePieceMarkers,
        onPlaceCell: canPlaceCell ? onPlaceCell : undefined,
    });

    useEffect(() => {
        const previousCellCount = previousCellCountRef.current;
        if (interactionEnabled && gameState.cells.length > previousCellCount) {
            playTilePlacedSound();
        }

        previousCellCountRef.current = gameState.cells.length;
    }, [gameState.cells.length, interactionEnabled]);

    const rankingAdjustment = players.find(player => player.id === currentPlayerId)?.ratingAdjustment ?? null;
    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-950 text-white">
            <GameBoardCanvas
                canvasRef={canvasRef}
                className={canvasClassName}
                handlers={canvasHandlers}
            />

            <div className="pointer-events-none absolute inset-0">
                <div className="flex h-full flex-col justify-between gap-4">
                    {interactionEnabled && (
                        <TurnTimerHud
                            gameOptions={gameOptions}
                            players={players}
                            gameState={gameState}
                            localPlayerId={isSpectator ? null : currentPlayerId}
                        />
                    )}
                </div>
            </div>

            {overlay && (
                <div className="absolute inset-0">
                    {overlay}
                </div>
            )}

            {shutdown && (
                <div className="absolute bottom-3 left-3 rounded-full border border-amber-300/40 bg-amber-200/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-lg">
                    {`Server Restart in `}
                    <ShutdownTimer shutdown={shutdown} />
                </div>
            )}

            <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
                <GameChatBox
                    currentParticipantId={currentPlayerId}
                    chat={chat}
                    isOpen={isChatOpen}
                    onOpenChange={onChatOpenChange}
                    onSendMessage={onSendChatMessage}
                />

                {interactionEnabled && (
                    <GameScreenHud
                        sessionId={sessionId}
                        gameOptions={gameOptions}
                        hideEloInHud={hideEloInHud}

                        players={hudPlayerInfo}
                        localPlayerId={currentPlayerId}
                        rankingAdjustment={rankingAdjustment}

                        occupiedCellCount={gameState.cells.length}
                        renderableCellCount={renderableCellCount}

                        shutdown={shutdown}
                        showConnectionUnstableBadge={showConnectionUnstableBadge}

                        leaveLabel={leaveLabel}
                        onLeave={onLeave}
                        onResetView={resetView}
                    />
                )}
            </div>
        </div >
    );
}

export default GameScreen;
