/**
 * Inline marks for headings and the site wordmark.
 * A heading stays a plain string. Marks name ranges inside it.
 * No HTML and no arbitrary CSS: each mark is a weight, italic, and/or a font token.
 */

export const fontMarks = ['sans', 'serif', 'mono'] as const
export const weightMarks = ['regular', 'medium', 'semibold', 'bold'] as const

export type FontMark = (typeof fontMarks)[number]
export type WeightMark = (typeof weightMarks)[number]

export interface TextMark {
  start: number
  end: number
  weight?: WeightMark
  italic?: boolean
  font?: FontMark
}

export interface TextRun {
  text: string
  weight?: WeightMark
  italic?: boolean
  font?: FontMark
}

const fonts = new Set<string>(fontMarks)
const weights = new Set<string>(weightMarks)

export function isFontMark(value: unknown): value is FontMark {
  return typeof value === 'string' && fonts.has(value)
}

export function isWeightMark(value: unknown): value is WeightMark {
  return typeof value === 'string' && weights.has(value)
}

/** The legacy `em` / `nameEm` accent: Instrument Serif italic on that substring. */
export function marksFromEmphasis(text: string, em: string | undefined): TextMark[] | undefined {
  if (!em) return undefined
  const start = text.indexOf(em)
  if (start < 0) return undefined
  return [{ start, end: start + em.length, italic: true, font: 'serif' }]
}

export function markHasStyle(mark: Pick<TextMark, 'weight' | 'italic' | 'font'>): boolean {
  return mark.weight !== undefined || mark.italic === true || mark.font !== undefined
}

/** Drop marks that fall outside the text or carry no style. */
export function clampMarks(text: string, marks: readonly TextMark[] | undefined): TextMark[] {
  if (!marks || marks.length === 0) return []
  return marks
    .map((mark) => ({
      ...mark,
      start: Math.max(0, Math.trunc(mark.start)),
      end: Math.min(text.length, Math.trunc(mark.end)),
    }))
    .filter((mark) => mark.end > mark.start && markHasStyle(mark))
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

/**
 * Shift marks across a plain-text edit.
 * A mark that still names a unique substring is kept when the edit overlaps it.
 */
export function reconcileMarks(previous: string, next: string, marks: readonly TextMark[] | undefined): TextMark[] {
  const source = clampMarks(previous, marks)
  if (source.length === 0) return []
  if (previous === next) return source
  let prefix = 0
  const limit = Math.min(previous.length, next.length)
  while (prefix < limit && previous[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const delta = next.length - previous.length
  const changeEnd = previous.length - suffix
  const shifted = source.flatMap((mark) => {
    if (mark.end <= prefix) return [mark]
    if (mark.start >= changeEnd) return [{ ...mark, start: mark.start + delta, end: mark.end + delta }]
    return []
  })
  const clamped = clampMarks(next, shifted)
  if (clamped.length > 0 || source.length !== 1) return clamped
  const only = source[0]
  if (!only) return clamped
  const slice = previous.slice(only.start, only.end)
  if (slice.length === 0) return clamped
  const at = next.indexOf(slice)
  if (at < 0 || next.indexOf(slice, at + 1) !== -1) return clamped
  return [{ ...only, start: at, end: at + slice.length }]
}

export type MarkPatch = {
  weight?: WeightMark
  italic?: boolean
  font?: FontMark
}

/** Apply one style to [start, end), keeping styles on either side of the range. */
export function applyTextMark(
  text: string,
  marks: readonly TextMark[] | undefined,
  start: number,
  end: number,
  patch: MarkPatch,
): TextMark[] {
  const from = Math.max(0, Math.trunc(start))
  const to = Math.min(text.length, Math.trunc(end))
  const current = clampMarks(text, marks)
  if (to <= from) return current
  const pieces: TextMark[] = []
  let covering: TextMark | undefined
  for (const mark of current) {
    if (mark.end <= from || mark.start >= to) {
      pieces.push(mark)
      continue
    }
    covering ??= mark
    if (mark.start < from) pieces.push({ ...mark, end: from })
    if (mark.end > to) pieces.push({ ...mark, start: to })
  }
  const next: TextMark = {
    start: from,
    end: to,
    weight: 'weight' in patch ? patch.weight : covering?.weight,
    italic: 'italic' in patch ? patch.italic : covering?.italic,
    font: 'font' in patch ? patch.font : covering?.font,
  }
  if (next.italic !== true) delete next.italic
  if (next.weight === undefined) delete next.weight
  if (next.font === undefined) delete next.font
  if (markHasStyle(next)) pieces.push(next)
  return clampMarks(text, pieces)
}

export function splitMarkedText(text: string, marks: readonly TextMark[] | undefined): TextRun[] {
  const sorted = clampMarks(text, marks)
  const runs: TextRun[] = []
  let cursor = 0
  for (const mark of sorted) {
    if (mark.start < cursor) continue
    if (mark.start > cursor) runs.push({ text: text.slice(cursor, mark.start) })
    runs.push({
      text: text.slice(mark.start, mark.end),
      weight: mark.weight,
      italic: mark.italic,
      font: mark.font,
    })
    cursor = mark.end
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) })
  return runs.filter((run) => run.text.length > 0)
}

/** Classes from the typography tokens: font-sans/serif/mono and the weight scale. */
export function markClass(run: Pick<TextRun, 'weight' | 'italic' | 'font'>): string {
  const classes: string[] = []
  if (run.font === 'sans') classes.push('font-sans')
  else if (run.font === 'mono') classes.push('font-mono')
  else if (run.font === 'serif' || run.italic) classes.push('font-serif')
  if (run.italic && (run.font === undefined || run.font === 'serif')) classes.push('bm-em')
  else if (run.italic) classes.push('italic')
  if (run.weight === 'regular') classes.push('font-normal')
  else if (run.weight === 'medium') classes.push('font-medium')
  else if (run.weight === 'semibold') classes.push('font-semibold')
  else if (run.weight === 'bold') classes.push('font-bold')
  return classes.join(' ')
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function renderMarkedHtml(text: string, marks: readonly TextMark[] | undefined): string {
  return splitMarkedText(text, marks)
    .map((run) => {
      const cls = markClass(run)
      return cls ? `<span class="${cls}">${escapeHtml(run.text)}</span>` : escapeHtml(run.text)
    })
    .join('')
}

export function marksOverlap(marks: readonly TextMark[]): boolean {
  const sorted = [...marks].sort((a, b) => a.start - b.start || a.end - b.end)
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const mark = sorted[index]
    if (previous && mark && mark.start < previous.end) return true
  }
  return false
}
