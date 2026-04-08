import type { GameState, LobbyOptions, SessionChat, SessionParticipantRole, SessionPlayer, ShutdownState } from '@ih3t/shared';
import type { SessionTournamentInfo } from '@ih3t/shared';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import { playTilePlacedSound } from '../soundEffects';
import { getPlayerTileColor } from '../utils/gameBoard';
import GameBoardView from './game-screen/GameBoardView';
import GameChatBox from './game-screen/GameChatBox';
import GameScreenHud, { HudPlayerInfo } from './game-screen/GameScreenHud';
import ShutdownTimer from './game-screen/ShutdownTimer';
import TurnTimerHud from './game-screen/TurnTimerHud';

type GameScreenProps = {
    sessionId: string
    gameId: string
    players: SessionPlayer[]
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
    tournament: SessionTournamentInfo | null

    drawRequest: string | null,
    drawRequestAvailableAfterTurn: number,
    onDrawRequest?: () => void
    onDrawAccept?: () => void
    onDrawDecline?: () => void

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
    tournament,

    drawRequest,
    drawRequestAvailableAfterTurn,
    onDrawRequest,
    onDrawAccept,
    onDrawDecline,

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

    useEffect(() => {
        const previousCellCount = previousCellCountRef.current;
        if (interactionEnabled && gameState.cells.length > previousCellCount) {
            playTilePlacedSound();
        }

        previousCellCountRef.current = gameState.cells.length;
    }, [gameState.cells.length, interactionEnabled]);

    const rankingAdjustment = players.find(player => player.id === currentPlayerId)?.ratingAdjustment ?? null;
    return (
        <GameBoardView
            className="relative w-full h-full overflow-hidden bg-slate-950 text-white"
            gameState={gameState}
            highlightedCells={gameState.winner?.cells ?? `turn`}
            localPlayerId={isSpectator ? null : currentPlayerId}
            interactionEnabled={interactionEnabled}
            showTilePieceMarkers={showTilePieceMarkers}
            onPlaceCell={canPlaceCell ? onPlaceCell : undefined}
        >
            {({ renderableCellCount, resetView }) => (
                <>
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
                                tournament={tournament}

                                players={hudPlayerInfo}
                                localPlayerId={currentPlayerId}
                                rankingAdjustment={rankingAdjustment}

                                occupiedCellCount={gameState.cells.length}
                                renderableCellCount={renderableCellCount}
                                turnCount={gameState.turnCount}
                                drawRequestByPlayerId={drawRequest}
                                drawRequestAvailableAfterTurn={drawRequestAvailableAfterTurn}

                                shutdown={shutdown}
                                showConnectionUnstableBadge={showConnectionUnstableBadge}

                                onRequestDraw={onDrawRequest}
                                onAcceptDraw={onDrawAccept}
                                onDeclineDraw={onDrawDecline}
                                leaveLabel={leaveLabel}
                                onLeave={onLeave}
                                onResetView={resetView}
                            />
                        )}
                    </div>
                </>
            )}
        </GameBoardView>
    );
}

export default GameScreen;
