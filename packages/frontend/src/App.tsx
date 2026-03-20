import { useEffect, useState } from 'react'
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
  returnToLobby
} from './liveGameClient'
import { useLiveGameStore } from './liveGameStore'
import {
  useQueryAvailableSessions,
  useQueryFinishedGame,
  useQueryFinishedGames
} from './queryHooks'

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

function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname, window.location.search))
  const connection = useLiveGameStore(state => state.connection)
  const shutdown = useLiveGameStore(state => state.shutdown)
  const liveScreen = useLiveGameStore(state => state.screen)
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

  const navigateToLiveLobby = () => {
    returnToLobby()
    navigateTo({ page: 'live' })
  }

  const openFinishedGameReview = (gameId: string) => {
    returnToLobby()
    navigateTo({ page: 'finished-game', gameId, archivePage: 1, archiveBaseTimestamp: Date.now() })
  }

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname, window.location.search))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

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
        onHostGame={hostGame}
        onJoinGame={joinGame}
        onViewFinishedGames={() => navigateTo({ page: 'finished-games', archivePage: 1, archiveBaseTimestamp: Date.now() })}
      />
    )
  } else if (liveScreen.kind === 'waiting') {
    screen = (
      <WaitingScreen
        sessionId={liveScreen.sessionId}
        playerCount={liveScreen.players.length}
        onInviteFriend={() => inviteFriend(liveScreen.sessionId)}
        onCancel={leaveGame}
      />
    )
  } else if (liveScreen.kind === 'playing') {
    screen = (
      <GameScreen
        players={liveScreen.players}
        participantRole={liveScreen.participantRole}
        currentPlayerId={connection.currentPlayerId}
        boardState={liveScreen.boardState}
        shutdown={shutdown}
        onPlaceCell={placeCell}
        onLeave={leaveGame}
      />
    )
  } else if (liveScreen.kind === 'finished-player') {
    const finishedGameId = liveScreen.finishedGameId
    const isRematchRequestedByCurrentPlayer = liveScreen.rematch.requestedPlayerIds.includes(connection.currentPlayerId)
    const isRematchRequestedByOpponent = liveScreen.rematch.requestedPlayerIds.some(
      playerId => playerId !== connection.currentPlayerId
    )

    screen = (
      <GameScreen
        players={liveScreen.players}
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
              onReviewGame={finishedGameId ? () => openFinishedGameReview(finishedGameId) : undefined}
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
              onReviewGame={finishedGameId ? () => openFinishedGameReview(finishedGameId) : undefined}
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
    screen = (
      <GameScreen
        players={liveScreen.players}
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
            onReviewGame={finishedGameId ? () => openFinishedGameReview(finishedGameId) : undefined}
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
