import type { ChangelogDay } from '@ih3t/shared'

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
    (total, day) => total + day.entries.filter((entry) => isUnreadChangelogEntry(entry.committedAt, changelogReadAt)).length,
    0
  )
}
