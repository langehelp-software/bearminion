import { describe, expect, it } from 'vitest'
import { applyTextMark, marksFromEmphasis, reconcileMarks, renderMarkedHtml } from '../src/marks.js'

describe('heading marks', () => {
  it('migrates an emphasis substring to a serif italic mark', () => {
    expect(marksFromEmphasis('Content lives in git.', 'git')).toEqual([{ start: 17, end: 20, italic: true, font: 'serif' }])
    expect(marksFromEmphasis('Hello', 'missing')).toBeUndefined()
  })

  it('keeps a unique mark when the surrounding text changes', () => {
    const marks = marksFromEmphasis('Content lives in git.', 'git')
    expect(reconcileMarks('Content lives in git.', 'Content lives in git now.', marks)).toEqual([
      { start: 17, end: 20, italic: true, font: 'serif' },
    ])
    expect(reconcileMarks('Content lives in git.', 'A new title', marks)).toEqual([])
  })

  it('applies weight and font without dropping italic', () => {
    const base = [{ start: 0, end: 3, italic: true, font: 'serif' as const }]
    const mono = applyTextMark('git', base, 0, 3, { font: 'mono' })
    expect(mono).toEqual([{ start: 0, end: 3, italic: true, font: 'mono' }])
    expect(renderMarkedHtml('git', mono)).toBe('<span class="font-mono italic">git</span>')
    expect(renderMarkedHtml('git', base)).toBe('<span class="font-serif bm-em">git</span>')
  })
})
