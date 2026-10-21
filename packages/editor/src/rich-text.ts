/**
 * The subset the editor toolbar writes: paragraphs, line breaks, bold, italic, inline code (backticks),
 * links, and bulleted or numbered lists. Headings and images are not supported.
 * Stored as markdown. Rendered as a fixed set of tags, with text escaped.
 *
 * The output is always block content (`<p>`, `<ul>`, `<ol>`), so the element that holds it must accept blocks:
 * a `div` or a `blockquote`, never a `<p>` or a heading.
 */

const BLOCKED_PROTOCOL = /^(?:javascript|data|vbscript):/i

export function renderRichText(markdown: string): string {
  const blocks = markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .filter((block) => block.trim() !== '')
  return blocks
    .map((block) => renderBlock(block))
    .map((html) => (isListHtml(html) ? html : `<p>${html}</p>`))
    .join('')
}

/**
 * Pasted HTML, reduced to what a rich field can hold. The HTML is parsed (never inserted), read back as the
 * markdown subset, and rendered again, so only the renderer's own tags survive: no attributes, handlers or
 * elements from the clipboard reach the page. Headings and images are dropped. Browser only.
 */
export function sanitizeRichHtml(html: string): string {
  return renderRichText(markdownFromHtml(html))
}

/** Drop markdown headings and images from pasted plain text. */
export function stripPlainRich(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)\n]*\)/g, '').replace(/^#{1,6}[ \t]+.*$/gm, '')
}

function renderBlock(block: string): string {
  const lines = block.split('\n')
  const items = lines.map((line) => parseListItem(line.trim()))
  const filled = lines.every((line) => line.trim() !== '')
  if (filled && items.length > 0 && items.every((item) => item?.kind === 'ul')) {
    return `<ul>${items.map((item) => `<li>${renderInline(item?.text ?? '')}</li>`).join('')}</ul>`
  }
  if (filled && items.length > 0 && items.every((item) => item?.kind === 'ol')) {
    return `<ol>${items.map((item) => `<li>${renderInline(item?.text ?? '')}</li>`).join('')}</ol>`
  }
  return lines.map((line) => renderInline(line)).join('<br>')
}

function parseListItem(line: string): { kind: 'ul' | 'ol'; text: string } | null {
  const bullet = /^[-*]\s+(.*)$/.exec(line)
  if (bullet) return { kind: 'ul', text: bullet[1] ?? '' }
  const ordered = /^\d+\.\s+(.*)$/.exec(line)
  if (ordered) return { kind: 'ol', text: ordered[1] ?? '' }
  return null
}

function isListHtml(html: string): boolean {
  return html.startsWith('<ul') || html.startsWith('<ol')
}

/** True when a link URL is safe to put in an href. */
export function isSafeHref(url: string): boolean {
  return classifyHref(url) !== null
}

function renderInline(source: string): string {
  let index = 0
  let html = ''
  while (index < source.length) {
    if (source[index] === '`') {
      // Inline code is literal: nothing inside it is parsed, so `**` or a link in it stays as typed.
      const end = source.indexOf('`', index + 1)
      if (end > index + 1) {
        html += `<code>${escapeHtml(source.slice(index + 1, end))}</code>`
        index = end + 1
        continue
      }
    }
    if (source.startsWith('***', index)) {
      const end = source.indexOf('***', index + 3)
      if (end !== -1) {
        html += `<strong><em>${escapeHtml(source.slice(index + 3, end))}</em></strong>`
        index = end + 3
        continue
      }
    }
    if (source.startsWith('**', index)) {
      const end = source.indexOf('**', index + 2)
      if (end !== -1) {
        html += `<strong>${renderInline(source.slice(index + 2, end))}</strong>`
        index = end + 2
        continue
      }
    }
    if (source[index] === '*' && source[index + 1] !== '*') {
      const end = source.indexOf('*', index + 1)
      if (end !== -1 && source[end + 1] !== '*') {
        html += `<em>${renderInline(source.slice(index + 1, end))}</em>`
        index = end + 1
        continue
      }
    }
    if (source[index] === '[') {
      const link = readLink(source, index)
      if (link) {
        html += link.html
        index = link.end
        continue
      }
    }
    html += escapeHtml(source[index] ?? '')
    index += 1
  }
  return html
}

