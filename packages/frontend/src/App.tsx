import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { CreateSessionRequest } from '@ih3t/shared'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import FinishedGameReviewScreen from './components/FinishedGameReviewScreen'
import FinishedGamesScreen from './components/FinishedGamesScreen'
import GameScreen from './components/GameScreen'
import LobbyScreen from './components/LobbyScreen'
import WaitingScreen from './components/WaitingScreen'
import LoserScreen from './components/LoserScreen'
import SpectatorFinishedScreen from './components/SpectatorFinishedScreen'
import WinnerScreen from './components/WinnerScreen'
import {
  hostGame,
  joinGame,
  leaveGame,
  placeCell,
  requestRematch,
  returnToLobby,
  startLiveGameClient,
  stopLiveGameClient
} from './liveGameClient'
import { useLiveGameStore } from './liveGameStore'
import {
  useQueryAccount,
  useQueryAvailableSessions,
  useQueryFinishedGame,
  useQueryFinishedGames
} from './queryHooks'
import { playMatchStartSound } from './soundEffects'

type AppRoute =
  | { page: 'live' }
  | { page: 'finished-games'; archivePage: number; archiveBaseTimestamp: number }
  | { page: 'finished-game'; gameId: string; archivePage: number; archiveBaseTimestamp: number }

function parseArchivePage(params: URLSearchParams) {
  const pageValue = params.get('page')
  const page = Number.parseInt(pageValue ?? '', 10)

  if (!Number.isFinite(page) || page < 1) {
    return 1
  }

  return page
}

function parseRoute(pathname: string, search: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(search)
  const archivePage = parseArchivePage(params)
  const archiveBaseTimestamp = Number.parseInt(params.get('at') ?? '', 10)
  const normalizedArchiveBaseTimestamp = Number.isFinite(archiveBaseTimestamp) && archiveBaseTimestamp > 0
    ? archiveBaseTimestamp
    : Date.now()

  if (normalizedPath === '/games') {
    return { page: 'finished-games', archivePage, archiveBaseTimestamp: normalizedArchiveBaseTimestamp }
  }

  const gameMatch = normalizedPath.match(/^\/games\/([^/]+)$/)
  if (gameMatch) {
    return {
      page: 'finished-game',
      gameId: decodeURIComponent(gameMatch[1]),
      archivePage,
      archiveBaseTimestamp: normalizedArchiveBaseTimestamp
    }
  }

  return { page: 'live' }
}

function buildRoutePath(route: AppRoute) {
  if (route.page === 'finished-games') {
    const params = new URLSearchParams()
    params.set('at', String(route.archiveBaseTimestamp))

    if (route.archivePage > 1) {
      params.set('page', String(route.archivePage))
    }

    const suffix = params.toString()
    return suffix.length > 0 ? `/games?${suffix}` : '/games'
  }

  if (route.page === 'finished-game') {
    const params = new URLSearchParams()
    params.set('at', String(route.archiveBaseTimestamp))

    if (route.archivePage > 1) {
      params.set('page', String(route.archivePage))
    }

    const suffix = params.toString()
    return suffix.length > 0
      ? `/games/${encodeURIComponent(route.gameId)}?${suffix}`
      : `/games/${encodeURIComponent(route.gameId)}`
  }

  return '/'
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.altKey
    && !event.ctrlKey
    && !event.shiftKey
}

function createFinishedGameReviewRoute(gameId: string): AppRoute {
  return {
    page: 'finished-game',
    gameId,
    archivePage: 1,
    archiveBaseTimestamp: Date.now()
  }
}

