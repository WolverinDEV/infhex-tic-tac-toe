import { useEffect, useState } from 'react'
import type { LobbyInfo, ShutdownState } from '@ih3t/shared'
import { formatDateTime } from '../utils/dateTime'
import { formatCountdownDuration } from '../utils/duration'
import { formatTimeControl } from '../utils/gameTimeControl'
import { formatActiveSessionDuration, formatLobbyPlayers } from '../utils/lobby'
import { getInitialRenderTimestamp } from '../ssrState'

interface AdminControlsScreenProps {
  isAuthorizing: boolean
  shutdown: ShutdownState | null
  maxConcurrentGames: string
  currentConcurrentGames: number | null
  delayMinutes: string
  messageDraft: string
  isLoadingServerSettings: boolean
  serverSettingsErrorMessage: string | null
  isSavingServerSettings: boolean
  isScheduling: boolean
  isCancelling: boolean
  isSendingMessage: boolean
  activeGames: LobbyInfo[]
  isLoadingActiveGames: boolean
  terminatingSessionId: string | null
  onMaxConcurrentGamesChange: (value: string) => void
  onDelayMinutesChange: (value: string) => void
  onMessageDraftChange: (value: string) => void
  onSaveServerSettings: () => void
  onSchedule: () => void
  onCancel: () => void
  onSendMessage: () => void
  onTerminateGame: (sessionId: string) => void
  onBack: () => void
  onOpenStats: () => void
}

function renderConcurrentGamesSummary(maxConcurrentGames: string, currentConcurrentGames: number | null) {
  if (currentConcurrentGames === null) {
    return 'Loading current usage...'
  }

  const trimmedLimit = maxConcurrentGames.trim()
  if (!trimmedLimit) {
    return `${currentConcurrentGames} concurrent session${currentConcurrentGames === 1 ? '' : 's'} running with no cap configured.`
  }

  return `${currentConcurrentGames} of ${trimmedLimit} concurrent session${trimmedLimit === '1' ? '' : 's'} currently in use.`
}

function ShutdownSummary({ shutdown }: { shutdown: ShutdownState | null }) {
  const [now, setNow] = useState(() => getInitialRenderTimestamp())

  useEffect(() => {
    if (!shutdown) {
      return
    }

    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => window.clearInterval(interval)
  }, [shutdown])

  if (!shutdown) {
    return (
      <div className="rounded-[1.35rem] border border-dashed border-white/10 bg-slate-950/35 px-5 py-5 text-sm text-slate-400">
        No shutdown is currently scheduled.
      </div>
    )
  }

  return (
    <div className="rounded-[1.35rem] border border-amber-300/25 bg-amber-300/10 px-5 py-5">
      <div className="text-xs uppercase tracking-[0.24em] text-amber-100">Scheduled Restart</div>
      <div className="mt-2 text-2xl font-black text-white">
        {formatCountdownDuration(Math.max(0, shutdown.gracefulTimeout - now))}
      </div>
      <div className="mt-3 text-sm text-amber-50/90">
        Goes down at {formatDateTime(shutdown.gracefulTimeout)}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-amber-100/75">
        Scheduled {formatDateTime(shutdown.scheduledAt)}
      </div>
    </div>
  )
}

