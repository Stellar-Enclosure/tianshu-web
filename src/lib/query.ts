const PURE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ZONED_INSTANT_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i
const MAX_WORKBENCH_SNAPSHOTS = 64

export const buildQuery = (values: Record<string, string | number | boolean | undefined | null>): string => {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value).trim())
    }
  })
  return params.toString()
}

export const formatTime = (value?: string | null, locale = 'zh-CN', timeZone?: string): string => {
  if (!value) return '—'
  const trimmed = value.trim()
  if (!trimmed) return '—'
  if (PURE_DATE_PATTERN.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number)
    const utc = new Date(Date.UTC(year, month - 1, day))
    if (utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day) {
      return trimmed
    }
    return '—'
  }
  if (!ZONED_INSTANT_PATTERN.test(trimmed)) {
    return '—'
  }
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    const resolvedZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      ...(resolvedZone ? { timeZone: resolvedZone } : {}),
    }).format(date)
  } catch {
    return '—'
  }
}

const workbenchSnapshots = new Map<string, unknown>()
let activeSnapshotSession = ''

export const makeWorkbenchSnapshotKey = (sessionScope: string, pageKey: string): string =>
  `${sessionScope}::${pageKey}`

export const syncWorkbenchSnapshotSession = (sessionScope: string): void => {
  if (activeSnapshotSession && activeSnapshotSession !== sessionScope) {
    workbenchSnapshots.clear()
  }
  activeSnapshotSession = sessionScope
}

export const readWorkbenchSnapshot = <T,>(key: string): T | undefined => {
  if (!key) return undefined
  const value = workbenchSnapshots.get(key) as T | undefined
  if (value !== undefined) {
    workbenchSnapshots.delete(key)
    workbenchSnapshots.set(key, value)
  }
  return value
}

export const writeWorkbenchSnapshot = <T,>(key: string, value: T): void => {
  if (!key) return
  if (workbenchSnapshots.has(key)) {
    workbenchSnapshots.delete(key)
  } else if (workbenchSnapshots.size >= MAX_WORKBENCH_SNAPSHOTS) {
    const oldest = workbenchSnapshots.keys().next().value
    if (oldest !== undefined) workbenchSnapshots.delete(oldest)
  }
  workbenchSnapshots.set(key, value)
}

export const deleteWorkbenchSnapshot = (key: string): void => {
  if (!key) return
  workbenchSnapshots.delete(key)
}

export const clearWorkbenchSnapshots = (): void => {
  workbenchSnapshots.clear()
  activeSnapshotSession = ''
}
