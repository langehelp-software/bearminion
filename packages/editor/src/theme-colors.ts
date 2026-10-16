/**
 * Site palette from three seed colors.
 *
 * `brand` drives the accent and the brand tone, `neutral` tints backgrounds, text and lines,
 * `link` is the link color (derived from brand when absent). Everything else, including dark mode,
 * is computed here so the result stays readable: text on a fill picks near-black or near-white by
 * contrast, and links are moved until they reach 4.5:1 on their background.
 *
 * Pure and dependency-free, so the Astro layout (server) and the editor (browser) share it.
 */

/** Tokens a site can set by hand. `line` follows `fg` and keeps its opacity. */
export const OVERRIDE_TOKENS = ['bg', 'fg', 'muted', 'surface', 'accent', 'on', 'link'] as const
export type OverrideToken = (typeof OVERRIDE_TOKENS)[number]
export type ToneOverrides = Partial<Record<ToneName, Partial<Record<OverrideToken, string>>>>

export interface ThemeColors {
  brand?: string
  neutral?: string
  link?: string
  /** False keeps `tones` in the file but stops applying it. Absent means apply. */
  customTones?: boolean
  /** Hand-picked colors that replace the derived ones, per mode and tone. */
  tones?: { light?: ToneOverrides; dark?: ToneOverrides }
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export type ToneName = 'base' | 'subtle' | 'inverse' | 'brand'
export type TokenName = 'bg' | 'fg' | 'muted' | 'line' | 'surface' | 'accent' | 'on' | 'link'

/** OKLCH color with an optional alpha. */
export interface Token {
  l: number
  c: number
  h: number
  a?: number
}

export type ToneTokens = Record<TokenName, Token>
export type Palette = Record<ToneName, ToneTokens>

export const DEFAULT_BRAND: Token = { l: 0.87, c: 0.2, h: 145 }
const DEFAULT_NEUTRAL_HUE = 255
const DEFAULT_NEUTRAL_CHROMA = 0.012
/** A fully saturated neutral seed would tint the whole site. */
const MAX_NEUTRAL_CHROMA = 0.04
const TEXT_CONTRAST = 4.5

const TOKEN_NAMES: readonly TokenName[] = ['bg', 'fg', 'muted', 'line', 'surface', 'accent', 'on', 'link']

// ---- color math (Björn Ottosson's OKLab) ----

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

export function hexToToken(hex: string): Token {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255)
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255)
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.hypot(a, bb)
  const hue = chroma < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  return { l: lightness, c: chroma, h: hue }
}

