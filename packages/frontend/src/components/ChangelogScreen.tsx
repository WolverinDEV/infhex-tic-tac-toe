import type { AccountPreferences, AccountProfile, ChangelogDay, ChangelogEntryKind } from '@ih3t/shared'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { updateAccountPreferences } from '../query/accountClient'
import {
  countBreakingChanges,
  countUnreadChangelogEntries,
  formatChangelogDate,
  formatChangelogGeneratedAt,
  getLatestChangelogCommitAt,
  isUnreadChangelogEntry,
  sortChangelogEntries
} from '../utils/changelog'
import { formatDateTime } from '../utils/dateTime'
import PageCorpus from './PageCorpus'

const CHANGELOG_KIND_LABELS: Record<ChangelogEntryKind, string> = {
  feature: 'Feature',
  fix: 'Fix',
  maintenance: 'Maintenance',
  other: 'Other',
}

const CHANGELOG_KIND_CLASSES: Record<ChangelogEntryKind, string> = {
  feature: 'border-sky-300/25 bg-sky-400/10 text-sky-100',
  fix: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  maintenance: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  other: 'border-white/15 bg-white/8 text-slate-100',
}

interface ChangelogScreenProps {
  changelogDays: ChangelogDay[]
  commitCount: number
  generatedAt: string
  account: AccountProfile | null
  preferences: AccountPreferences | null
  isPreferencesLoading: boolean
  preferencesErrorMessage: string | null
}

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

