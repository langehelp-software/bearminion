import { getAt, type NavLink } from '../draft.js'
import type { ThemeColors } from '../theme-colors.js'
import { isRecord } from './shared.js'
import type { SiteDraft } from './types.js'

function isNavLink(item: unknown): item is NavLink {
  return isRecord(item) && typeof item.label === 'string' && typeof item.href === 'string'
}

/** Header buttons from a draft. Older drafts store them as signIn then cta. */
export function headerActions(site: SiteDraft): NavLink[] {
  const stored = getAt(site, 'header.actions')
  const list = Array.isArray(stored) ? stored : [getAt(site, 'header.signIn'), getAt(site, 'header.cta')]
  return list.filter(isNavLink)
}

export function navLinks(site: SiteDraft): NavLink[] {
  const links = getAt(site, 'header.links')
  return Array.isArray(links) ? (links as NavLink[]) : []
}

/** Seed colors in the site draft, or undefined when none are set. */
export function themeColorsOf(site: unknown): ThemeColors | undefined {
  const colors = getAt(site, 'theme.colors')
  if (!isRecord(colors)) return undefined
  const pick = (key: 'brand' | 'neutral' | 'link'): string | undefined => {
    const value = colors[key]
    return typeof value === 'string' ? value : undefined
  }
  return {
    brand: pick('brand'),
    neutral: pick('neutral'),
    link: pick('link'),
    customTones: typeof colors.customTones === 'boolean' ? colors.customTones : undefined,
    tones: typeof colors.tones === 'object' && colors.tones !== null ? (colors.tones as ThemeColors['tones']) : undefined,
  }
}

export function imageSrcAt(doc: unknown, path: string): string {
  const value = getAt(doc, path)
  if (typeof value === 'string') return value
  return isRecord(value) && typeof value.src === 'string' ? value.src : ''
}
