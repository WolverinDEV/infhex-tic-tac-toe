import { useEffect, useState } from 'react'
import type { AccountProfile } from '@ih3t/shared'
import { useLocation } from 'react-router'
import { toast } from 'react-toastify'
import { signInWithDiscord, signOutAccount, updateAccountUsername } from '../authClient'
import { queryClient } from '../queryClient'
import { queryKeys, useQueryAccount } from '../queryHooks'

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

function LobbyAccountSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-20 rounded-full bg-white/10" />
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white/10" />
          <div className="min-w-0 flex-1">
            <div className="h-5 w-40 rounded-full bg-white/10" />
            <div className="mt-2 h-4 w-56 max-w-full rounded-full bg-white/10" />
          </div>
        </div>
        <div className="hidden h-9 w-32 rounded-full bg-white/10 sm:block" />
      </div>
    </div>
  )
}

interface LobbyGuestDisplayProps {
  hasPendingInvite: boolean
}

function LobbyGuestDisplay({ hasPendingInvite }: LobbyGuestDisplayProps) {
  const handleSignIn = async () => {
    try {
      await signInWithDiscord()
    } catch (error) {
      console.error('Failed to start Discord sign in:', error)
      showErrorToast(error instanceof Error ? error.message : 'Failed to start Discord sign in.')
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex flex-shrink-0 h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg font-black text-white">
          G
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Guest Access</div>
          <div className="mt-1 text-xl font-bold text-white">Play Without An Account</div>
          <div className="mt-1 text-sm text-slate-400">
            {hasPendingInvite
              ? 'You can accept this invite as a guest, but only signed-in players get a custom username.'
              : 'Guests can host, join, and spectate. Sign in with Discord if you want a custom username and your own match history page.'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void handleSignIn()}
          className="rounded-full bg-[#5865F2] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-[#6f7cff]"
        >
          Sign In With Discord
        </button>
      </div>
    </div>
  )
}

interface LobbySignedInAccountProps {
  account: AccountProfile
  onViewOwnFinishedGames: () => void
}

function LobbySignedInAccount({ account, onViewOwnFinishedGames }: LobbySignedInAccountProps) {
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [draftUsername, setDraftUsername] = useState(account.username)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [isSavingUsername, setIsSavingUsername] = useState(false)

  useEffect(() => {
    setDraftUsername(account.username)
    setIsEditingUsername(false)
    setUsernameError(null)
    setIsSavingUsername(false)
  }, [account])

  const handleSignOut = async () => {
    try {
      await signOutAccount()
    } catch (error) {
      console.error('Failed to sign out:', error)
      showErrorToast(error instanceof Error ? error.message : 'Failed to sign out.')
    }
  }

  const saveUsername = async () => {
    if (isSavingUsername) {
      return
    }

    setIsSavingUsername(true)
    setUsernameError(null)

    try {
      const response = await updateAccountUsername(draftUsername)
      queryClient.setQueryData(queryKeys.account, response)
      showSuccessToast('Username updated.')
      setIsEditingUsername(false)
    } catch (error) {
      setUsernameError(error instanceof Error ? error.message : 'Could not update your username.')
    } finally {
      setIsSavingUsername(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {account.image ? (
          <img
            src={account.image}
            alt={account.username}
            className="h-12 w-12 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="flex flex-shrink-0 h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg font-black text-white">
            {account.username.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Signed In With Discord</div>
          {!isEditingUsername ? (
            <>
              <div className="mt-1 truncate text-xl font-bold text-white">{account.username}</div>
              {account.email && (
                <div className="truncate text-sm text-slate-400">{account.email}</div>
              )}
            </>
          ) : (
            <div className="mt-2">
              <label className="block text-xs uppercase tracking-[0.22em] text-slate-400" htmlFor="account-username">
                Username
              </label>
              <input
                id="account-username"
                value={draftUsername}
                onChange={(event) => setDraftUsername(event.target.value)}
                maxLength={32}
                disabled={isSavingUsername}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-white outline-none transition focus:border-sky-300/50"
              />
              {usernameError && (
                <div className="mt-2 text-sm text-rose-200">{usernameError}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {isEditingUsername ? (
          <>
            <button
              onClick={() => void saveUsername()}
              disabled={isSavingUsername}
              className="rounded-full bg-sky-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingUsername ? 'Saving' : 'Save'}
            </button>
            <button
              onClick={() => {
                setDraftUsername(account.username)
                setIsEditingUsername(false)
                setUsernameError(null)
              }}
              disabled={isSavingUsername}
              className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {/* <button
              onClick={() => {
                setDraftUsername(account.username)
                setIsEditingUsername(true)
                setUsernameError(null)
              }}
              className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/14"
            >
              Edit Username
            </button> */}
            <button
              onClick={onViewOwnFinishedGames}
              className="rounded-full border border-sky-300/25 bg-sky-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100 transition hover:bg-sky-400/20"
            >
              View My Matches
            </button>
            <button
              onClick={() => void handleSignOut()}
              className="rounded-full border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-500/20"
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </div>
  )
}

interface LobbyAccountBoxProps {
  onViewOwnFinishedGames: () => void
}

function LobbyAccountBox({ onViewOwnFinishedGames }: LobbyAccountBoxProps) {
  const location = useLocation()
  const hasPendingInvite = new URLSearchParams(location.search).has('join')
  const accountQuery = useQueryAccount()
  const account = accountQuery.data?.user ?? null

  let inner;
  if (accountQuery.isLoading) {
    inner = <LobbyAccountSkeleton />
  } else if (account) {
    inner = <LobbySignedInAccount account={account} onViewOwnFinishedGames={onViewOwnFinishedGames} />
  } else {
    inner = <LobbyGuestDisplay hasPendingInvite={hasPendingInvite} />
  }

  return (
    <div className="lg:col-span-2 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 text-left sm:rounded-3xl sm:p-5">
      {inner}
    </div>
  )
}

export default LobbyAccountBox
