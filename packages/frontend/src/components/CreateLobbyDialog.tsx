import { useEffect, useMemo, useState } from 'react'
import type { AccountProfile, CreateSessionRequest, GameTimeControl, LobbyVisibility } from '@ih3t/shared'
import { formatGameTimeSeconds } from '../utils/gameTimeControl'

interface CreateLobbyDialogProps {
  isOpen: boolean
  onClose: () => void
  account: AccountProfile | null
  onCreateLobby: (request: CreateSessionRequest) => void
}

const visibilityOptions: Array<{
  value: LobbyVisibility
  title: string
  description: string
}> = [
    {
      value: 'public',
      title: 'Public Lobby',
      description: 'Listed in the live browser.'
    },
    {
      value: 'private',
      title: 'Private Lobby',
      description: 'Hidden until shared directly.'
    }
  ]

const timeControlModeOptions: Array<{
  value: GameTimeControl['mode']
  title: string
  description: string
}> = [
    {
      value: 'match',
      title: 'Match Based',
      description: 'A main clock between 1m and 60m plus an increment after each completed turn.'
    },
    {
      value: 'turn',
      title: 'Turn Based',
      description: 'A time limit per turn between 5s and 120s.'
    },
    {
      value: 'unlimited',
      title: 'Unlimited',
      description: 'No clock configured.'
    },
  ]

const TURN_TIME_STEP_SECONDS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const
const TURN_TIME_DEFAULT = 45

const MATCH_TIME_STEP_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60] as const
const MATCH_TIME_DEFAULT = 5

const INCREMENT_STEP_SECONDS = [0, 1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300] as const
const INCREMENT_DEFAULT = 5

function SelectableOptions({ onClick, selected, title, description, disabled = false }: Readonly<{ onClick: () => void, selected: boolean, title: string, description: string, disabled?: boolean }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start rounded-[0.9rem] border p-3 text-left transition ${selected
        ? 'border-sky-300/35 bg-sky-300/10 shadow-[0_8px_18px_rgba(14,165,233,0.1)]'
        : disabled
          ? 'cursor-not-allowed border-white/8 bg-white/4 opacity-60'
          : 'border-white/10 bg-white/6 hover:border-white/20 hover:bg-white/10'
        }`}
    >
      <div className="flex-row items-center text-sm font-bold text-white">
        <span className={`mr-2 inline-block h-3.5 w-3.5 align-sub rounded-full border ${selected ? 'border-sky-200 bg-sky-300' : 'border-white/20 bg-slate-900/40'}`} />
        {title}
      </div>
      <div className="mt-1 text-[11px] leading-4.5 text-slate-300">{description}</div>
    </button>
  )
}

function CreateLobbyDialog({
  isOpen,
  onClose,
  account,
  onCreateLobby
}: Readonly<CreateLobbyDialogProps>) {
  const canCreateRatedLobby = Boolean(account)
  const [visibility, setVisibility] = useState<LobbyVisibility>('public')
  const [timeControlMode, setTimeControlMode] = useState<GameTimeControl['mode']>('match')
  const [rated, setRated] = useState(canCreateRatedLobby)
  const [turnTimeStepIndex, setTurnTimeStepIndex] = useState(TURN_TIME_STEP_SECONDS.indexOf(TURN_TIME_DEFAULT))
  const [matchTimeStepIndex, setMatchTimeStepIndex] = useState(MATCH_TIME_STEP_MINUTES.indexOf(MATCH_TIME_DEFAULT))
  const [incrementStepIndex, setIncrementStepIndex] = useState(INCREMENT_STEP_SECONDS.indexOf(INCREMENT_DEFAULT))

  useEffect(() => {
    setRated(canCreateRatedLobby)
  }, [canCreateRatedLobby])

  const turnTimeSeconds = TURN_TIME_STEP_SECONDS[turnTimeStepIndex]
  const matchTimeMinutes = MATCH_TIME_STEP_MINUTES[matchTimeStepIndex]
  const incrementSeconds = INCREMENT_STEP_SECONDS[incrementStepIndex]

  const selectedTimeControl = useMemo<GameTimeControl>(() => {
    if (timeControlMode === 'turn') {
      return {
        mode: 'turn',
        turnTimeMs: turnTimeSeconds * 1000
      }
    }

    if (timeControlMode === 'match') {
      return {
        mode: 'match',
        mainTimeMs: matchTimeMinutes * 60 * 1000,
        incrementMs: incrementSeconds * 1000
      }
    }

    return {
      mode: 'unlimited'
    }
  }, [incrementSeconds, matchTimeMinutes, timeControlMode, turnTimeSeconds])

  if (!isOpen) {
    return null
  }

  const handleCreate = () => {
    onCreateLobby({
      lobbyOptions: {
        visibility,
        timeControl: selectedTimeControl,
        rated
      }
    })
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-md flex flex-col">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative my-auto z-10 flex self-center items-center justify-center">
        <section className="relative my-auto w-full max-w-2xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[linear-gradient(155deg,_rgba(15,23,42,0.97),_rgba(17,24,39,0.95)_55%,_rgba(30,41,59,0.92))] p-3.5 text-white shadow-[0_24px_80px_rgba(2,6,23,0.55)] sm:p-4">
          <div className="absolute -right-10 -top-14 h-20 w-20 rounded-full bg-sky-400/16 blur-3xl" />
          <div className="absolute -left-8 bottom-0 h-16 w-16 rounded-full bg-amber-300/12 blur-3xl" />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Create Lobby</div>
                <h2 className="mt-1 text-lg font-black uppercase tracking-[0.05em] text-white sm:text-xl">
                  Lobby Setup
                </h2>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              <section className="p-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Mode</div>
                  </div>
                  <div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${rated ? 'bg-amber-300/15 text-amber-100' : 'bg-white/8 text-slate-100'}`}>
                    {rated ? 'rated' : 'casual'}
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <SelectableOptions
                    onClick={() => setRated(false)}
                    selected={!rated}
                    title="Casual"
                    description="Casual unrated game"
                  />
                  <SelectableOptions
                    onClick={() => {
                      if (canCreateRatedLobby) {
                        setRated(true)
                      }
                    }}
                    selected={rated}
                    disabled={!canCreateRatedLobby}
                    title="Rated"
                    description={'Rated game with ELO'}
                  />
                </div>
                {!canCreateRatedLobby && (
                  <div className="mt-2.5 rounded-[0.9rem] border border-amber-300/20 bg-amber-300/10 px-3 py-2.5 text-xs leading-5 text-amber-50/85">
                    Rated lobbies are for authenticated players only.
                  </div>
                )}
              </section>

              <section className="p-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Visibility</div>
                  </div>
                  <div className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                    {visibility}
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {visibilityOptions.map((option) => {
                    const selected = visibility === option.value

                    return (
                      <SelectableOptions
                        key={option.value}

                        onClick={() => setVisibility(option.value)}
                        selected={selected}

                        title={option.title}
                        description={option.description}
                      />
                    )
                  })}
                </div>
              </section>

              <section className="relative p-0">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Time Control</div>
                </div>

                <div className="relative mt-3">
                  <fieldset>
                    <div className="grid gap-2 md:grid-cols-1 xl:grid-cols-3">
                      {timeControlModeOptions.map((option) => {
                        const selected = timeControlMode === option.value

                        return (
                          <SelectableOptions
                            key={option.value}
                            onClick={() => setTimeControlMode(option.value)}
                            selected={selected}
                            title={option.title}
                            description={option.description}
                          />
                        )
                      })}
                    </div>

                    <div className="mt-2.5 flex flex-col rounded-[0.9rem] border border-white/10 bg-slate-950/35 p-3 lg:h-[7.25em]">
                      {timeControlMode === 'unlimited' ? (
                        <div className="my-auto text-center text-sm leading-5 text-slate-300">
                          No clock will be configured for this lobby.
                        </div>
                      ) : timeControlMode === 'turn' ? (
                        <div className="space-y-2.5">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Turn Time</div>
                            <div className="mt-0.5 text-lg font-bold text-white">{formatGameTimeSeconds(turnTimeSeconds)}</div>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={TURN_TIME_STEP_SECONDS.length - 1}
                            step={1}
                            value={turnTimeStepIndex}
                            onChange={(event) => setTurnTimeStepIndex(Number(event.target.value))}
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-300"
                          />
                          <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            <span>5s</span>
                            <span>120s</span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-2">
                          <div className="space-y-2.5">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Main Time</div>
                              <div className="mt-0.5 text-lg font-bold text-white">{matchTimeMinutes}m</div>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={MATCH_TIME_STEP_MINUTES.length - 1}
                              step={1}
                              value={matchTimeStepIndex}
                              onChange={(event) => setMatchTimeStepIndex(Number(event.target.value))}
                              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-300"
                            />
                            <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                              <span>1m</span>
                              <span>60m</span>
                            </div>
                          </div>

                          <div className="space-y-2.5">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Increment</div>
                              <div className="mt-0.5 text-lg font-bold text-white">{formatGameTimeSeconds(incrementSeconds)}</div>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={INCREMENT_STEP_SECONDS.length - 1}
                              step={1}
                              value={incrementStepIndex}
                              onChange={(event) => setIncrementStepIndex(Number(event.target.value))}
                              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-300"
                            />
                            <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                              <span>0s</span>
                              <span>5m</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </fieldset>
                </div>
              </section>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 transition hover:bg-white/12"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="rounded-full bg-amber-300 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
              >
                Create Lobby
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default CreateLobbyDialog
