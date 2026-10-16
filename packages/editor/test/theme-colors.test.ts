import { describe, expect, it } from 'vitest'
import { siteSchema } from './starter.js'
import {
  HEX_COLOR,
  contrastChecks,
  contrastRatio,
  derivePalette,
  hasThemeColors,
  hexToToken,
  themeCss,
  tokenToHex,
} from '../src/theme-colors.js'
import { editField } from '../src/draft.js'

describe('theme colors', () => {
  it('round-trips hex through OKLCH', () => {
    for (const hex of ['#3366cc', '#ffffff', '#000000', '#f59e0b', '#808080']) {
      expect(tokenToHex(hexToToken(hex))).toBe(hex)
    }
    expect(HEX_COLOR.test('#12ab9F')).toBe(true)
    expect(HEX_COLOR.test('12ab9f')).toBe(false)
  })

  it('emits nothing without seeds, so an unthemed site ships no extra CSS', () => {
    expect(hasThemeColors(undefined)).toBe(false)
    expect(hasThemeColors({})).toBe(false)
    expect(themeCss(undefined)).toBe('')
    expect(themeCss({})).toBe('')
  })

  it('overrides every tone token in light mode and the three neutral tones in dark mode', () => {
    const css = themeCss({ brand: '#1d4ed8' })
    expect(css).toContain('html:root{')
    expect(css).toContain('html[data-theme="dark"]{')
    expect(css).not.toContain('prefers-color-scheme')
    for (const tone of ['base', 'subtle', 'inverse', 'brand']) {
      for (const name of ['bg', 'fg', 'muted', 'line', 'surface', 'accent', 'on', 'link']) {
        expect(css).toContain(`--t-${tone}-${name}:`)
      }
    }
    const dark = css.split('html[data-theme="dark"]{')[1]?.split('}')[0] ?? ''
    expect(dark).not.toContain('--t-brand-')
  })

  it('picks readable label colors and moves links to 4.5:1', () => {
    for (const brand of ['#2fd36a', '#1d4ed8', '#f59e0b', '#7c3aed', '#111111', '#fafafa']) {
      for (const mode of ['light', 'dark'] as const) {
        const palette = derivePalette({ brand, link: '#ff00aa' }, mode)
        expect(contrastRatio(palette.base.link, palette.base.bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(palette.inverse.link, palette.inverse.bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(palette.base.fg, palette.base.bg)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('reports no failing pair for the default palette and flags a brand where neither ink reaches AA', () => {
    expect(contrastChecks(undefined).filter((check) => !check.ok)).toEqual([])
    const mid = contrastChecks({ brand: '#9a6b00' }).filter((check) => !check.ok)
    expect(mid.length).toBeGreaterThan(0)
  })

  it('validates seeds in the site schema and creates theme.colors on edit', () => {
    const base = {
      name: 'x',
      url: 'https://bearminion.example',
      seo: { titleTemplate: '%s', description: 'd' },
      header: { links: [] },
      footer: { columns: [] },
    }
    expect(siteSchema.safeParse({ ...base, theme: { colors: { brand: '#112233' } } }).success).toBe(true)
    expect(siteSchema.safeParse({ ...base, theme: { colors: { brand: 'red' } } }).success).toBe(false)
    expect(siteSchema.safeParse({ ...base, theme: { colors: { accent: '#112233' } } }).success).toBe(false)
    const edited = editField({ theme: { mode: 'light', motion: true } }, 'theme.colors.brand', '#112233') as {
      theme: { colors: { brand: string } }
    }
    expect(edited.theme.colors.brand).toBe('#112233')
  })

  it('applies hand-picked tones over the derived palette', () => {
    const colors = { tones: { dark: { base: { bg: '#101820', fg: '#ffeedd' } }, light: { brand: { bg: '#ff0000' } } } }
    expect(hasThemeColors(colors)).toBe(true)
    expect(hasThemeColors({ tones: { dark: { base: {} } } })).toBe(false)
    const dark = derivePalette(colors, 'dark')
    expect(tokenToHex(dark.base.bg)).toBe('#101820')
    expect(tokenToHex(dark.base.fg)).toBe('#ffeedd')
    expect(dark.base.line.a).toBe(0.12)
    expect(tokenToHex(derivePalette(colors, 'light').brand.bg)).toBe('#ff0000')
    const css = themeCss(colors)
    expect(css).toContain('--t-base-bg:oklch(')
    expect(
      siteSchema.safeParse({
        name: 'x',
        url: 'https://bearminion.example',
        seo: { titleTemplate: '%s', description: 'd' },
        header: { links: [] },
        footer: { columns: [] },
        theme: { colors },
      }).success,
    ).toBe(true)
  })

  it('keeps saved overrides but stops applying them when customTones is false', () => {
    const tones = { dark: { base: { bg: '#101820' } } }
    expect(tokenToHex(derivePalette({ tones }, 'dark').base.bg)).toBe('#101820')
    expect(tokenToHex(derivePalette({ tones, customTones: false }, 'dark').base.bg)).not.toBe('#101820')
    expect(hasThemeColors({ tones, customTones: false })).toBe(false)
    expect(themeCss({ tones, customTones: false })).toBe('')
  })
})