function removeInviteParamFromUrl() {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.delete('join')
  const nextSearch = nextUrl.searchParams.toString()
  const nextPath = `${nextUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}`
  window.history.replaceState({}, '', nextPath)
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname, window.location.search))
  const [pendingInviteSessionId, setPendingInviteSessionId] = useState(
    () => new URLSearchParams(window.location.search).get('join')
  )
  const connection = useLiveGameStore(state => state.connection)
  const shutdown = useLiveGameStore(state => state.shutdown)
  const liveScreen = useLiveGameStore(state => state.screen)
  const previousLiveScreenKindRef = useRef(liveScreen.kind)
  const previousIdentityKeyRef = useRef<string | null>(null)
  const attemptedInviteSessionIdRef = useRef<string | null>(null)
  const accountQuery = useQueryAccount()
  const account = accountQuery.data?.user ?? null
  const activeIdentityKey = account
    ? `account:${account.id}:${account.username}`
    : 'guest'
  const availableSessionsQuery = useQueryAvailableSessions({ enabled: route.page === 'live' })
  const archivePage = route.page === 'live' ? 1 : route.archivePage
  const archiveBaseTimestamp = route.page === 'live' ? Date.now() : route.archiveBaseTimestamp
  const finishedGamesQuery = useQueryFinishedGames(archivePage, archiveBaseTimestamp, { enabled: route.page === 'finished-games' })
  const selectedFinishedGameId = route.page === 'finished-game' ? route.gameId : null
  const finishedGameQuery = useQueryFinishedGame(selectedFinishedGameId, { enabled: route.page === 'finished-game' })

  const navigateTo = (nextRoute: AppRoute) => {
    const nextPath = buildRoutePath(nextRoute)
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }

    const nextUrl = new URL(nextPath, window.location.origin)
    const nextInviteSessionId = nextUrl.searchParams.get('join')
    setPendingInviteSessionId(nextInviteSessionId)
    if (!nextInviteSessionId) {
      attemptedInviteSessionIdRef.current = null
    }

    setRoute(nextRoute)
  }

  const showErrorToast = (message: string) => {
    toast.error(message, {
      toastId: `error:${message}`
    })
  }

  const showSuccessToast = (message: string) => {
    toast.success(message, {
      toastId: `success:${message}`
    })
  }

  const inviteFriend = async (sessionId: string) => {
    const inviteUrl = new URL(window.location.href)
    inviteUrl.search = ''
    inviteUrl.searchParams.set('join', sessionId)

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join my Infinity Hexagonial Tic-Tac-Toe lobby',
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

  const createLobby = (request: CreateSessionRequest) => {
    void hostGame(request)
  }

  const joinLiveGame = (sessionId: string) => {
    joinGame(sessionId)
  }

  const navigateToLiveLobby = () => {
    returnToLobby()
    navigateTo({ page: 'live' })
  }

  const handleFinishedGameReviewClick = (event: MouseEvent<HTMLAnchorElement>, route: AppRoute) => {
    if (!isPlainLeftClick(event)) {
      return
    }

    event.preventDefault()
    returnToLobby()
    navigateTo(route)
  }

  useEffect(() => {
    previousIdentityKeyRef.current = activeIdentityKey
    startLiveGameClient()

    return () => {
      stopLiveGameClient()
    }
  }, [])

  useEffect(() => {
    if (previousIdentityKeyRef.current === activeIdentityKey) {
      return
    }

    previousIdentityKeyRef.current = activeIdentityKey
    stopLiveGameClient()
    startLiveGameClient()
  }, [activeIdentityKey])

  useEffect(() => {
    const previousKind = previousLiveScreenKindRef.current
    if (previousKind === 'waiting' && liveScreen.kind === 'playing' && liveScreen.participantRole === 'player') {
      playMatchStartSound()
    }

    previousLiveScreenKindRef.current = liveScreen.kind
  }, [liveScreen.kind])

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname, window.location.search))
      setPendingInviteSessionId(new URLSearchParams(window.location.search).get('join'))
      attemptedInviteSessionIdRef.current = null
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!pendingInviteSessionId || !connection.isConnected || liveScreen.kind !== 'lobby') {
      return
    }

    if (attemptedInviteSessionIdRef.current === pendingInviteSessionId) {
      return
    }

    attemptedInviteSessionIdRef.current = pendingInviteSessionId
    joinGame(pendingInviteSessionId)
  }, [connection.isConnected, liveScreen.kind, pendingInviteSessionId])

  useEffect(() => {
    if (!pendingInviteSessionId) {
      attemptedInviteSessionIdRef.current = null
      return
    }

    const activeSessionId = liveScreen.kind === 'lobby' ? null : liveScreen.sessionId
    if (activeSessionId !== pendingInviteSessionId) {
      return
    }

    removeInviteParamFromUrl()
    setPendingInviteSessionId(null)
    attemptedInviteSessionIdRef.current = null
  }, [liveScreen, pendingInviteSessionId])

  useEffect(() => {
    if (route.page !== 'finished-games' || !finishedGamesQuery.data) {
      return
    }

    if (route.archivePage > finishedGamesQuery.data.pagination.totalPages) {
      navigateTo({
        page: 'finished-games',
        archivePage: finishedGamesQuery.data.pagination.totalPages,
        archiveBaseTimestamp: route.archiveBaseTimestamp
      })
    }
  }, [finishedGamesQuery.data, route])

  let screen = null

  if (route.page === 'finished-games') {
    screen = (
      <FinishedGamesScreen
        archive={finishedGamesQuery.data ?? null}
        isLoading={finishedGamesQuery.isLoading}
        errorMessage={finishedGamesQuery.error instanceof Error ? finishedGamesQuery.error.message : null}
        onBack={() => navigateTo({ page: 'live' })}
        onOpenGame={(gameId) => navigateTo({ page: 'finished-game', gameId, archivePage, archiveBaseTimestamp })}
        onChangePage={(nextArchivePage) =>
          navigateTo({ page: 'finished-games', archivePage: nextArchivePage, archiveBaseTimestamp })
        }
        onRefresh={() =>
          navigateTo({ page: 'finished-games', archivePage: 1, archiveBaseTimestamp: Date.now() })
        }
      />
    )
  } else if (route.page === 'finished-game') {
    screen = (
      <FinishedGameReviewScreen
        game={finishedGameQuery.data ?? null}
        isLoading={finishedGameQuery.isLoading}
        errorMessage={finishedGameQuery.error instanceof Error ? finishedGameQuery.error.message : null}
        onBack={() => navigateTo({
          page: 'finished-games',
          archivePage: route.archivePage,
          archiveBaseTimestamp: route.archiveBaseTimestamp
        })}
        onRetry={() => void finishedGameQuery.refetch()}
      />
    )
  } else if (liveScreen.kind === 'lobby') {
    screen = (
      <LobbyScreen
        isConnected={connection.isConnected}
        shutdown={shutdown}
        liveSessions={availableSessionsQuery.data ?? []}
        onHostGame={createLobby}
        onJoinGame={joinLiveGame}
        onViewFinishedGames={() => navigateTo({ page: 'finished-games', archivePage: 1, archiveBaseTimestamp: Date.now() })}
      />
    )
  } else if (liveScreen.kind === 'waiting') {
    screen = (
      <WaitingScreen
        sessionId={liveScreen.sessionId}
        playerCount={liveScreen.players.length}
        playerNames={liveScreen.playerNames}
        lobbyOptions={liveScreen.lobbyOptions}
        onInviteFriend={() => inviteFriend(liveScreen.sessionId)}
        onCancel={leaveGame}
      />
    )
  } else if (liveScreen.kind === 'playing') {
    screen = (
      <GameScreen
        sessionId={liveScreen.sessionId}
        players={liveScreen.players}
        playerNames={liveScreen.playerNames}
        participantRole={liveScreen.participantRole}
        currentPlayerId={connection.currentPlayerId}
        boardState={liveScreen.boardState}
        timeControl={liveScreen.lobbyOptions.timeControl}
        shutdown={shutdown}
        onPlaceCell={placeCell}
        onLeave={leaveGame}
      />
    )
  } else if (liveScreen.kind === 'finished-player') {
    const finishedGameId = liveScreen.finishedGameId
    const finishedGameReviewRoute = finishedGameId ? createFinishedGameReviewRoute(finishedGameId) : null
    const isRematchRequestedByCurrentPlayer = liveScreen.rematch.requestedPlayerIds.includes(connection.currentPlayerId)
    const isRematchRequestedByOpponent = liveScreen.rematch.requestedPlayerIds.some(
      playerId => playerId !== connection.currentPlayerId
    )

    screen = (
      <GameScreen
        sessionId={liveScreen.sessionId}
        players={liveScreen.players}
        playerNames={liveScreen.playerNames}
        participantRole={liveScreen.participantRole}
        currentPlayerId={connection.currentPlayerId}
        boardState={liveScreen.boardState}
        shutdown={shutdown}
        onPlaceCell={() => { }}
        onLeave={leaveGame}
        interactionEnabled={false}
        overlay={liveScreen.result === 'winner'
          ? (
            <WinnerScreen
              reason={liveScreen.finishReason}
              onReturnToLobby={navigateToLiveLobby}
              reviewGameHref={finishedGameReviewRoute ? buildRoutePath(finishedGameReviewRoute) : undefined}
              onReviewGame={finishedGameReviewRoute ? (event) => handleFinishedGameReviewClick(event, finishedGameReviewRoute) : undefined}
              onRequestRematch={liveScreen.rematch.showAction ? requestRematch : undefined}
              isRematchAvailable={liveScreen.rematch.canRematch}
              isRematchRequestedByCurrentPlayer={isRematchRequestedByCurrentPlayer}
              isRematchRequestedByOpponent={isRematchRequestedByOpponent}
            />
          )
          : (
            <LoserScreen
              reason={liveScreen.finishReason}
              onReturnToLobby={navigateToLiveLobby}
              reviewGameHref={finishedGameReviewRoute ? buildRoutePath(finishedGameReviewRoute) : undefined}
              onReviewGame={finishedGameReviewRoute ? (event) => handleFinishedGameReviewClick(event, finishedGameReviewRoute) : undefined}
              onRequestRematch={liveScreen.rematch.showAction ? requestRematch : undefined}
              isRematchAvailable={liveScreen.rematch.canRematch}
              isRematchRequestedByCurrentPlayer={isRematchRequestedByCurrentPlayer}
              isRematchRequestedByOpponent={isRematchRequestedByOpponent}
            />
          )}
      />
    )
  } else {
    const finishedGameId = liveScreen.finishedGameId
    const finishedGameReviewRoute = finishedGameId ? createFinishedGameReviewRoute(finishedGameId) : null
    screen = (
      <GameScreen
        sessionId={liveScreen.sessionId}
        players={liveScreen.players}
        playerNames={liveScreen.playerNames}
        participantRole={liveScreen.participantRole}
        currentPlayerId={connection.currentPlayerId}
        boardState={liveScreen.boardState}
        shutdown={shutdown}
        onPlaceCell={() => { }}
        onLeave={leaveGame}
        interactionEnabled={false}
        overlay={(
          <SpectatorFinishedScreen
            reason={liveScreen.finishReason}
            onReturnToLobby={navigateToLiveLobby}
            reviewGameHref={finishedGameReviewRoute ? buildRoutePath(finishedGameReviewRoute) : undefined}
            onReviewGame={finishedGameReviewRoute ? (event) => handleFinishedGameReviewClick(event, finishedGameReviewRoute) : undefined}
          />
        )}
      />
    )
  }

  return (
    <>
      {screen}
      <ToastContainer
        position="top-right"
        autoClose={4000}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme="dark"
      />
    </>
  )
}

export default App
