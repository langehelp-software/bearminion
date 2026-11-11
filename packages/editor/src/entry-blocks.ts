import type { Nodes, Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

/**
 * The body of a Markdown entry as top-level blocks that join back into the exact source.
 *
 * `parseBody` records each block's source text and the whitespace before it. `applyBlocks` rebuilds the body from a
 * list of edits: a block that is not edited is written back as its original text, so no serializer ever touches it.
 * A block the editor cannot represent (HTML, MDX, footnotes, reference definitions, directives, and any block holding
 * such a construct inside) is `editable: false`: the editor shows its source and only passes it through.
 * Pure: no Node, Astro or Vite imports.
 */

export interface SourceBlock {
  /** Stable within one parse: `b0`, `b1`, ... in source order. */
  id: string
  /** The mdast node type: `paragraph`, `heading`, `list`, `code`, `html`, ... */
  type: string
  /** The block's exact source text. */
  raw: string
  /** Whitespace (blank lines) between the previous block, or the start of the body, and this block. */
  leading: string
  /** False for a block the editor must carry as locked source instead of editing as rich text. */
  editable: boolean
}

export interface ParsedBody {
  blocks: SourceBlock[]
  /** Whitespace after the last block. For an empty body, the whole body. */
  trailing: string
  eol: '\n' | '\r\n'
}

export interface ParseOptions {
  /** `.mdx` entries: JSX, `import` / `export` and `{expressions}` make a block locked. */
  mdx?: boolean
}

/** One block of the edited body, in its new order. */
export type BlockEdit =
  /** A block kept as it was. */
  | { id: string; markdown?: undefined }
  /** An existing block with new content, or (without `id`) a new block. */
  | { id?: string; markdown: string }

const EDITABLE = new Set(['paragraph', 'heading', 'list', 'blockquote', 'code', 'thematicBreak', 'table'])
const OPAQUE_INSIDE = new Set([
  'html',
  'footnoteReference',
  'footnoteDefinition',
  'linkReference',
  'imageReference',
  'definition',
  'yaml',
  'toml',
  'math',
  'inlineMath',
])

function textOf(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  if ('children' in node) return (node.children as Nodes[]).map(textOf).join('')
  return ''
}

function holdsOpaque(node: Nodes): boolean {
  if (OPAQUE_INSIDE.has(node.type)) return true
  if ('children' in node) return (node.children as Nodes[]).some(holdsOpaque)
  return false
}

function isEditable(node: Nodes, raw: string, options: ParseOptions): boolean {
  if (!EDITABLE.has(node.type)) return false
  if (holdsOpaque(node)) return false
  // Directives (`:::note`) and attribute blocks parse as plain paragraphs.
  if (node.type === 'paragraph' && /^:{2,}/m.test(raw)) return false
  if (options.mdx && node.type !== 'code') {
    const text = textOf(node)
    if (/^\s*(?:import|export)\s/.test(raw) || /[{}<]/.test(text) || /[{<]/.test(raw)) return false
  }
  return true
}

/** Parses a body (the text after the frontmatter). `body === joinBody(parseBody(body))`. */
export function parseBody(body: string, options: ParseOptions = {}): ParsedBody {
  const eol = body.includes('\r\n') ? '\r\n' : '\n'
  const tree: Root = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  const blocks: SourceBlock[] = []
  let cursor = 0
  for (const node of tree.children) {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) continue
    const raw = body.slice(start, end)
    blocks.push({
      id: `b${blocks.length}`,
      type: node.type,
      raw,
      leading: body.slice(cursor, start),
      editable: isEditable(node, raw, options),
    })
    cursor = end
  }
  return { blocks, trailing: body.slice(cursor), eol }
}

export function joinBody(parsed: ParsedBody): string {
  return parsed.blocks.map((block) => block.leading + block.raw).join('') + parsed.trailing
}

function withEol(text: string, eol: string): string {
  return eol === '\n' ? text : text.replace(/\r?\n/g, eol)
}

/**
 * Rebuilds the body from `edits`, the blocks in their new order.
 *
 * - `{ id }`: the original text, byte for byte.
 * - `{ id, markdown }`: the block replaced by `markdown`.
 * - `{ markdown }`: a new block.
 *
 * Whitespace between two blocks that were already neighbours is kept. Around anything moved, inserted or after a
 * deletion it is one blank line. The first block keeps the body's original leading whitespace and the body keeps its
 * trailing whitespace, so deleting the first block or appending a block does not disturb the rest.
 */
export function applyBlocks(parsed: ParsedBody, edits: readonly BlockEdit[]): string {
  const known = new Map(parsed.blocks.map((block, index) => [block.id, { block, index }]))
  const blank = parsed.eol + parsed.eol
  const firstLeading = parsed.blocks[0]?.leading ?? ''
  let out = ''
  let previous: number | null = null
  edits.forEach((edit, position) => {
    const original = edit.id === undefined ? undefined : known.get(edit.id)
    if (edit.id !== undefined && !original) throw new Error(`Unknown block id "${edit.id}".`)
    const text = edit.markdown === undefined ? (original?.block.raw ?? '') : withEol(edit.markdown, parsed.eol).replace(/(?:\r?\n)+$/, '')
    const neighbour = original !== undefined && previous !== null && original.index === previous + 1
    const leading = position === 0 ? firstLeading : neighbour ? (original?.block.leading ?? blank) : blank
    out += leading + text
    previous = original ? original.index : null
  })
  if (parsed.blocks.length === 0 && out !== '') return out + (parsed.trailing === '' ? parsed.eol : parsed.trailing)
  return out + parsed.trailing
}
