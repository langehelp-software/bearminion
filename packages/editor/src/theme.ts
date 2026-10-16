import { fontMarks, type FontMark } from './marks.js'
import { buttonStyles, themeModes, tones } from './section-options.js'

/**
 * The contract between bearminion and a theme.
 *
 * Fixed by the library, implemented by every theme:
 * - four section tones (`base`, `subtle`, `inverse`, `brand`), each a set of `--t-<tone>-<token>` CSS
 *   variables that `themeCss()` writes from the site's palette;
 * - two color modes (`light`, `dark`);
 * - three button link looks (`primary`, `secondary`, `tertiary`) the link popover offers;
 * - three font slots for heading marks (`sans`, `serif`, `mono`).
 *
 * Declared by the theme with {@link defineTheme}: what the editor shows for those slots. Everything else (atoms,
 * type scale, spacing, fonts themselves) lives in the theme's own code.
 */
export interface ThemeFont {
  /** Button label in the heading format bar: "Sans". */
  label: string
  /** CSS `font-family` the format bar draws its sample in. Load the font in the site; the editor only names it. */
  family: string
}

export interface ThemeConfig {
  /** Labels and families for the heading-mark font slots. A slot left out keeps the system default. */
  fonts?: Partial<Record<FontMark, ThemeFont>>
}

export interface ThemeDefinition {
  fonts: Record<FontMark, ThemeFont>
  tones: typeof tones
  modes: typeof themeModes
  buttonStyles: typeof buttonStyles
}

const SYSTEM_FONTS: Record<FontMark, ThemeFont> = {
  sans: { label: 'Sans', family: 'ui-sans-serif, system-ui, sans-serif' },
  serif: { label: 'Serif', family: 'ui-serif, Georgia, serif' },
  mono: { label: 'Mono', family: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
}

/** What a theme tells the editor about itself. Pass the result as `theme` in the content model. */
export function defineTheme(config: ThemeConfig = {}): ThemeDefinition {
  const fonts = Object.fromEntries(fontMarks.map((slot) => [slot, { ...SYSTEM_FONTS[slot], ...config.fonts?.[slot] }])) as Record<
    FontMark,
    ThemeFont
  >
  return { fonts, tones, modes: themeModes, buttonStyles }
}

/** Used when the content model has no `theme`. */
export const defaultTheme: ThemeDefinition = defineTheme()
