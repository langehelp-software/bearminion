// The visitor's stored choice. No imports, so the banner's script ships without the rest of the library.

export const CONSENT_KEY = 'bm-consent'
/** Bump to ask everyone again. */
export const CONSENT_VERSION = 1
/** A choice is asked again after this long. */
export const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000

export interface ConsentChoice {
  v: number
  analytics: boolean
  at: number
}

export function serializeChoice(analytics: boolean, now: number): string {
  return JSON.stringify({ v: CONSENT_VERSION, analytics, at: now } satisfies ConsentChoice)
}

/** The stored choice, or `null` when there is none, it is unreadable, it is from an older version, or it has expired. */
export function parseChoice(raw: string | null, now: number): ConsentChoice | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { v, analytics, at } = value as Record<string, unknown>
    if (v !== CONSENT_VERSION || typeof analytics !== 'boolean' || typeof at !== 'number') return null
    if (at > now || now - at >= CONSENT_MAX_AGE_MS) return null
    return { v, analytics, at }
  } catch {
    return null
  }
}
