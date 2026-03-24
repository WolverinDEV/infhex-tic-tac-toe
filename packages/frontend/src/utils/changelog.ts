import type { ChangelogDay, ChangelogEntry, ChangelogEntryKind } from '@ih3t/shared'
import { formatDateTime, formatUtcCalendarDate } from './dateTime'

export function formatChangelogDate(value: string) {
  return formatUtcCalendarDate(value)
}

export function formatChangelogGeneratedAt(value: string) {
  return formatDateTime(new Date(value))
}

export function getLatestChangelogCommitAt(changelogDays: ChangelogDay[]) {
  return changelogDays.flatMap((day) => day.entries).reduce(
    (highestValue, entry) => Math.max(highestValue, entry.committedAt),
    0
  )
}

export function isUnreadChangelogEntry(entryCommittedAt: number, changelogReadAt: number | null) {
  return changelogReadAt === null || entryCommittedAt > changelogReadAt
}

export function countUnreadChangelogEntries(changelogDays: ChangelogDay[], changelogReadAt: number | null) {
  return changelogDays.reduce(
    (total, day) => total + day.entries.filter((entry: ChangelogEntry) => isUnreadChangelogEntry(entry.committedAt, changelogReadAt)).length,
    0
  )
}

export function countBreakingChanges(changelogDays: ChangelogDay[]) {
  return changelogDays.reduce(
    (total, day) => total + day.entries.filter((entry: ChangelogEntry) => entry.isBreakingChange).length,
    0
  )
}

export function sortChangelogEntries(
  entries: ChangelogDay['entries'],
  changelogReadAt: number | null,
  hasTrackedReadState: boolean
) {
  const kindOrder: Record<ChangelogEntryKind, number> = {
    feature: 0,
    fix: 1,
    maintenance: 2,
    other: 3
  }

  return [...entries].sort((leftEntry, rightEntry) => {
    const leftIsNew = hasTrackedReadState && isUnreadChangelogEntry(leftEntry.committedAt, changelogReadAt)
    const rightIsNew = hasTrackedReadState && isUnreadChangelogEntry(rightEntry.committedAt, changelogReadAt)
    if (leftIsNew !== rightIsNew) {
      return leftIsNew ? -1 : 1
    }

    const kindDifference = kindOrder[leftEntry.kind] - kindOrder[rightEntry.kind]
    if (kindDifference !== 0) {
      return kindDifference
    }

    return rightEntry.committedAt - leftEntry.committedAt
  })
}
