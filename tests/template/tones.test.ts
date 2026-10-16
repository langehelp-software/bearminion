import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** WCAG relative luminance from an oklch() triple, L in 0–1. */
function contrast(foreground: [number, number, number], background: [number, number, number]): number {
  const lum = ([l, c, h]: [number, number, number]) => {
    const hr = (h * Math.PI) / 180
    const a = c * Math.cos(hr)
    const b = c * Math.sin(hr)
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b
    const s_ = l - 0.0894841775 * a - 1.291485548 * b
    const l3 = l_ ** 3
    const m3 = m_ ** 3
    const s3 = s_ ** 3
    const linear = [
      4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
      -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
      -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
    ].map((channel) => Math.min(1, Math.max(0, channel)))
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
  }
  const hi = Math.max(lum(foreground), lum(background))
  const lo = Math.min(lum(foreground), lum(background))
  return (hi + 0.05) / (lo + 0.05)
}

describe('tone contrast', () => {
  it('keeps inverse and brand text on the AA threshold', () => {
    const pairs: [string, [number, number, number], [number, number, number]][] = [
      ['inverse fg on bg', [0.97, 0.004, 250], [0.2, 0.012, 255]],
      ['inverse muted on bg', [0.74, 0.01, 255], [0.2, 0.012, 255]],
      ['inverse muted on surface', [0.74, 0.01, 255], [0.255, 0.012, 255]],
      ['brand fg on bg', [0.2, 0.03, 150], [0.87, 0.2, 145]],
      ['brand muted on bg', [0.33, 0.05, 150], [0.87, 0.2, 145]],
      ['brand muted on surface', [0.33, 0.05, 150], [0.92, 0.13, 145]],
    ]
    for (const [label, foreground, background] of pairs) {
      expect(contrast(foreground, background), label).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('wires semantic colors through @theme inline so tones can override them', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../../templates/default/src/styles/global.css'), 'utf8')
    expect(css).toMatch(/@theme inline\s*\{[^}]*--color-muted:\s*var\(--muted\)/)
    expect(css).toMatch(/--color-fg:\s*var\(--fg\)/)
    expect(css).toMatch(/--color-line:\s*var\(--line\)/)
    expect(css).toMatch(/--color-surface:\s*var\(--surface\)/)
    expect(css).not.toMatch(/@theme\s*\{[^}]*--color-muted:/)
  })
})
