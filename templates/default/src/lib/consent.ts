import { CONSENT_COPY, consentCopy, type SiteConsent } from 'bearminion'
import type { Env } from './analytics'
import { CONSENT_KEY, CONSENT_MAX_AGE_MS, CONSENT_VERSION } from './consent-store'

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

/** Whether the site uses Google's advanced Consent Mode: the head snippet loads before the visitor answers. */
export function consentAdvanced(site: ConsentSite): boolean {
  return site.consent?.mode === 'advanced'
}

/**
 * Google Consent Mode v2: every signal starts denied, before any tag exists. A visitor who accepted on an earlier
 * visit (here or, through the shared cookie, on a sibling site) is granted again right away, so a tag that loads
 * with the page (advanced mode) counts this page with cookies. `consent-client.ts` handles the banner and, in basic
 * mode, adds the held-back snippets. `ad_*` stay denied: this banner has one category, analytics.
 *
 * `domain` is `consentDomain()`: with `off`, a sibling site's cookie is not this site's answer.
 */
export function consentDefaultScript(domain?: string): string {
  const fromCookie =
    domain === 'off' ? '' : `var m=document.cookie.match(/(?:^|;\\s*)${CONSENT_KEY}=([^;]*)/);if(m)r=decodeURIComponent(m[1]);`
  return (
    'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;' +
    "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});" +
    `try{var r=null;${fromCookie}if(r===null)r=localStorage.getItem('${CONSENT_KEY}');var c=JSON.parse(r),n=Date.now();` +
    `if(c&&c.v===${CONSENT_VERSION}&&c.analytics===true&&c.at<=n&&n-c.at<${CONSENT_MAX_AGE_MS})` +
    "gtag('consent','update',{analytics_storage:'granted'})}catch(e){}"
  )
}

/** The script without a domain setting. */
export const CONSENT_DEFAULT_SCRIPT = consentDefaultScript()

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/

/**
 * Which sites share one consent choice, from `BEARMINION_CONSENT_DOMAIN`. Nobody has to set it:
 *
 * - Unset: the browser finds the site's own domain (`docs.example.com` → `example.com`, `shop.example.co.uk` →
 *   `example.co.uk`), so sibling sites ask once. Hosts with no domain (localhost, an IP) keep their own choice.
 * - `off`: this host keeps its own choice.
 * - A domain (`example.com`): share on exactly that one, for a site whose own domain is not where its siblings meet.
 *
 * A value that is neither fails the build, because a typo would otherwise quietly change who shares the choice.
 */
export function consentDomain(env: Env): string | undefined {
  const raw = env.BEARMINION_CONSENT_DOMAIN?.trim().toLowerCase().replace(/^\./, '')
  if (!raw) return undefined
  if (raw === 'off' || HOSTNAME.test(raw)) return raw
  throw new Error(`BEARMINION_CONSENT_DOMAIN must be off or a domain such as example.com, got "${env.BEARMINION_CONSENT_DOMAIN}"`)
}