/** Linear sRGB, clamped to the gamut. */
function tokenToLinear(token: Token): [number, number, number] {
  const hue = (token.h * Math.PI) / 180
  const a = token.c * Math.cos(hue)
  const b = token.c * Math.sin(hue)
  const l = (token.l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (token.l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (token.l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

export function tokenToHex(token: Token): string {
  return `#${tokenToLinear(token)
    .map((channel) =>
      Math.round(linearToSrgb(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function luminance(token: Token): number {
  const [r, g, b] = tokenToLinear(token)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio. Alpha is ignored: pass the opaque color you are checking. */
export function contrastRatio(a: Token, b: Token): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Move `color` lighter or darker, away from `against`, until it reaches `min`. */
function withContrast(color: Token, against: Token, min: number): Token {
  if (contrastRatio(color, against) >= min) return color
  const darker = against.l > 0.5
  let next = { ...color }
  for (let step = 0; step < 100; step += 1) {
    next = { ...next, l: Math.min(1, Math.max(0, next.l + (darker ? -0.01 : 0.01))) }
    if (contrastRatio(next, against) >= min) break
  }
  return next
}

/** Near-black or near-white, whichever reads better on `fill`. */
function inkFor(fill: Token, hue: number, chroma: number): { ink: Token; dark: boolean } {
  const dark: Token = { l: 0.2, c: chroma, h: hue }
  const light: Token = { l: 0.97, c: Math.min(chroma, 0.006), h: hue }
  return contrastRatio(dark, fill) >= contrastRatio(light, fill) ? { ink: dark, dark: true } : { ink: light, dark: false }
}

// ---- palette ----

interface Seeds {
  brand: Token
  hue: number
  chroma: number
  link: Token | null
}

function readSeeds(colors: ThemeColors | undefined): Seeds {
  const brand = colors?.brand && HEX_COLOR.test(colors.brand) ? hexToToken(colors.brand) : DEFAULT_BRAND
  let hue = DEFAULT_NEUTRAL_HUE
  let chroma = DEFAULT_NEUTRAL_CHROMA
  if (colors?.neutral && HEX_COLOR.test(colors.neutral)) {
    const neutral = hexToToken(colors.neutral)
    chroma = Math.min(neutral.c, MAX_NEUTRAL_CHROMA)
    hue = chroma < 0.004 ? DEFAULT_NEUTRAL_HUE : neutral.h
  }
  return { brand, hue, chroma, link: colors?.link && HEX_COLOR.test(colors.link) ? hexToToken(colors.link) : null }
}

function brandTone(seeds: Seeds): ToneTokens {
  const { brand, hue, chroma } = seeds
  const { ink, dark } = inkFor(brand, brand.h, 0.03)
  const muted = withContrast({ ...ink, l: dark ? 0.33 : 0.88, c: dark ? 0.05 : 0.01 }, brand, TEXT_CONTRAST)
  const accent: Token = dark ? { l: 0.2, c: chroma, h: hue } : { l: 0.97, c: Math.min(chroma, 0.006), h: hue }
  const on: Token = dark ? { l: 0.97, c: Math.min(chroma, 0.006), h: hue } : { l: 0.2, c: chroma, h: hue }
  return {
    bg: brand,
    fg: ink,
    muted,
    line: { ...ink, a: dark ? 0.2 : 0.25 },
    surface: { l: Math.min(0.98, brand.l + 0.05), c: brand.c * 0.65, h: brand.h },
    accent,
    on,
    link: ink,
  }
}

function neutralTones(seeds: Seeds, mode: 'light' | 'dark'): Pick<Palette, 'base' | 'subtle' | 'inverse'> {
  const { brand, hue: h, chroma: c } = seeds
  const onAccent = inkFor(brand, h, c).ink
  const tone = (bg: Token, fg: Token, muted: Token, surface: Token, lineAlpha: number): ToneTokens => {
    const linkSeed = seeds.link ?? { ...brand, c: Math.min(brand.c, 0.15) }
    return {
      bg,
      fg,
      muted,
      line: { ...fg, a: lineAlpha },
      surface,
      accent: brand,
      on: onAccent,
      link: withContrast(linkSeed, bg, TEXT_CONTRAST),
    }
  }
  if (mode === 'light') {
    const dark: Token = { l: 0.21, c, h }
    const mutedDark: Token = { l: 0.46, c, h }
    const light: Token = { l: 0.97, c: c * 0.33, h }
    return {
      base: tone({ l: 0.985, c: c * 0.25, h }, dark, mutedDark, { l: 1, c: 0, h: 0 }, 0.12),
      subtle: tone({ l: 0.955, c: c * 0.5, h }, dark, mutedDark, { l: 0.995, c: c * 0.17, h }, 0.12),
      inverse: tone({ l: 0.2, c, h }, light, { l: 0.74, c: c * 0.8, h }, { l: 0.255, c, h }, 0.14),
    }
  }
  const light: Token = { l: 0.96, c: c * 0.33, h }
  const mutedLight: Token = { l: 0.72, c: c * 0.83, h }
  const dark: Token = { l: 0.21, c, h }
  return {
    base: tone({ l: 0.17, c: c * 0.83, h }, light, mutedLight, { l: 0.215, c, h }, 0.12),
    subtle: tone({ l: 0.205, c, h }, light, mutedLight, { l: 0.25, c, h }, 0.12),
    inverse: tone({ l: 0.96, c: c * 0.33, h }, dark, { l: 0.46, c, h }, { l: 1, c: 0, h: 0 }, 0.12),
  }
}

export function derivePalette(colors: ThemeColors | undefined, mode: 'light' | 'dark'): Palette {
  const seeds = readSeeds(colors)
  const palette: Palette = { ...neutralTones(seeds, mode), brand: brandTone(seeds) }
  const overrides = colors?.customTones === false ? undefined : colors?.tones?.[mode]
  if (!overrides) return palette
  for (const tone of Object.keys(palette) as ToneName[]) {
    const picked = overrides[tone]
    if (!picked) continue
    const next: ToneTokens = { ...palette[tone] }
    for (const name of OVERRIDE_TOKENS) {
      const hex = picked[name]
      if (hex && HEX_COLOR.test(hex)) next[name] = hexToToken(hex)
    }
    // The border follows the text color, at the opacity it already had.
    if (picked.fg && HEX_COLOR.test(picked.fg)) next.line = { ...next.fg, a: palette[tone].line.a }
    palette[tone] = next
  }
  return palette
}

export function hasOverrides(colors: ThemeColors | undefined): boolean {
  return Object.values(colors?.tones ?? {}).some((tones) =>
    Object.values(tones ?? {}).some((tokens) => Object.values(tokens ?? {}).some((hex) => Boolean(hex))),
  )
}

// ---- CSS ----

function css(token: Token): string {
  const alpha = token.a === undefined ? '' : ` / ${token.a}`
  return `oklch(${token.l.toFixed(3)} ${token.c.toFixed(3)} ${token.h.toFixed(1)}${alpha})`
}

function declarations(palette: Palette, tones: readonly ToneName[]): string {
  return tones.flatMap((tone) => TOKEN_NAMES.map((name) => `--t-${tone}-${name}:${css(palette[tone][name])};`)).join('')
}

/** True when at least one seed is set, so a site without colors ships no extra CSS. */
export function hasThemeColors(colors: ThemeColors | undefined): boolean {
  return Boolean(colors && (colors.brand || colors.neutral || colors.link || (colors.customTones !== false && hasOverrides(colors))))
}

/**
 * Overrides for the tone variables in global.css. The `html` prefix outranks the plain
 * `:root` and `[data-theme]` rules there, whatever the stylesheet order.
 */
export function themeCss(colors: ThemeColors | undefined): string {
  if (!hasThemeColors(colors)) return ''
  const light = derivePalette(colors, 'light')
  const dark = derivePalette(colors, 'dark')
  // Brand is the same in both modes unless a dark-mode brand color was picked.
  const darkTones: ToneName[] =
    colors?.customTones !== false && colors?.tones?.dark?.brand ? ['base', 'subtle', 'inverse', 'brand'] : ['base', 'subtle', 'inverse']
  return [
    `html:root{${declarations(light, ['base', 'subtle', 'inverse', 'brand'])}}`,
    `html[data-theme="dark"]{${declarations(dark, darkTones)}}`,
  ].join('\n')
}

// ---- checks for the editor ----

export interface ContrastCheck {
  mode: 'light' | 'dark'
  tone: ToneName
  pair: string
  ratio: number
  ok: boolean
}

/** Text pairs a visitor reads: text on its background, label on the accent fill, link on its background. */
export function contrastChecks(colors: ThemeColors | undefined): ContrastCheck[] {
  const checks: ContrastCheck[] = []
  for (const mode of ['light', 'dark'] as const) {
    const palette = derivePalette(colors, mode)
    const tones: ToneName[] = mode === 'light' ? ['base', 'subtle', 'inverse', 'brand'] : ['base', 'subtle', 'inverse']
    for (const tone of tones) {
      const t = palette[tone]
      const pairs: [string, Token, Token][] = [
        ['Text', t.fg, t.bg],
        ['Muted text', t.muted, t.bg],
        ['Link', t.link, t.bg],
        ['Button label', t.on, t.accent],
      ]
      for (const [pair, a, b] of pairs) {
        const ratio = contrastRatio(a, b)
        checks.push({ mode, tone, pair, ratio, ok: ratio >= TEXT_CONTRAST })
      }
    }
  }
  return checks
}
