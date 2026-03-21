import type { MouseEvent } from 'react'
import { useEffect, useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { toast } from 'react-toastify'
import type { PlayerNames, SessionParticipant, SessionParticipantRole } from '@ih3t/shared'
import GameScreen from '../components/GameScreen'
import LoserScreen from '../components/LoserScreen'
import SpectatorFinishedScreen from '../components/SpectatorFinishedScreen'
import WaitingScreen from '../components/WaitingScreen'
import WinnerScreen from '../components/WinnerScreen'
import {
  joinGame,
  leaveGame,
  placeCell,
  requestRematch,
  returnToLobby,
  surrenderGame
} from '../liveGameClient'
import { useLiveGameStore } from '../liveGameStore'
import { buildFinishedGamePath } from './archiveRouteState'

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.altKey
    && !event.ctrlKey
    && !event.shiftKey
}

function showErrorToast(message: string) {
  toast.error(message, {
    toastId: `error:${message}`
  })
}

function showSuccessToast(message: string) {
  toast.success(message, {
    toastId: `success:${message}`
  })
}

function getPlayerIds(players: SessionParticipant[]) {
  return players.map(player => player.id)
}

function getPlayerNames(players: SessionParticipant[]): PlayerNames {
  return Object.fromEntries(players.map(player => [player.id, player.displayName]))
}

function getParticipantRole(players: SessionParticipant[], currentPlayerId: string): SessionParticipantRole {
  return players.some(player => player.id === currentPlayerId) ? 'player' : 'spectator'
}

function SessionConnectingScreen({ sessionId, isConnected, onBack }: Readonly<{
  sessionId: string
  isConnected: boolean
  onBack: () => void
}>) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(135deg,_#111827,_#0f172a_45%,_#1e293b)] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center justify-center sm:min-h-[calc(100vh-5rem)]">
        <div className="w-full rounded-[2rem] border border-white/10 bg-slate-950/55 p-8 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
          <div className="text-xs uppercase tracking-[0.32em] text-sky-200/80">Live Session</div>
          <h1 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">Joining Match</h1>
          <div className="mt-4 break-all text-lg font-bold text-sky-100 sm:text-2xl">{sessionId}</div>
          <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
            {isConnected
              ? 'Waiting for the server to confirm this session. If it is still active, you will enter it automatically.'
              : 'Reconnecting to the server so this session can be restored.'}
          </p>
          <button
            onClick={onBack}
            className="mt-8 rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
          >
            Back To Lobby
          </button>
        </div>
      </div>
    </div>
  )
}

function SessionUnavailableScreen({
  sessionId,
  title,
  message,
  primaryActionLabel,
  onPrimaryAction,
  onBack
}: Readonly<{
  sessionId: string
  title: string
  message: string
  primaryActionLabel: string
  onPrimaryAction: () => void
  onBack: () => void
}>) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(135deg,_#111827,_#0f172a_45%,_#1e293b)] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center justify-center sm:min-h-[calc(100vh-5rem)]">
        <div className="w-full rounded-[2rem] border border-white/10 bg-slate-950/55 p-8 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
          <div className="text-xs uppercase tracking-[0.32em] text-amber-200/80">Live Session</div>
          <h1 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">{title}</h1>
          <div className="mt-4 break-all text-lg font-bold text-amber-100 sm:text-2xl">{sessionId}</div>
          <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">{message}</p>
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
    </div>
  )
}

function SessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const attemptedSessionIdRef = useRef<string | null>(null)
  const connection = useLiveGameStore(state => state.connection)
  const pendingSessionJoin = useLiveGameStore(state => state.pendingSessionJoin)
  const shutdown = useLiveGameStore(state => state.shutdown)
  const liveScreen = useLiveGameStore(state => state.screen)

  useEffect(() => {
    attemptedSessionIdRef.current = null
  }, [sessionId])

  useEffect(() => {
    if (connection.isConnected) {
      return
    }

    attemptedSessionIdRef.current = null
  }, [connection.isConnected])

  useEffect(() => {
    if (!sessionId) {
      return
    }

    if (liveScreen.kind === 'none') {
      return
    }

    if (liveScreen.sessionId === sessionId) {
      return
    }

    attemptedSessionIdRef.current = null
    returnToLobby()
  }, [liveScreen, sessionId])

  useEffect(() => {
    if (!sessionId || !connection.isInitialized || liveScreen.kind !== 'none') {
      return
    }

    if (attemptedSessionIdRef.current === sessionId) {
      return
    }

    attemptedSessionIdRef.current = sessionId
    joinGame(sessionId)
  }, [connection.isInitialized, liveScreen.kind, sessionId])

  if (!sessionId) {
    return <Navigate to="/" replace />
  }

  if (liveScreen.kind !== 'none' && liveScreen.sessionId !== sessionId) {
    return (
      <SessionConnectingScreen
        sessionId={sessionId}
        isConnected={connection.isConnected}
        onBack={() => {
          returnToLobby()
          void navigate('/')
        }}
      />
    )
  }

  const leaveSessionToLobby = () => {
    leaveGame()
    void navigate('/')
  }

  const retryJoinSession = () => {
    attemptedSessionIdRef.current = null
    joinGame(sessionId)
  }

  const returnToLobbyAndNavigate = () => {
    returnToLobby()
    void navigate('/')
  }

  const handleFinishedGameReviewClick = (
    event: MouseEvent<HTMLAnchorElement>,
    finishedGameId: string
  ) => {
    if (!isPlainLeftClick(event)) {
      return
    }

    event.preventDefault()
    returnToLobby()
    void navigate(buildFinishedGamePath(finishedGameId, 1, Date.now()))
  }

  const inviteFriend = async () => {
    const inviteUrl = new URL('/', window.location.origin)
    inviteUrl.searchParams.set('join', sessionId)

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join my Infinity Hexagonal Tic-Tac-Toe lobby',
          text: 'Join my lobby directly with this link.',
          url: inviteUrl.toString()
        })
        showSuccessToast('Invite link shared.')
        return
      }

      await navigator.clipboard.writeText(inviteUrl.toString())
      showSuccessToast('Invite link copied to clipboard.')
    } catch (error) {
      console.error('Failed to share invite link:', error)
      showErrorToast('Failed to share invite link.')
    }
  }

  const isPendingJoinForRoute = pendingSessionJoin.sessionId === sessionId
  if (liveScreen.kind === 'none' && isPendingJoinForRoute && pendingSessionJoin.status === 'not-found') {
    return (
      <SessionUnavailableScreen
        sessionId={sessionId}
        title="Session Not Found"
        message="This live session does not exist anymore. It may have finished already, been closed, or the link may be incorrect."
        primaryActionLabel="Try Again"
        onPrimaryAction={retryJoinSession}
        onBack={returnToLobbyAndNavigate}
      />
    )
  }

  if (liveScreen.kind === 'none' && isPendingJoinForRoute && pendingSessionJoin.status === 'failed') {
    return (
      <SessionUnavailableScreen
        sessionId={sessionId}
        title="Session Unavailable"
        message={pendingSessionJoin.errorMessage ?? 'The session could not be opened right now. You can retry or return to the lobby.'}
        primaryActionLabel="Retry"
        onPrimaryAction={retryJoinSession}
        onBack={returnToLobbyAndNavigate}
      />
    )
  }

  if (liveScreen.kind === 'none') {
    return (
      <SessionConnectingScreen
        sessionId={sessionId}
        isConnected={connection.isConnected}
        onBack={returnToLobbyAndNavigate}
      />
    )
  }

  if (liveScreen.kind === 'session' && liveScreen.session.state === 'lobby') {
    const playerIds = getPlayerIds(liveScreen.session.players)
    const playerNames = getPlayerNames(liveScreen.session.players)
    return (
      <WaitingScreen
        sessionId={liveScreen.sessionId}
        playerCount={playerIds.length}
        playerNames={playerNames}
        lobbyOptions={liveScreen.session.gameOptions}
        onInviteFriend={() => void inviteFriend()}
        onCancel={leaveSessionToLobby}
      />
    )
  }

  if (liveScreen.kind === 'session' && liveScreen.session.state === 'in-game') {
    const game = liveScreen.game
    if (!game) {
      return (
        <SessionConnectingScreen
          sessionId={sessionId}
          isConnected={connection.isConnected}
          onBack={returnToLobbyAndNavigate}
        />
      )
    }

    const participantRole = getParticipantRole(liveScreen.session.players, connection.currentPlayerId)
    return (
      <GameScreen
        sessionId={liveScreen.sessionId}
        gameId={game.gameId}
        players={liveScreen.session.players}
        gameOptions={liveScreen.session.gameOptions}
        participantRole={participantRole}
        currentPlayerId={connection.currentPlayerId}
        gameState={game.gameState}
        shutdown={shutdown}
        onPlaceCell={placeCell}
        onLeave={participantRole === 'player' ? surrenderGame : leaveSessionToLobby}
        leaveLabel={participantRole === 'player' ? 'Surrender' : 'Leave Game'}
      />
    )
  }

  if (liveScreen.kind === 'session' && liveScreen.session.state === 'finished') {
    const game = liveScreen.game
    if (!game) {
      return (
        <SessionConnectingScreen
          sessionId={sessionId}
          isConnected={connection.isConnected}
          onBack={returnToLobbyAndNavigate}
        />
      )
    }

    const participantRole = getParticipantRole(liveScreen.session.players, connection.currentPlayerId)
    const finishedGameId = liveScreen.session.gameId
    const reviewGameHref = finishedGameId ? buildFinishedGamePath(finishedGameId, 1, Date.now()) : undefined

    if (participantRole === 'player') {
      const result = liveScreen.session.winningPlayerId === connection.currentPlayerId ? 'winner' : 'loser'
      return (
        <GameScreen
          sessionId={liveScreen.sessionId}
          gameId={game.gameId}
          players={liveScreen.session.players}
          gameOptions={liveScreen.session.gameOptions}
          participantRole={participantRole}
          currentPlayerId={connection.currentPlayerId}
          gameState={game.gameState}
          shutdown={shutdown}
          onPlaceCell={() => { }}
          onLeave={leaveSessionToLobby}
          interactionEnabled={false}
          overlay={result === 'winner'
            ? (
              <WinnerScreen
                session={liveScreen.session}
                currentPlayerId={connection.currentPlayerId}
                onReturnToLobby={returnToLobbyAndNavigate}
                reviewGameHref={reviewGameHref}
                onReviewGame={finishedGameId ? (event) => handleFinishedGameReviewClick(event, finishedGameId) : undefined}
                onRequestRematch={requestRematch}
              />
            )
            : (
              <LoserScreen
                session={liveScreen.session}
                currentPlayerId={connection.currentPlayerId}
                onReturnToLobby={returnToLobbyAndNavigate}
                reviewGameHref={reviewGameHref}
                onReviewGame={finishedGameId ? (event) => handleFinishedGameReviewClick(event, finishedGameId) : undefined}
                onRequestRematch={requestRematch}
              />
            )}
        />
      )
    }

    return (
      <GameScreen
        sessionId={liveScreen.sessionId}
        gameId={game.gameId}
        players={liveScreen.session.players}
        gameOptions={liveScreen.session.gameOptions}
        participantRole={participantRole}
        currentPlayerId={connection.currentPlayerId}
        gameState={game.gameState}
        shutdown={shutdown}
        onPlaceCell={() => { }}
        onLeave={leaveSessionToLobby}
        interactionEnabled={false}
        overlay={(
          <SpectatorFinishedScreen
            reason={liveScreen.session.finishReason}
            onReturnToLobby={returnToLobbyAndNavigate}
            reviewGameHref={reviewGameHref}
            onReviewGame={finishedGameId ? (event) => handleFinishedGameReviewClick(event, finishedGameId) : undefined}
          />
        )}
      />
    )
  }

  return (
    <SessionConnectingScreen
      sessionId={sessionId}
      isConnected={connection.isConnected}
      onBack={returnToLobbyAndNavigate}
    />
  )
}

export default SessionRoute