function ChangelogScreen({
  changelogDays,
  commitCount,
  generatedAt,
  account,
  preferences,
  isPreferencesLoading,
  preferencesErrorMessage,
}: Readonly<ChangelogScreenProps>) {
  const [isMarkingRead, setIsMarkingRead] = useState(false)
  const latestCommitAt = getLatestChangelogCommitAt(changelogDays)
  const changelogReadAt = preferences?.changelogReadAt ?? null
  const newEntryCount = account && preferences
    ? countUnreadChangelogEntries(changelogDays, changelogReadAt)
    : 0
  const hasNewEntries = newEntryCount > 0
  const totalBreakingChangeCount = countBreakingChanges(changelogDays)

  async function handleMarkNewChangesAsRead() {
    if (!account || !preferences || latestCommitAt <= 0) {
      return
    }

    const nextPreferences: AccountPreferences = {
      ...preferences,
      changelogReadAt: latestCommitAt
    }

    setIsMarkingRead(true)

    try {
      await updateAccountPreferences(nextPreferences)
      showSuccessToast('Marked new changelog entries as read.')
    } catch (error) {
      console.error('Failed to mark changelog updates as read:', error)
      showErrorToast(error instanceof Error ? error.message : 'Failed to update your changelog read status.')
    } finally {
      setIsMarkingRead(false)
    }
  }

  return (
    <PageCorpus
      category="Project History"
      title="Changelog"
      description={`Generated from ${commitCount} commits in git history on ${formatChangelogGeneratedAt(generatedAt)}.${totalBreakingChangeCount > 0 ? ` ${totalBreakingChangeCount} breaking change${totalBreakingChangeCount === 1 ? '' : 's'} flagged.` : ''}`}
    >
      <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex flex-col gap-4 overflow-auto overscroll-contain">
        {account ? (
          isPreferencesLoading ? (
            <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5 text-sm text-slate-300 sm:p-6">
              Loading your changelog status...
            </section>
          ) : preferencesErrorMessage ? (
            <section className="rounded-[1.75rem] border border-rose-300/30 bg-rose-500/10 p-5 text-sm text-rose-100 sm:p-6">
              {preferencesErrorMessage}
            </section>
          ) : preferences ? (
            <section className="rounded-[1.75rem] border border-amber-300/15 bg-amber-300/10 p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-100/80">Updates Since You Last Visited</p>
                  <h2 className="mt-2 text-xl font-black uppercase tracking-[0.08em] text-white sm:text-2xl">
                    {hasNewEntries ? `${newEntryCount} new change${newEntryCount === 1 ? '' : 's'} waiting` : 'You are all caught up'}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-50/85 sm:text-base">
                    {changelogReadAt === null
                      ? 'No changelog visit has been recorded yet, so all current entries are marked as new.'
                      : `Your last read marker was saved on ${formatDateTime(changelogReadAt)}.`}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!hasNewEntries || isMarkingRead}
                  onClick={() => void handleMarkNewChangesAsRead()}
                  className={`rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition ${!hasNewEntries || isMarkingRead
                    ? 'cursor-default border border-white/10 bg-white/6 text-slate-400'
                    : 'bg-amber-300 text-slate-950 hover:-translate-y-0.5 hover:bg-amber-200'
                    }`}
                >
                  {isMarkingRead ? 'Saving...' : 'Mark New Changes As Read'}
                </button>
              </div>
            </section>
          ) : null
        ) : null}

        {changelogDays.map((day) => {
          const sortedEntries = sortChangelogEntries(day.entries, changelogReadAt, Boolean(account && preferences))
          const dayNewEntryCount = account && preferences
            ? sortedEntries.filter((entry) => isUnreadChangelogEntry(entry.committedAt, changelogReadAt)).length
            : 0
          const dayBreakingChangeCount = sortedEntries.filter((entry) => entry.isBreakingChange).length

          return (
            <section
              key={day.date}
              className="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5 sm:p-6 shadow-[0_18px_50px_rgba(2,6,23,0.22)]"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-200/75">{day.date}</p>
                  <h2 className="mt-2 text-xl font-black uppercase tracking-[0.08em] text-white sm:text-2xl">
                    {formatChangelogDate(day.date)}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {dayBreakingChangeCount > 0 && (
                    <div className="rounded-full border border-rose-300/20 bg-rose-500/12 px-4 py-2 text-sm text-rose-100">
                      {dayBreakingChangeCount} breaking
                    </div>
                  )}
                  {dayNewEntryCount > 0 && (
                    <div className="rounded-full border border-amber-300/20 bg-amber-300/12 px-4 py-2 text-sm text-amber-100">
                      {dayNewEntryCount} new
                    </div>
                  )}
                  <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-200">
                    {day.commitCount} change{day.commitCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {sortedEntries.map((entry) => (
                  <article
                    key={entry.hash}
                    className={`rounded-[1.35rem] border p-4 sm:p-5 ${entry.isBreakingChange
                      ? 'border-rose-300/30 bg-rose-500/10 shadow-[0_0_0_1px_rgba(251,113,133,0.08)]'
                      : 'border-white/10 bg-black/20'
                      }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${CHANGELOG_KIND_CLASSES[entry.kind]}`}
                        >
                          {CHANGELOG_KIND_LABELS[entry.kind]}
                        </span>
                        {entry.scope && (
                          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-300">
                            {entry.scope}
                          </span>
                        )}
                        {entry.isBreakingChange && (
                          <span className="rounded-full border border-rose-300/25 bg-rose-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-50">
                            Breaking Change
                          </span>
                        )}
                        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 font-mono text-xs text-slate-300">
                          {entry.shortHash}
                        </span>
                        {account && preferences && isUnreadChangelogEntry(entry.committedAt, changelogReadAt) && (
                          <span className="rounded-full border border-amber-300/20 bg-amber-300/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                            New
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-100 sm:text-base">
                      {entry.summary}
                    </p>

                    {entry.isBreakingChange && entry.breakingChangeNote && entry.breakingChangeNote !== entry.summary && (
                      <div className="mt-3 rounded-[1.1rem] border border-rose-300/20 bg-black/15 p-3 text-sm leading-6 text-rose-50/95">
                        <span className="mr-2 inline-flex rounded-full border border-rose-300/25 bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-50">
                          Impact
                        </span>
                        {entry.breakingChangeNote}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </PageCorpus>
  )
}

export default ChangelogScreen
