import { CONSENT_COPY, consentCopy, type SiteConsent } from 'bearminion'

// The words are the library's, so the editor's banner dialog shows exactly what this theme renders.
export { CONSENT_COPY, consentCopy }

interface ConsentSite {
  analytics?: { head?: string; bodyEnd?: string }
  consent?: SiteConsent
}

/**
 * Whether this page asks for consent, and holds its analytics snippets back until it has it. That is the
 * case when the build ships snippets (`analyticsOn`, from `analyticsEnabled`) and the owner has not switched
 * the banner off. Without snippets there is nothing to ask about.
 */
export function consentRequired(site: ConsentSite, analyticsOn: boolean): boolean {
  if (!analyticsOn || site.consent?.enabled === false) return false
  return Boolean(site.analytics?.head?.trim() || site.analytics?.bodyEnd?.trim())
}

/**
 * Google Consent Mode v2, basic mode: every signal starts denied, before any tag exists. The snippets stay
 * inert until the visitor accepts, and `consent-client.ts` then sends the update and adds them. `ad_*` stay
 * denied: this banner has one category, analytics.
 */
export const CONSENT_DEFAULT_SCRIPT =
  'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;' +
  "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});"
