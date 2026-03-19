import { useEffect, useRef, useState } from 'react'
import type { FinishedGameRecord, FinishedGameSummary } from '@ih3t/shared'
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
import { getOrCreateDeviceId } from './deviceId'
import {
  hostGame,
  joinGame,
  leaveGame,
  placeCell,
  requestRematch,
  returnToLobby
} from './liveGameClient'
import { useLiveGameStore } from './liveGameStore'

type AppRoute =
  | { page: 'live' }
  | { page: 'finished-games' }
  | { page: 'finished-game'; gameId: string }

function getApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  return import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
}

function parseRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'

  if (normalizedPath === '/games') {
    return { page: 'finished-games' }
  }

  const gameMatch = normalizedPath.match(/^\/games\/([^/]+)$/)
  if (gameMatch) {
    return {
      page: 'finished-game',
      gameId: decodeURIComponent(gameMatch[1])
    }
  }

  return { page: 'live' }
}

function buildRoutePath(route: AppRoute) {
  if (route.page === 'finished-games') {
    return '/games'
  }

  if (route.page === 'finished-game') {
    return `/games/${encodeURIComponent(route.gameId)}`
  }

  return '/'
}

function App() {
  const apiBaseUrlRef = useRef<string>(getApiBaseUrl())
  const deviceIdRef = useRef<string>(getOrCreateDeviceId())
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname))
  const [finishedGames, setFinishedGames] = useState<FinishedGameSummary[]>([])
  const [isFinishedGamesLoading, setIsFinishedGamesLoading] = useState(false)
  const [finishedGamesError, setFinishedGamesError] = useState<string | null>(null)
  const [selectedFinishedGame, setSelectedFinishedGame] = useState<FinishedGameRecord | null>(null)
  const [isSelectedFinishedGameLoading, setIsSelectedFinishedGameLoading] = useState(false)
  const [selectedFinishedGameError, setSelectedFinishedGameError] = useState<string | null>(null)
  const connection = useLiveGameStore(state => state.connection)
  const availableSessions = useLiveGameStore(state => state.availableSessions)
  const liveScreen = useLiveGameStore(state => state.screen)

  const navigateTo = (nextRoute: AppRoute) => {
    const nextPath = buildRoutePath(nextRoute)
    if (window.location.pathname !== nextPath) {
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

  const fetchFinishedGames = async () => {
    setIsFinishedGamesLoading(true)
    setFinishedGamesError(null)

    try {
      const response = await fetch(`${apiBaseUrlRef.current}/api/finished-games`, {
        credentials: 'include',
        headers: {
          'X-Device-Id': deviceIdRef.current
        }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to load finished games.')
      }

      const data = await response.json() as { games: FinishedGameSummary[] }
      setFinishedGames(data.games)
    } catch (error) {
      console.error('Failed to fetch finished games:', error)
      setFinishedGamesError(error instanceof Error ? error.message : 'Failed to load finished games.')
    } finally {
      setIsFinishedGamesLoading(false)
    }
  }

  const fetchFinishedGame = async (gameId: string) => {
    setIsSelectedFinishedGameLoading(true)
    setSelectedFinishedGameError(null)
    setSelectedFinishedGame(null)

    try {
      const response = await fetch(`${apiBaseUrlRef.current}/api/finished-games/${encodeURIComponent(gameId)}`, {
        credentials: 'include',
        headers: {
          'X-Device-Id': deviceIdRef.current
        }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to load finished game replay.')
      }

      const data = await response.json() as FinishedGameRecord
      setSelectedFinishedGame(data)
    } catch (error) {
      console.error('Failed to fetch finished game:', error)
      setSelectedFinishedGame(null)
      setSelectedFinishedGameError(error instanceof Error ? error.message : 'Failed to load finished game replay.')
    } finally {
      setIsSelectedFinishedGameLoading(false)
    }
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
    navigateTo({ page: 'finished-game', gameId })
  }

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (route.page === 'finished-games') {
      void fetchFinishedGames()
      return
    }

    if (route.page === 'finished-game') {
      void fetchFinishedGame(route.gameId)
    }
  }, [route])

  let screen = null

  if (route.page === 'finished-games') {
    screen = (
      <FinishedGamesScreen
        games={finishedGames}
        isLoading={isFinishedGamesLoading}
        errorMessage={finishedGamesError}
        onBack={() => navigateTo({ page: 'live' })}
        onOpenGame={(gameId) => navigateTo({ page: 'finished-game', gameId })}
        onRefresh={fetchFinishedGames}
      />
    )
  } else if (route.page === 'finished-game') {
    screen = (
      <FinishedGameReviewScreen
        game={selectedFinishedGame}
        isLoading={isSelectedFinishedGameLoading}
        errorMessage={selectedFinishedGameError}
        onBack={() => navigateTo({ page: 'finished-games' })}
        onRetry={() => fetchFinishedGame(route.gameId)}
      />
    )
  } else if (liveScreen.kind === 'lobby') {
    screen = (
      <LobbyScreen
        isConnected={connection.isConnected}
        availableSessions={availableSessions}
        onHostGame={hostGame}
        onJoinGame={joinGame}
        onViewFinishedGames={() => navigateTo({ page: 'finished-games' })}
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