function readLink(source: string, start: number): { html: string; end: number } | null {
  const labelEnd = source.indexOf(']', start + 1)
  if (labelEnd === -1 || source[labelEnd + 1] !== '(') return null
  let depth = 1
  let cursor = labelEnd + 2
  while (cursor < source.length && depth > 0) {
    const char = source[cursor]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    cursor += 1
  }
  if (depth !== 0) return null
  const urlEnd = cursor - 1
  const label = renderInline(source.slice(start + 1, labelEnd))
  const href = classifyHref(source.slice(labelEnd + 2, urlEnd))
  let end = urlEnd + 1
  let flag: 'new' | 'same' | undefined
  if (source.startsWith('{new}', end)) {
    flag = 'new'
    end += 5
  } else if (source.startsWith('{same}', end)) {
    flag = 'same'
    end += 6
  }
  if (!href) return { html: label, end }
  const blank = flag === 'new' || (flag !== 'same' && href.external)
  const mode = flag === 'new' ? ' data-new-tab="true"' : flag === 'same' ? ' data-new-tab="false"' : ''
  const extra = blank ? ' target="_blank" rel="noopener noreferrer"' : ''
  return { html: `<a href="${escapeAttr(href.url)}"${mode}${extra}>${label}</a>`, end }
}

function classifyHref(url: string): { url: string; external: boolean } | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what this rejects.
  if (url === '' || /[\s"'<>`]/.test(url) || /[\u0000-\u001f]/.test(url)) return null
  if (BLOCKED_PROTOCOL.test(url.trim())) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(?:https?|mailto|tel):/i.test(url)) return null
  return { url, external: /^https?:\/\//i.test(url) }
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}

type Mark = 'strong' | 'em' | 'code' | 'link' | 'ul' | 'ol' | 'li' | 'block'

interface HtmlNode {
  mark: Mark | 'text' | 'root'
  href?: string
  newTab?: 'new' | 'same'
  text?: string
  children: HtmlNode[]
}

/**
 * Turn the formatted DOM of a rich field back into the stored markdown subset. The HTML is parsed with
 * `DOMParser`, which never runs scripts or loads resources. Browser only (the editor overlay).
 */
export function markdownFromHtml(html: string): string {
  return cleanup(serialize(parseHtml(html)))
}

/** Elements whose content is dropped with them. */
const DROPPED = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'object',
  'svg',
  'math',
  'img',
  'picture',
  'video',
  'audio',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
])

function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { mark: 'root', children: [] }
  const body = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html').body
  appendChildren(body, root)
  return root
}

function appendChildren(parent: Node, into: HtmlNode): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      into.children.push({ mark: 'text', text: child.nodeValue ?? '', children: [] })
      continue
    }
    if (child.nodeType !== ELEMENT_NODE) continue
    const element = child as Element
    const name = element.tagName.toLowerCase()
    if (DROPPED.has(name)) continue
    if (name === 'br') {
      into.children.push({ mark: 'text', text: '\n', children: [] })
      continue
    }
    const mark = blockOf(name) ?? markOf(name, element.getAttribute('style') ?? '')
    // An element the subset has no mark for (a plain span, a font tag) keeps its text.
    if (!mark) {
      appendChildren(element, into)
      continue
    }
    const tab = mark === 'link' ? element.getAttribute('data-new-tab') : null
    const node: HtmlNode = {
      mark,
      children: [],
      href: mark === 'link' ? (element.getAttribute('href') ?? '') : undefined,
      newTab: tab === 'true' ? 'new' : tab === 'false' ? 'same' : undefined,
    }
    into.children.push(node)
    appendChildren(element, node)
  }
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function blockOf(name: string): Mark | null {
  if (name === 'ul') return 'ul'
  if (name === 'ol') return 'ol'
  if (name === 'li') return 'li'
  if (name === 'p' || name === 'div' || name === 'blockquote') return 'block'
  return null
}

function markOf(name: string, style: string): Mark | null {
  if (name === 'strong' || name === 'b') return 'strong'
  if (name === 'em' || name === 'i') return 'em'
  if (name === 'code' || name === 'kbd' || name === 'samp') return 'code'
  if (name === 'a') return 'link'
  if (name === 'span') {
    if (/font-weight\s*:\s*(?:bold|[7-9]00)/i.test(style)) return 'strong'
    if (/font-style\s*:\s*italic/i.test(style)) return 'em'
  }
  return null
}

function serialize(node: HtmlNode): string {
  if (node.mark === 'root') return serializeFlow(node.children)
  return serializeInline(node)
}

function serializeFlow(nodes: readonly HtmlNode[]): string {
  let out = ''
  for (const node of nodes) {
    if (node.mark === 'ul' || node.mark === 'ol') {
      const list = serializeList(node)
      if (list === '') continue
      if (out.trim() !== '' && !out.endsWith('\n\n')) out = out.replace(/\n*$/, '\n\n')
      out += `${list}\n\n`
      continue
    }
    if (node.mark === 'block') {
      const inner = serializeFlow(node.children).replace(/\n+$/, '')
      if (inner === '') continue
      if (out.trim() !== '' && !out.endsWith('\n\n')) out = out.replace(/\n*$/, '\n\n')
      out += `${inner}\n\n`
      continue
    }
    out += serializeInline(node)
  }
  return out
}