function AdminControlsScreen({
  isAuthorizing,
  shutdown,
  maxConcurrentGames,
  currentConcurrentGames,
  delayMinutes,
  messageDraft,
  isLoadingServerSettings,
  serverSettingsErrorMessage,
  isSavingServerSettings,
  isScheduling,
  isCancelling,
  isSendingMessage,
  activeGames,
  isLoadingActiveGames,
  terminatingSessionId,
  onMaxConcurrentGamesChange,
  onDelayMinutesChange,
  onMessageDraftChange,
  onSaveServerSettings,
  onSchedule,
  onCancel,
  onSendMessage,
  onTerminateGame,
  onBack,
  onOpenStats
}: AdminControlsScreenProps) {
  const [now, setNow] = useState(() => getInitialRenderTimestamp())

  useEffect(() => {
    if (activeGames.length === 0) {
      return
    }

    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [activeGames.length])

  return (
    <div className="flex flex-1 flex-col px-4 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.45)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-sky-300/30 bg-sky-400/10 px-4 py-1 text-xs uppercase tracking-[0.32em] text-sky-100">
                Admin
              </div>
              <h1 className="mt-5 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-5xl">
                Admin Controls
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Schedule a restart, send a global announcement, or terminate a live game that needs intervention.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={onOpenStats}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-900 transition hover:-translate-y-0.5 hover:bg-amber-200"
              >
                View Stats
              </button>
              <button
                onClick={onBack}
                className="rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/14"
              >
                Back To Lobby
              </button>
            </div>
          </div>
        </section>

        {isAuthorizing ? (
          <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/6 px-6 py-10 text-center text-slate-300">
            Loading admin tools...
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr,1.35fr]">
            <section className="rounded-[1.75rem] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Capacity</div>
              <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.08em] text-white">Concurrent Game Cap</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Limit how many unfinished sessions can exist at once. This is enforced only on the server when a new game or rematch is created.
              </p>

              {serverSettingsErrorMessage ? (
                <div className="mt-5 rounded-[1.35rem] border border-rose-300/25 bg-rose-500/10 px-5 py-5 text-sm text-rose-100">
                  {serverSettingsErrorMessage}
                </div>
              ) : (
                <div className="mt-5 rounded-[1.35rem] border border-dashed border-white/10 bg-slate-950/35 px-5 py-5 text-sm text-slate-300">
                  {isLoadingServerSettings
                    ? 'Loading concurrent game limit...'
                    : renderConcurrentGamesSummary(maxConcurrentGames, currentConcurrentGames)}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block flex-1">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Max Concurrent Games</div>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={maxConcurrentGames}
                    onChange={(event) => onMaxConcurrentGamesChange(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-300/50"
                    placeholder="Leave blank for no limit"
                  />
                </label>
                <button
                  onClick={onSaveServerSettings}
                  disabled={isSavingServerSettings || isLoadingServerSettings}
                  className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingServerSettings ? 'Saving...' : 'Save Limit'}
                </button>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/80">Shutdown</div>
              <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.08em] text-white">Server Restart</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Scheduling a shutdown disables new matches immediately and closes remaining games when the timer ends.
              </p>

              <div className="mt-5">
                <ShutdownSummary shutdown={shutdown} />
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block flex-1">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Grace Timeout</div>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={delayMinutes}
                    onChange={(event) => onDelayMinutesChange(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-sky-300/50"
                  />
                </label>
                <button
                  onClick={onSchedule}
                  disabled={isScheduling}
                  className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-900 transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isScheduling ? 'Scheduling...' : 'Schedule'}
                </button>
                <button
                  onClick={onCancel}
                  disabled={!shutdown || isCancelling}
                  className="rounded-full border border-rose-300/25 bg-rose-500/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
              <div className="text-xs uppercase tracking-[0.3em] text-sky-200/80">Broadcast</div>
              <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.08em] text-white">Global Message</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Send a short announcement that appears as a toast for everyone currently connected to the server.
              </p>

              <label className="mt-5 block">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Message</div>
                <textarea
                  value={messageDraft}
                  onChange={(event) => onMessageDraftChange(event.target.value)}
                  maxLength={280}
                  rows={6}
                  className="mt-2 min-h-40 w-full rounded-[1.4rem] border border-white/10 bg-slate-900/80 px-4 py-4 text-base text-white outline-none transition focus:border-sky-300/50"
                  placeholder="Server maintenance starts soon. Please finish your current turn."
                />
              </label>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-400">{messageDraft.trim().length}/280 characters</div>
                <button
                  onClick={onSendMessage}
                  disabled={isSendingMessage || messageDraft.trim().length === 0}
                  className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingMessage ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)] xl:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-rose-200/80">Intervention</div>
                  <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.08em] text-white">Active Games</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                    Manually end an in-progress match and send both players to the terminated result screen.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-right">
                  <div className="text-2xl font-black text-white">{activeGames.length}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">In Progress</div>
                </div>
              </div>

              <div className="mt-5">
                {isLoadingActiveGames ? (
                  <div className="rounded-[1.35rem] border border-dashed border-white/10 bg-slate-950/35 px-5 py-5 text-sm text-slate-400">
                    Loading active games...
                  </div>
                ) : activeGames.length === 0 ? (
                  <div className="rounded-[1.35rem] border border-dashed border-white/10 bg-slate-950/35 px-5 py-5 text-sm text-slate-400">
                    No live games are running right now.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeGames.map((session) => (
                      <div
                        key={session.id}
                        className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-100">
                              Active Game
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${session.rated
                              ? 'bg-amber-300/15 text-amber-100'
                              : 'bg-white/8 text-slate-200'
                              }`}>
                              {session.rated ? 'Rated' : 'Unrated'}
                            </span>
                            <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                              {formatTimeControl(session.timeControl)}
                            </span>
                          </div>

                          <div className="mt-3 break-all text-lg font-bold text-white sm:text-xl">{session.id}</div>
                          <div className="mt-1 text-sm text-slate-300">{formatLobbyPlayers(session.players, session.rated, 'Waiting for players')}</div>
                          {session.startedAt && (
                            <div className="mt-1 text-sm text-slate-400">
                              Running for {formatActiveSessionDuration(session.startedAt, now)} • Started {formatDateTime(session.startedAt)}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => onTerminateGame(session.id)}
                          disabled={terminatingSessionId !== null}
                          className="rounded-full border border-rose-300/25 bg-rose-500/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 lg:shrink-0"
                        >
                          {terminatingSessionId === session.id ? 'Terminating...' : 'Terminate Game'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminControlsScreen
