import { CONSENT_COPY, consentCopy, type SiteConsent } from 'bearminion'

// The words are the library's, so the editor's banner dialog shows exactly what this theme renders.
export { CONSENT_COPY, consentCopy }

interface ConsentSite {
  analytics?: { head?: string; bodyEnd?: string }
  consent?: SiteConsent
}

/**
 * Whether this site asks for consent: the owner has set analytics snippets and has not switched the banner
 * off. Without snippets there is nothing to ask about. This does not depend on the build: dev and previews
 * show the banner too, so the owner sees what visitors get. Only a live build also holds the snippets back
 * (`analyticsEnabled`), because only a live build ships them.
 */
export function consentRequired(site: ConsentSite): boolean {
  if (site.consent?.enabled === false) return false
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
