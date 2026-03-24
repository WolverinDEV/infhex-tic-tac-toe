import { useEffect, useRef } from 'react'
import { startLiveGameClient, stopLiveGameClient } from '../liveGameClient'
import { useLiveGameStore } from '../liveGameStore'
import {
  playChatMessageSound,
  playGameLossSound,
  playGameWinSound,
  playMatchStartSound
} from '../soundEffects'

function LiveGameRuntime() {
  const liveScreen = useLiveGameStore(state => state.screen)
  const currentPlayerId = useLiveGameStore(state => state.connection.currentPlayerId)
  const previousSessionStateRef = useRef(
    liveScreen.kind === 'session' ? liveScreen.session.state : 'none'
  )
  const previousSessionIdRef = useRef(
    liveScreen.kind === 'session' ? liveScreen.sessionId : null
  )
  const previousLastChatMessageIdRef = useRef(
    liveScreen.kind === 'session'
      ? (liveScreen.session.chatMessages[liveScreen.session.chatMessages.length - 1]?.id ?? null)
      : null
  )

  useEffect(() => {
    startLiveGameClient()

    return () => {
      stopLiveGameClient()
    }
  }, [])

  useEffect(() => {
    const previousState = previousSessionStateRef.current
    const nextState = liveScreen.kind === 'session' ? liveScreen.session.state : 'none'
    const isPlayer = liveScreen.kind === 'session'
      && liveScreen.session.players.some(player => player.id === currentPlayerId)

    if (previousState === 'lobby' && nextState === 'in-game' && isPlayer) {
      playMatchStartSound()
    }

    if (previousState === 'in-game' && nextState === 'finished' && liveScreen.kind === 'session' && liveScreen.session.state === "finished" && isPlayer) {
      if (liveScreen.session.winningPlayerId === currentPlayerId) {
        playGameWinSound()
      } else {
        playGameLossSound()
      }
    }

    previousSessionStateRef.current = nextState
  }, [currentPlayerId, liveScreen])

  useEffect(() => {
    const nextSessionId = liveScreen.kind === 'session' ? liveScreen.sessionId : null
    const nextLastChatMessage = liveScreen.kind === 'session'
      ? (liveScreen.session.chatMessages[liveScreen.session.chatMessages.length - 1] ?? null)
      : null
    const previousSessionId = previousSessionIdRef.current
    const previousLastChatMessageId = previousLastChatMessageIdRef.current

    if (
      previousSessionId === nextSessionId
      && nextLastChatMessage
      && nextLastChatMessage.id !== previousLastChatMessageId
      && nextLastChatMessage.participantId !== currentPlayerId
    ) {
      playChatMessageSound()
    }

    previousSessionIdRef.current = nextSessionId
    previousLastChatMessageIdRef.current = nextLastChatMessage?.id ?? null
  }, [currentPlayerId, liveScreen])

  return null
}

export default LiveGameRuntime
