import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { slugSchema } from './page.js'

export const JSON_BODY_LIMIT = 1_048_576
export const IMAGE_BYTE_LIMIT = 5 * 1_048_576
/** Room for multipart boundaries around a max-size image. */
export const MULTIPART_BODY_LIMIT = IMAGE_BYTE_LIMIT + 256 * 1024

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export function asDirectory(root: string | URL): string {
  if (root instanceof URL) {
    return fileURLToPath(root)
  }
  if (root.startsWith('file:')) {
    return fileURLToPath(root)
  }
  return path.resolve(root)
}

export function resolveDir(root: string, value: string | undefined, fallback: string): string {
  const chosen = value ?? fallback
  return path.isAbsolute(chosen) ? path.resolve(chosen) : path.resolve(root, chosen)
}

/** True when `candidate` is `root` or a path inside it. */
export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

/** Resolve `parts` under `root`, or return null when the result escapes `root`. */
export function resolveInside(root: string, ...parts: string[]): string | null {
  const target = path.resolve(root, ...parts)
  return isInside(root, target) ? target : null
}

export function hostnameFromHostHeader(host: string | null): string | null {
  if (host === null) return null
  const trimmed = host.trim().toLowerCase()
  if (trimmed === '') return null
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end <= 1) return null
    return trimmed.slice(1, end)
  }
  const colon = trimmed.lastIndexOf(':')
  if (colon === -1) return trimmed
  const maybePort = trimmed.slice(colon + 1)
  if (/^\d+$/.test(maybePort)) return trimmed.slice(0, colon)
  return trimmed
}

export function isLocalHostname(hostname: string | null): boolean {
  return hostname !== null && LOCAL_HOSTS.has(hostname)
}

export function isLocalAddress(address: string | null | undefined): boolean {
  if (!address) return false
  const normalized = address.toLowerCase().replace(/^::ffff:/, '')
  return normalized === '127.0.0.1' || normalized === '::1'
}

/**
 * Allow the request when Host is local and, if Origin is present, its host is local. When the browser sends
 * `Sec-Fetch-Site`, it must be `same-origin` or `none` (typed in, or a tool such as curl), so a page on another
 * site cannot even read-probe the API with a no-cors GET, which carries no Origin.
 * When `remoteAddress` is provided it must be a loopback address. Omit it only in tests
 * that do not model a socket; the dev middleware always passes it.
 */
export function isLocalRequest(headers: Headers, remoteAddress?: string | null): boolean {
  if (!isLocalHostname(hostnameFromHostHeader(headers.get('host')))) return false
  const site = headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin' && site !== 'none') return false
  const origin = headers.get('origin')
  if (origin !== null) {
    let hostname: string
    try {
      hostname = new URL(origin).hostname.toLowerCase()
    } catch {
      return false
    }
    if (!isLocalHostname(hostname)) return false
  }
  if (remoteAddress !== undefined && !isLocalAddress(remoteAddress)) return false
  return true
}

/** Decode one URL segment and accept it only when it is a content slug. */
export function readSlug(segment: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) {
    return null
  }
  const parsed = slugSchema.safeParse(decoded)
  return parsed.success ? parsed.data : null
}
