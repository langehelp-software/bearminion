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

/**
 * The same choice as a cookie on the site's domain, so sibling sites (`example.com`, `docs.example.com`) ask once.
 * It holds the visitor's answer and nothing else, so it needs no consent itself. See `consentDomain()` in consent.ts.
 */
export function readChoiceCookie(cookies: string): string | null {
  for (const pair of cookies.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1 || pair.slice(0, separator).trim() !== CONSENT_KEY) continue
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

/** A `document.cookie` assignment that stores `value` for `domain` and its subdomains, as long as the choice lasts. */
export function choiceCookie(value: string, domain: string, secure: boolean): string {
  const maxAge = Math.floor(CONSENT_MAX_AGE_MS / 1000)
  return `${CONSENT_KEY}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; Domain=${domain}; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** Whether a page on `hostname` can share a cookie on `domain`: it is the domain or one of its subdomains. */
export function sharesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase()
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * The domains a cookie for `hostname` could be set on, broadest first: `docs.example.co.uk` gives `co.uk`,
 * `example.co.uk`, `docs.example.co.uk`. The browser refuses public suffixes (`co.uk`, `vercel.app`), so the first
 * one it accepts is the site's own domain. Empty for hosts with no domain: localhost, IP addresses.
 */
export function domainCandidates(hostname: string): string[] {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return []
  const labels = host.split('.')
  return labels.slice(0, -1).map((_, index) => labels.slice(labels.length - 2 - index).join('.'))
}
