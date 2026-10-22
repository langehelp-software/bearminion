import { getAt, type NavLink } from '../draft.js'
import type { ConsentText, ConsentTextKey } from '../consent.js'
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

const CONSENT_KEYS: readonly ConsentTextKey[] = ['title', 'body', 'accept', 'reject', 'settings', 'policyLabel', 'policyHref']

/** The banner texts stored in a site draft. Anything else in `consent`, such as `enabled`, is left out. */
export function consentTextOf(site: SiteDraft): ConsentText {
  const stored = getAt(site, 'consent')
  const text: ConsentText = {}
  if (!isRecord(stored)) return text
  for (const key of CONSENT_KEYS) {
    const value = stored[key]
    if (typeof value === 'string') text[key] = value
  }
  return text
}

/** Whether the draft asks visitors before analytics runs. Only an explicit `false` turns it off. */
export function consentEnabled(site: SiteDraft): boolean {
  return getAt(site, 'consent.enabled') !== false
}

/** Whether the draft holds an analytics snippet that the banner would guard. */
export function hasAnalyticsSnippet(site: SiteDraft): boolean {
  return ['analytics.head', 'analytics.bodyEnd'].some((path) => {
    const value = getAt(site, path)
    return typeof value === 'string' && value.trim() !== ''
  })
}