function serializeList(node: HtmlNode): string {
  const items = node.children.filter((child) => child.mark === 'li')
  return items
    .map((item, index) => {
      const text = listItemText(item).replace(/\n+/g, ' ').trim()
      return node.mark === 'ol' ? `${index + 1}. ${text}` : `- ${text}`
    })
    .join('\n')
}

function listItemText(node: HtmlNode): string {
  return node.children
    .map((child) => {
      if (child.mark === 'ul' || child.mark === 'ol') return serializeList(child)
      if (child.mark === 'block') return serializeFlow(child.children)
      return serializeInline(child)
    })
    .join('')
}

function serializeInline(node: HtmlNode): string {
  if (node.mark === 'text') return node.text ?? ''
  if (node.mark === 'code') {
    // Code holds plain text only. A backtick inside would end it early, and a line break cannot be in it.
    const text = plainText(node).replace(/`/g, '').replace(/\n+/g, ' ')
    return text.trim() === '' ? text : `\`${text}\``
  }
  if (node.mark === 'ul' || node.mark === 'ol') return serializeList(node)
  if (node.mark === 'li' || node.mark === 'block' || node.mark === 'root') return serializeFlow(node.children)
  const inner = node.children.map((child) => serializeInline(child)).join('')
  if (!inner) return ''
  if (node.mark === 'strong') return `**${inner}**`
  if (node.mark === 'em') return `*${inner}*`
  if (node.mark === 'link') {
    const href = node.href ?? ''
    if (!isSafeHref(href)) return inner
    const flag = node.newTab === 'new' ? '{new}' : node.newTab === 'same' ? '{same}' : ''
    return `[${inner}](${href})${flag}`
  }
  return inner
}

function plainText(node: HtmlNode): string {
  if (node.mark === 'text') return node.text ?? ''
  return node.children.map((child) => plainText(child)).join('')
}

function cleanup(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface RichLinkSpan {
  label: string
  href: string
  /** True when the link opens in a new window, including external links that do so by default. */
  newTab: boolean
}

/** The nth markdown link, in source order. */
export function richLinkAt(markdown: string, index: number): RichLinkSpan | null {
  return listRichLinks(markdown)[index] ?? null
}

/** Replace the nth markdown link. The label stays plain text. */
export function updateRichLink(markdown: string, index: number, next: { label: string; href: string; newTab: boolean }): string {
  const spans = locateRichLinks(markdown)
  const span = spans[index]
  if (!span || !isSafeHref(next.href)) return markdown
  const label = next.label.replace(/[[\]]/g, '')
  const external = /^https?:\/\//i.test(next.href)
  const flag = next.newTab ? '{new}' : external ? '{same}' : ''
  return `${markdown.slice(0, span.start)}[${label}](${next.href})${flag}${markdown.slice(span.end)}`
}

function listRichLinks(markdown: string): RichLinkSpan[] {
  return locateRichLinks(markdown).map((span) => ({
    label: span.label,
    href: span.href,
    newTab: span.flag === 'new' || (span.flag !== 'same' && /^https?:\/\//i.test(span.href)),
  }))
}

function locateRichLinks(source: string): { start: number; end: number; label: string; href: string; flag?: 'new' | 'same' }[] {
  const found: { start: number; end: number; label: string; href: string; flag?: 'new' | 'same' }[] = []
  let index = 0
  while (index < source.length) {
    if (source[index] === '[') {
      const span = readLinkSpan(source, index)
      if (span) {
        found.push(span)
        index = span.end
        continue
      }
    }
    index += 1
  }
  return found
}

function readLinkSpan(
  source: string,
  start: number,
): { start: number; end: number; label: string; href: string; flag?: 'new' | 'same' } | null {
  const labelEnd = source.indexOf(']', start + 1)
  if (labelEnd === -1 || source[labelEnd + 1] !== '(') return null
  let depth = 1
  let cursor = labelEnd + 2
  while (cursor < source.length && depth > 0) {
    const char = source[cursor]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    cursor += 1
  }
  if (depth !== 0) return null
  const urlEnd = cursor - 1
  const href = source.slice(labelEnd + 2, urlEnd)
  if (!isSafeHref(href)) return null
  let end = urlEnd + 1
  let flag: 'new' | 'same' | undefined
  if (source.startsWith('{new}', end)) {
    flag = 'new'
    end += 5
  } else if (source.startsWith('{same}', end)) {
    flag = 'same'
    end += 6
  }
  return { start, end, label: source.slice(start + 1, labelEnd), href, flag }
}
