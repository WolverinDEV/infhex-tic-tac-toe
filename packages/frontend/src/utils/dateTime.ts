type DateTimeValue = Date | number

function toDate(value: DateTimeValue) {
  return value instanceof Date ? value : new Date(value)
}

function toTimestamp(value: DateTimeValue) {
  return toDate(value).getTime()
}

export function formatDateTime(value: DateTimeValue) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(toDate(value))
}

export function formatCalendarDate(value: DateTimeValue) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium'
  }).format(toDate(value))
}

export function formatDateTimeWithSeconds(value: DateTimeValue) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(toDate(value))
}

export function formatChartDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric'
  }).format(value)
}

export function formatRelativeTimeFrom(value: DateTimeValue, referenceValue: DateTimeValue) {
  const diffMs = toTimestamp(value) - toTimestamp(referenceValue)
  const absDiffMs = Math.abs(diffMs)
  const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'always'
  })

  if (absDiffMs < 60_000) {
    return diffMs <= 0 ? 'just now' : 'in a moment'
  }

  if (absDiffMs < 3_600_000) {
    return relativeFormatter.format(Math.trunc(diffMs / 60_000), 'minute')
  }

  if (absDiffMs < 86_400_000) {
    return relativeFormatter.format(Math.trunc(diffMs / 3_600_000), 'hour')
  }

  if (absDiffMs < 604_800_000) {
    return relativeFormatter.format(Math.trunc(diffMs / 86_400_000), 'day')
  }

  if (absDiffMs < 2_592_000_000) {
    return relativeFormatter.format(Math.trunc(diffMs / 604_800_000), 'week')
  }

  if (absDiffMs < 31_536_000_000) {
    return relativeFormatter.format(Math.trunc(diffMs / 2_592_000_000), 'month')
  }

  return relativeFormatter.format(Math.trunc(diffMs / 31_536_000_000), 'year')
}

export function formatUtcCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}
