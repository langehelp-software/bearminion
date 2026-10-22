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
