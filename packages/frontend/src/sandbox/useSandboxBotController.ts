import type { GameState, HexCoordinate, SandboxPlayerSlot } from '@ih3t/shared'
import type { BotEngineCapabilities, BotEngineInterface } from '@ih3t/shared'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { createSandboxBot, SandboxBotEngineInfo } from './botLoader'
import { getSandboxBotMoves } from './getSandboxBotMoves'
import type { SandboxPlayerMode } from './sandboxBotSettings'

type UseSandboxBotControllerOptions = {
    gameState: GameState
    botTurnEnabled: boolean
    botFactory: SandboxBotEngineInfo | null
    playerModes: Record<SandboxPlayerSlot, SandboxPlayerMode>
    timeoutMs: number
    resolvePlayerSlot: (playerId: string) => SandboxPlayerSlot
    onApplyBotMoves: (moves: readonly HexCoordinate[]) => void
    onBotError?: (message: string) => void
}

type SandboxBotControllerResult = {
    bot: BotEngineInterface | null
    botCapabilities: Readonly<BotEngineCapabilities> | null
    botAvailabilityMessage: string | null
    botDisplayName: string | null
    currentTurnMode: SandboxPlayerMode
    isThinking: boolean
    lastErrorMessage: string | null
}

function disposeSandboxBot(bot: BotEngineInterface | null) {
    const disposableBot = bot as ({ dispose?: () => void } & BotEngineInterface) | null
    if (typeof disposableBot?.dispose === 'function') {
        disposableBot.dispose()
    }
}

export function useSandboxBotController({
    gameState,
    botTurnEnabled,
    botFactory,
    playerModes,
    timeoutMs,
    resolvePlayerSlot,
    onApplyBotMoves,
    onBotError
}: Readonly<UseSandboxBotControllerOptions>): SandboxBotControllerResult {
    const [bot, setBot] = useState<BotEngineInterface | null>(null)
    const [botLoadError, setBotLoadError] = useState<string | null>(null)
    const [isBotLoading, setIsBotLoading] = useState(true)
    const [isThinking, setIsThinking] = useState(false)
    const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null)
    const requestSequenceRef = useRef(0)
    const pendingAttemptKeyRef = useRef<string | null>(null)
    const failedAttemptKeyRef = useRef<string | null>(null)
    const latestGameStateRef = useRef(gameState)

    const applyBotMoves = useEffectEvent((moves: readonly HexCoordinate[]) => {
        onApplyBotMoves(moves)
    })

    const reportBotError = useEffectEvent((message: string) => {
        onBotError?.(message)
    })

    useEffect(() => {
        let cancelled = false
        let activeBot: BotEngineInterface | null = null

        if (!botFactory) {
            setBot(null)
            setBotLoadError(null)
            setIsBotLoading(false)
            return
        }

        setBot(null)
        setIsBotLoading(true)
        setBotLoadError(null)
        setLastErrorMessage(null)
        pendingAttemptKeyRef.current = null
        failedAttemptKeyRef.current = null

        void createSandboxBot(botFactory.name)
            .then((resolvedBot) => {
                if (cancelled) {
                    disposeSandboxBot(resolvedBot)
                    return
                }

                activeBot = resolvedBot
                setBot(resolvedBot)
            })
            .catch((error) => {
                if (cancelled) {
                    return
                }

                setBot(null)
                setBotLoadError(error instanceof Error ? error.message : 'Failed to load the sandbox bot.')
            })
            .finally(() => {
                if (cancelled) {
                    return
                }

                setIsBotLoading(false)
            })

        return () => {
            cancelled = true
            disposeSandboxBot(activeBot)
        }
    }, [botFactory])

    const currentTurnSlot = gameState.currentTurnPlayerId
        ? resolvePlayerSlot(gameState.currentTurnPlayerId)
        : null
    const currentTurnMode = currentTurnSlot ? playerModes[currentTurnSlot] : 'human'
    const botCapabilities = bot?.getCapabilities() ?? null
    const botDisplayName = bot?.getDisplayName() ?? null
    const botAvailabilityMessage = useMemo(() => {
        if (!botFactory) {
            return null
        }

        if (botLoadError) {
            return botLoadError
        }

        if (isBotLoading) {
            return 'Loading bot engine...'
        }

        if (!bot) {
            return 'Bot engine unavailable in this build.'
        }

        return null
    }, [bot, botFactory, botLoadError, isBotLoading])

    const currentAttemptKey = useMemo(
        () => JSON.stringify({
            botFactoryName: botFactory?.displayName ?? null,
            cells: gameState.cells,
            currentTurnPlayerId: gameState.currentTurnPlayerId,
            placementsRemaining: gameState.placementsRemaining,
            timeoutMs,
            currentTurnMode
        }),
        [botFactory, currentTurnMode, gameState.cells, gameState.currentTurnPlayerId, gameState.placementsRemaining, timeoutMs]
    )

    useEffect(() => {
        latestGameStateRef.current = gameState
    }, [gameState])

    useEffect(() => {
        if (currentTurnMode !== 'bot') {
            pendingAttemptKeyRef.current = null
            failedAttemptKeyRef.current = null
            setIsThinking(false)
            setLastErrorMessage(null)
        }
    }, [currentTurnMode])

    useEffect(() => {
        if (failedAttemptKeyRef.current !== currentAttemptKey) {
            setLastErrorMessage(null)
        }
    }, [currentAttemptKey])

    useEffect(() => {
        if (!botTurnEnabled || !bot || currentTurnMode !== 'bot' || !gameState.currentTurnPlayerId || gameState.winner) {
            pendingAttemptKeyRef.current = null
            setIsThinking(false)
            return
        }

        if (pendingAttemptKeyRef.current === currentAttemptKey) {
            return
        }

        if (failedAttemptKeyRef.current === currentAttemptKey) {
            return
        }

        let cancelled = false
        const requestSequence = requestSequenceRef.current + 1
        requestSequenceRef.current = requestSequence
        pendingAttemptKeyRef.current = currentAttemptKey
        setIsThinking(true)

        void getSandboxBotMoves(bot, latestGameStateRef.current, timeoutMs)
            .then((moves) => {
                if (cancelled || requestSequenceRef.current !== requestSequence) {
                    return
                }

                pendingAttemptKeyRef.current = null
                failedAttemptKeyRef.current = null
                setIsThinking(false)
                setLastErrorMessage(null)
                applyBotMoves(moves)
            })
            .catch((error) => {
                if (cancelled || requestSequenceRef.current !== requestSequence) {
                    return
                }

                const message = error instanceof Error ? error.message : 'Failed to generate a sandbox bot move.'
                pendingAttemptKeyRef.current = null
                failedAttemptKeyRef.current = currentAttemptKey
                setIsThinking(false)
                setLastErrorMessage(message)
                reportBotError(message)
            })

        return () => {
            cancelled = true
            if (pendingAttemptKeyRef.current === currentAttemptKey) {
                pendingAttemptKeyRef.current = null
            }
        }
    }, [
        bot,
        botTurnEnabled,
        currentAttemptKey,
        currentTurnMode,
        timeoutMs
    ])

    return {
        bot,
        botCapabilities,
        botAvailabilityMessage,
        botDisplayName,
        currentTurnMode,
        isThinking,
        lastErrorMessage
    }
}
