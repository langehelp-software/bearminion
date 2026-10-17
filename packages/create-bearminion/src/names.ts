import path from 'node:path'

const FALLBACK_PACKAGE = 'my-site'

/** An npm package name for the site from its folder: lowercase, `-` for anything npm does not allow. */
export function toPackageName(directory: string): string {
  const base = path.basename(path.resolve(directory))
  const name = base
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+/, '')
    .replace(/-+$/, '')
    .replace(/-{2,}/g, '-')
  return name.length > 0 && name.length <= 214 ? name : FALLBACK_PACKAGE
}

/** A readable site name from the folder: `my-coffee-shop` becomes `My Coffee Shop`. */
export function toSiteName(directory: string): string {
  const words = path
    .basename(path.resolve(directory))
    .split(/[-_\s.]+/)
    .filter(Boolean)
  if (words.length === 0) return 'My Site'
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * The site's public address as `site.json` stores it, or `null` when it is not a usable http(s) address.
 * A bare domain gets `https://`; a trailing slash is dropped.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  // A host needs a dot (example.com) unless it is localhost, which is fine for testing.
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
  if (url.search || url.hash || url.username || url.password) return null
  const pathname = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${pathname}`
}
