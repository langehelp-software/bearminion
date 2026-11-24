/** One line of a diff: kept, removed from the old text, or added in the new one. */
export interface DiffLine {
  kind: 'same' | 'removed' | 'added'
  text: string
}

/** Lines per side above which no diff is computed: the table would be width × height cells. */
export const LINE_DIFF_LIMIT = 4000

/**
 * The lines of `before` and `after` as a diff, by longest common subsequence. Undefined when either side is over
 * {@link LINE_DIFF_LIMIT} lines. Unchanged runs are kept whole; {@link foldDiff} shortens them for display.
 */
export function lineDiff(before: string, after: string): DiffLine[] | undefined {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  if (a.length > LINE_DIFF_LIMIT || b.length > LINE_DIFF_LIMIT) return undefined
  // Trim the shared head and tail first: most edits touch a few lines of a long file.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const width = midB.length + 1
  const table = new Uint32Array((midA.length + 1) * width)
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        midA[i] === midB[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0)
    }
  }
  const lines: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }))
  let i = 0
  let j = 0
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      lines.push({ kind: 'same', text: midA[i] ?? '' })
      i += 1
      j += 1
    } else if (i < midA.length && (j === midB.length || (table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0))) {
      // Removals first on a tie, so a changed line reads old then new.
      lines.push({ kind: 'removed', text: midA[i] ?? '' })
      i += 1
    } else {
      lines.push({ kind: 'added', text: midB[j] ?? '' })
      j += 1
    }
  }
  for (const text of a.slice(endA)) lines.push({ kind: 'same', text })
  return lines
}

/** Unchanged runs longer than `context` lines on each side of a change collapse into one `{ skipped }` marker. */
export function foldDiff(lines: readonly DiffLine[], context = 3): (DiffLine | { skipped: number })[] {
  const near = new Array<boolean>(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k += 1) near[k] = true
  })
  const out: (DiffLine | { skipped: number })[] = []
  let skipped = 0
  lines.forEach((line, index) => {
    if (near[index]) {
      if (skipped > 0) out.push({ skipped })
      skipped = 0
      out.push(line)
    } else skipped += 1
  })
  if (skipped > 0) out.push({ skipped })
  return out
}
