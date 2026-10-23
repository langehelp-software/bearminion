import { z } from 'zod'

/** JSON-LD blocks as a page stores them: parsed, so diffs stay readable and output can be escaped safely. */
export type JsonLdBlock = Record<string, unknown>

export type JsonLdResult = { ok: true; value: JsonLdBlock[] } | { ok: false; error: string }

/** What generators hand out: the JSON wrapped in its own script tag. */
const SCRIPT_WRAPPER = /^\s*<script\b[^>]*\bapplication\/ld\+json\b[^>]*>([\s\S]*?)<\/script\s*>\s*$/i

/**
 * Parses what a person pastes into the JSON-LD box: an object, an array of objects, or either one inside a
 * `<script type="application/ld+json">` tag. Empty input is valid and means "no custom JSON-LD".
 */
export function parseJsonLdInput(raw: string): JsonLdResult {
  const body = (SCRIPT_WRAPPER.exec(raw)?.[1] ?? raw).trim()
  if (body === '') return { ok: true, value: [] }
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' }
  }
  const items: unknown[] = Array.isArray(data) ? data : [data]
  if (items.length === 0) return { ok: true, value: [] }
  if (!items.every(isBlock)) return { ok: false, error: 'JSON-LD must be an object or an array of objects.' }
  return { ok: true, value: items }
}

/** The text shown in the editor box: one block as an object, several as an array, none as empty. */
export function formatJsonLd(blocks: readonly JsonLdBlock[] | undefined): string {
  if (!blocks || blocks.length === 0) return ''
  return JSON.stringify(blocks.length === 1 ? blocks[0] : blocks, null, 2)
}

/** Advice, not errors: a block without `@type` or `@context` is usually a paste mistake, but Google decides what it accepts. */
export function jsonLdWarnings(blocks: readonly JsonLdBlock[]): string[] {
  const warnings: string[] = []
  blocks.forEach((block, index) => {
    const name = blocks.length === 1 ? 'The block' : `Block ${index + 1}`
    if (!('@context' in block)) warnings.push(`${name} has no @context. Search engines expect "https://schema.org".`)
    if (!('@type' in block) && !('@graph' in block)) warnings.push(`${name} has no @type.`)
  })
  return warnings
}

function isBlock(value: unknown): value is JsonLdBlock {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Custom structured data. At most 10 blocks and 50 KB, so a stray paste cannot bloat every page. */
export const jsonLdSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(10)
  .refine((blocks) => JSON.stringify(blocks).length <= 50_000, 'JSON-LD is limited to 50 KB')

/** The `@id` the generated site blocks use, so a page's markup can point at them. */
export interface SiteJsonLdIds {
  organization: string
  website: string
}

/** `<site.url>/#organization` and `<site.url>/#website`, with trailing slashes on the site URL ignored. */
export function siteJsonLdIds(siteUrl: string): SiteJsonLdIds {
  const base = siteUrl.replace(/\/+$/, '')
  return { organization: `${base}/#organization`, website: `${base}/#website` }
}

function blockId(block: JsonLdBlock): string | undefined {
  const id = block['@id']
  return typeof id === 'string' ? id : undefined
}

/** Whether a block with this `@id` is in the list. */
export function hasJsonLdId(blocks: readonly JsonLdBlock[] | undefined, id: string): boolean {
  return (blocks ?? []).some((block) => blockId(block) === id)
}

/**
 * The blocks a page emits: every site block, then the page's own. A block with the same `@id` is
 * emitted once and the page's copy wins, so a page can refine what the site says without repeating it.
 */
export function mergeJsonLd(site: readonly JsonLdBlock[] | undefined, page: readonly JsonLdBlock[]): JsonLdBlock[] {
  const taken = new Set(page.map(blockId).filter((id): id is string => id !== undefined))
  const kept = (site ?? []).filter((block) => {
    const id = blockId(block)
    return id === undefined || !taken.has(id)
  })
  return [...kept, ...page]
}

/** What the Generate button reads from the site settings. */
export interface SiteJsonLdSource {
  name: string
  url: string
  /** BCP 47 tag. Default `en`. */
  lang?: string
  /** An absolute https address. Local images get their address at build time, so they cannot go here. */
  logo?: string
}

/** An `Organization` and a `WebSite` block for the site, in the `@id` convention of {@link siteJsonLdIds}. */
export function generateSiteJsonLd(source: SiteJsonLdSource): JsonLdBlock[] {
  const ids = siteJsonLdIds(source.url)
  const url = `${source.url.replace(/\/+$/, '')}/`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': ids.organization,
      name: source.name,
      url,
      ...(source.logo ? { logo: source.logo } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': ids.website,
      name: source.name,
      url,
      inLanguage: source.lang || 'en',
    },
  ]
}

/** Puts generated blocks into a list: a block with the same `@id` is replaced in place, the rest is kept. */
export function upsertJsonLd(blocks: readonly JsonLdBlock[], generated: readonly JsonLdBlock[]): JsonLdBlock[] {
  const next = [...blocks]
  for (const block of generated) {
    const id = blockId(block)
    const at = id === undefined ? -1 : next.findIndex((item) => blockId(item) === id)
    if (at >= 0) next[at] = block
    else next.push(block)
  }
  return next
}

/** True while the site URL is still the template's `example.com` placeholder. */
export function isPlaceholderSiteUrl(siteUrl: string): boolean {
  try {
    const host = new URL(siteUrl).hostname.toLowerCase()
    return host === 'example.com' || host.endsWith('.example.com')
  } catch {
    return false
  }
}
