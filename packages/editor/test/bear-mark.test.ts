// @vitest-environment happy-dom
import { h, render } from 'preact'
import { describe, expect, it } from 'vitest'
import { BearMark } from '../src/ui/bear-mark.js'

describe('bear mark', () => {
  it('is inline SVG, so a Content-Security-Policy without `data:` in img-src cannot block it', () => {
    const container = document.createElement('div')
    render(h(BearMark, { class: 'bm-mark' }), container)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 21 19')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(4)
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toContain('data:')
    render(null, container)
  })
})
