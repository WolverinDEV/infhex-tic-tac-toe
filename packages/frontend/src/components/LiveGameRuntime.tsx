import { useEffect, useRef } from 'react';

import { startLiveGameClient, stopLiveGameClient } from '../liveGameClient';
import { useLiveGameStore } from '../liveGameStore';
import {
    playChatMessageSound,
    playGameLossSound,
    playGameWinSound,
    playMatchStartSound,
} from '../soundEffects';

function LiveGameRuntime() {
    const activeSession = useLiveGameStore(state => state.session);

    const lastChatMessage = activeSession?.chat?.messages?.at(-1);

    const previousSessionStateRef = useRef(activeSession?.state.status);
    const previousChatMessageIdRef = useRef(lastChatMessage?.id);

    useEffect(() => {
        startLiveGameClient();

        return () => {
            stopLiveGameClient();
        };
    }, []);

    useEffect(() => {
        const previousState = previousSessionStateRef.current ?? `none`;
        if (activeSession?.state.status === `in-game` && (previousState === `lobby` || previousState === `finished`)) {
            playMatchStartSound();
        }

        if (previousState === `in-game` && activeSession?.state.status === `finished` && activeSession.localParticipantRole === `player`) {
            if (activeSession.state.winningPlayerId === activeSession.localParticipantId) {
                playGameWinSound();
            } else {
                playGameLossSound();
            }
        }

        previousSessionStateRef.current = activeSession?.state.status;
    }, [activeSession?.localParticipantId, activeSession?.state?.status]);

    useEffect(() => {
        if (
            previousChatMessageIdRef.current !== lastChatMessage?.id
            && activeSession?.localParticipantId !== lastChatMessage?.senderId
        ) {
            playChatMessageSound();
        }

        previousChatMessageIdRef.current = lastChatMessage?.id;
    }, [activeSession?.localParticipantId, lastChatMessage]);

    return null;
}

export default LiveGameRuntime;
