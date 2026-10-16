export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const DRAFT_AUTOSAVE_MS = 500

const PREFIX = 'bearminion:draft:'

export interface DraftRecord {
  draft: unknown
  savedAt: number
  baseHash: string
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

export interface DraftAssessment {
  offer: boolean
  conflict: boolean
}

/** Stable id so two projects served from localhost do not share drafts. */
export function projectId(root: string, siteName: string): string {
  const normalized = root.replace(/[\\/]+$/, '')
  return `${hashText(normalized)}-${hashText(siteName)}`
}

export function pageDraftKey(id: string, slug: string): string {
  return `${PREFIX}${id}:page:${slug}`
}

export function siteDraftKey(id: string): string {
  return `${PREFIX}${id}:site`
}

export function pageSavedKey(id: string, slug: string): string {
  return `${PREFIX}${id}:page:${slug}:saved`
}

export function siteSavedKey(id: string): string {
  return `${PREFIX}${id}:site:saved`
}

export function hashText(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function relativeDraftAge(savedAt: number, now: number): string {
  const delta = Math.max(0, now - savedAt)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < 45_000) return 'just now'
  if (delta < 90_000) return '1 minute ago'
  const minutes = Math.round(delta / minute)
  if (delta < 45 * minute) return `${minutes} minutes ago`
  if (delta < 90 * minute) return '1 hour ago'
  const hours = Math.round(delta / hour)
  if (delta < 22 * hour) return `${hours} hours ago`
  if (delta < 36 * hour) return '1 day ago'
  return `${Math.round(delta / day)} days ago`
}

export function draftBannerText(savedAt: number, now: number): string {
  return `Unsaved changes from ${relativeDraftAge(savedAt, now)}`
}

/** Another tab wrote the save notice for this page or site. */
export function savedNoticeFor(key: string, id: string, slug: string): 'page' | 'site' | null {
  if (key === pageSavedKey(id, slug)) return 'page'
  if (key === siteSavedKey(id)) return 'site'
  return null
}

export function assessStoredDraft(record: DraftRecord, diskJson: string): DraftAssessment {
  if (JSON.stringify(record.draft) === diskJson) return { offer: false, conflict: false }
  return { offer: true, conflict: record.baseHash !== hashText(diskJson) }
}

export function writeDraftRecord(storage: KeyValueStorage, key: string, record: DraftRecord): boolean {
  try {
    storage.setItem(key, JSON.stringify(record))
    return true
  } catch {
    return false
  }
}

export function writeSaveNotice(storage: KeyValueStorage, key: string, notice: { savedAt: number; tabId: string }): boolean {
  try {
    storage.setItem(key, JSON.stringify(notice))
    return true
  } catch {
    return false
  }
}

/** True when another tab saved this project recently. A tab ignores its own notice. */
export function isForeignSave(raw: string | null, tabId: string, now: number, maxAge = 60_000): boolean {
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown; tabId?: unknown }
    if (typeof parsed.savedAt !== 'number' || typeof parsed.tabId !== 'string') return false
    if (parsed.tabId === '' || parsed.tabId === tabId) return false
    const age = now - parsed.savedAt
    return age >= 0 && age <= maxAge
  } catch {
    return false
  }
}

export function readDraftRecord(storage: KeyValueStorage, key: string, now: number): DraftRecord | null {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  const record = parseDraftRecord(raw)
  if (!record || now - record.savedAt > DRAFT_TTL_MS) {
    removeDraft(storage, key)
    return null
  }
  return record
}

export function removeDraft(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Storage can be disabled or over quota. The editor keeps working.
  }
}

/** Drop expired Bearminion drafts so localStorage does not keep them forever. */
export function sweepExpiredDrafts(storage: KeyValueStorage, now: number): void {
  let keys: string[]
  try {
    keys = storage.keys()
  } catch {
    return
  }
  for (const key of keys) {
    if (!key.startsWith(PREFIX)) continue
    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      continue
    }
    if (!raw) continue
    let savedAt = Number.NaN
    try {
      const parsed = JSON.parse(raw) as { savedAt?: unknown }
      if (parsed && typeof parsed === 'object' && typeof parsed.savedAt === 'number') savedAt = parsed.savedAt
    } catch {
      savedAt = Number.NaN
    }
    if (!Number.isFinite(savedAt) || now - savedAt > DRAFT_TTL_MS) removeDraft(storage, key)
  }
}

export function localDraftStorage(): KeyValueStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
      keys: () => {
        const list: string[] = []
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index)
          if (key) list.push(key)
        }
        return list
      },
    }
  } catch {
    return null
  }
}

function parseDraftRecord(raw: string): DraftRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DraftRecord>
    if (typeof parsed !== 'object' || parsed === null) return null
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null
    if (typeof parsed.baseHash !== 'string' || parsed.baseHash === '') return null
    if (!('draft' in parsed)) return null
    return { draft: parsed.draft, savedAt: parsed.savedAt, baseHash: parsed.baseHash }
  } catch {
    return null
  }
}

export type ReloadDecision = 'defer' | 'prompt' | 'reload'

/** What to do when the dev server, Vite, or the editor asks to reload. */
export function reloadDecision(input: { dirty: boolean; saveInFlight: boolean }): ReloadDecision {
  if (input.saveInFlight) return 'defer'
  if (input.dirty) return 'prompt'
  return 'reload'
}
