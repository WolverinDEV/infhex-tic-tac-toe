import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'react-toastify'
import {
  broadcastAdminMessage,
  cancelShutdownSchedule,
  scheduleShutdown,
  terminateAdminGame,
  updateAdminServerSettings
} from '../adminClient'
import AdminControlsScreen from '../components/AdminControlsScreen'
import { queryClient } from '../queryClient'
import { useLiveGameStore } from '../liveGameStore'
import {
  queryKeys,
  useQueryAccount,
  useQueryAdminServerSettings,
  useQueryAvailableSessions
} from '../queryHooks'

function showSuccessToast(message: string) {
  toast.success(message, {
    toastId: `success:${message}`
  })
}

function showErrorToast(message: string) {
  toast.error(message, {
    toastId: `error:${message}`
  })
}

function AdminControlsRoute() {
  const navigate = useNavigate()
  const shutdown = useLiveGameStore(state => state.shutdown)
  const accountQuery = useQueryAccount({ enabled: true })
  const isAdmin = accountQuery.data?.user?.role === 'admin'
  const availableSessionsQuery = useQueryAvailableSessions({ enabled: isAdmin })
  const adminServerSettingsQuery = useQueryAdminServerSettings({ enabled: isAdmin })
  const [delayMinutes, setDelayMinutes] = useState('10')
  const [maxConcurrentGames, setMaxConcurrentGames] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [isScheduling, setIsScheduling] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isSavingServerSettings, setIsSavingServerSettings] = useState(false)
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null)

  const activeGames = (availableSessionsQuery.data ?? []).filter((session) => session.startedAt !== null)
  const currentConcurrentGames = adminServerSettingsQuery.data?.currentConcurrentGames ?? null

  useEffect(() => {
    const configuredLimit = adminServerSettingsQuery.data?.settings.maxConcurrentGames
    if (configuredLimit === undefined) {
      return
    }

    setMaxConcurrentGames(configuredLimit === null ? '' : String(configuredLimit))
  }, [adminServerSettingsQuery.data?.settings.maxConcurrentGames])

  const handleSchedule = async () => {
    const parsedMinutes = Number(delayMinutes)
    if (!Number.isFinite(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > 1440) {
      showErrorToast('Enter a shutdown delay between 1 and 1440 minutes.')
      return
    }

    setIsScheduling(true)
    try {
      const response = await scheduleShutdown(Math.floor(parsedMinutes))
      const scheduledMinutes = response.shutdown
        ? Math.max(1, Math.round((response.shutdown.gracefulTimeout - response.shutdown.scheduledAt) / 60_000))
        : Math.floor(parsedMinutes)
      showSuccessToast(`Shutdown scheduled in ${scheduledMinutes} minute${scheduledMinutes === 1 ? '' : 's'}.`)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to schedule shutdown.')
    } finally {
      setIsScheduling(false)
    }
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await cancelShutdownSchedule()
      showSuccessToast('Scheduled shutdown cancelled.')
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to cancel shutdown.')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleSendMessage = async () => {
    const trimmedMessage = messageDraft.trim()
    if (!trimmedMessage) {
      showErrorToast('Enter a message before sending it.')
      return
    }

    setIsSendingMessage(true)
    try {
      await broadcastAdminMessage(trimmedMessage)
      setMessageDraft('')
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to send global message.')
    } finally {
      setIsSendingMessage(false)
    }
  }

  const handleSaveServerSettings = async () => {
    const trimmedValue = maxConcurrentGames.trim()
    let parsedLimit: number | null = null

    if (trimmedValue.length > 0) {
      const numericLimit = Number(trimmedValue)
      if (!Number.isInteger(numericLimit) || numericLimit < 0 || numericLimit > 10_000) {
        showErrorToast('Enter a concurrent game limit between 0 and 10000, or leave it blank for no cap.')
        return
      }

      parsedLimit = numericLimit
    }

    setIsSavingServerSettings(true)
    try {
      const response = await updateAdminServerSettings(parsedLimit)
      queryClient.setQueryData(queryKeys.adminServerSettings, response)
      setMaxConcurrentGames(response.settings.maxConcurrentGames === null ? '' : String(response.settings.maxConcurrentGames))
      showSuccessToast(
        response.settings.maxConcurrentGames === null
          ? 'Concurrent game limit removed.'
          : `Concurrent game limit set to ${response.settings.maxConcurrentGames}.`
      )
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to save concurrent game limit.')
    } finally {
      setIsSavingServerSettings(false)
    }
  }

  const handleTerminateGame = async (sessionId: string) => {
    const targetSession = activeGames.find((session) => session.id === sessionId)
    const targetLabel = targetSession?.players.map((player) => player.displayName).join(' vs ') || sessionId
    if (!window.confirm(`Terminate the live game "${targetLabel}" now?`)) {
      return
    }

    setTerminatingSessionId(sessionId)
    try {
      await terminateAdminGame(sessionId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.availableSessions }),
        queryClient.invalidateQueries({ queryKey: ['admin'] })
      ])
      showSuccessToast('Game terminated.')
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to terminate game.')
    } finally {
      setTerminatingSessionId(null)
    }
  }

  if (accountQuery.isLoading) {
    return (
      <AdminControlsScreen
        isAuthorizing
        shutdown={shutdown}
        maxConcurrentGames={maxConcurrentGames}
        currentConcurrentGames={currentConcurrentGames}
        delayMinutes={delayMinutes}
        messageDraft={messageDraft}
        isScheduling={isScheduling}
        isCancelling={isCancelling}
        isSendingMessage={isSendingMessage}
        isLoadingServerSettings={false}
        serverSettingsErrorMessage={null}
        isSavingServerSettings={isSavingServerSettings}
        activeGames={[]}
        isLoadingActiveGames={false}
        terminatingSessionId={terminatingSessionId}
        onMaxConcurrentGamesChange={setMaxConcurrentGames}
        onDelayMinutesChange={setDelayMinutes}
        onMessageDraftChange={setMessageDraft}
        onSaveServerSettings={() => void handleSaveServerSettings()}
        onSchedule={() => void handleSchedule()}
        onCancel={() => void handleCancel()}
        onSendMessage={() => void handleSendMessage()}
        onTerminateGame={(sessionId) => void handleTerminateGame(sessionId)}
        onBack={() => void navigate('/')}
        onOpenStats={() => void navigate('/admin/stats')}
      />
    )
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <AdminControlsScreen
      isAuthorizing={false}
      shutdown={shutdown}
      maxConcurrentGames={maxConcurrentGames}
      currentConcurrentGames={currentConcurrentGames}
      delayMinutes={delayMinutes}
      messageDraft={messageDraft}
      isScheduling={isScheduling}
      isCancelling={isCancelling}
      isSendingMessage={isSendingMessage}
      isLoadingServerSettings={adminServerSettingsQuery.isLoading}
      serverSettingsErrorMessage={adminServerSettingsQuery.error instanceof Error ? adminServerSettingsQuery.error.message : null}
      isSavingServerSettings={isSavingServerSettings}
      activeGames={activeGames}
      isLoadingActiveGames={availableSessionsQuery.isLoading}
      terminatingSessionId={terminatingSessionId}
      onMaxConcurrentGamesChange={setMaxConcurrentGames}
      onDelayMinutesChange={setDelayMinutes}
      onMessageDraftChange={setMessageDraft}
      onSaveServerSettings={() => void handleSaveServerSettings()}
      onSchedule={() => void handleSchedule()}
      onCancel={() => void handleCancel()}
      onSendMessage={() => void handleSendMessage()}
      onTerminateGame={(sessionId) => void handleTerminateGame(sessionId)}
      onBack={() => void navigate('/')}
      onOpenStats={() => void navigate('/admin/stats')}
    />
  )
}

export default AdminControlsRoute
