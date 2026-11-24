import { describe, expect, it } from 'vitest'
import { foldDiff, LINE_DIFF_LIMIT, lineDiff } from '../src/line-diff.js'

const marks = (before: string, after: string) =>
  lineDiff(before, after)?.map((line) => `${line.kind === 'same' ? ' ' : line.kind === 'added' ? '+' : '-'}${line.text}`)

describe('lineDiff', () => {
  it('marks added, removed and kept lines', () => {
    expect(marks('a\nb\nc', 'a\nB\nc\nd')).toEqual([' a', '-b', '+B', ' c', '+d'])
    expect(marks('', 'x')).toEqual(['+x'])
    expect(marks('x', '')).toEqual(['-x'])
    expect(marks('same', 'same')).toEqual([' same'])
  })

  it('keeps the longest common run', () => {
    expect(marks('1\n2\n3\n4', '0\n1\n2\n4')).toEqual(['+0', ' 1', ' 2', '-3', ' 4'])
  })

  it('gives up on very long files', () => {
    expect(lineDiff('x\n'.repeat(LINE_DIFF_LIMIT + 1), 'y')).toBeUndefined()
  })

  it('folds long unchanged runs around the changes', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l10', 'changed')
    const folded = foldDiff(lineDiff(before, after)!, 2)
    expect(folded[0]).toEqual({ skipped: 8 })
    expect(folded.filter((line) => !('skipped' in line))).toHaveLength(6)
    expect(folded.at(-1)).toEqual({ skipped: 7 })
  })
})
