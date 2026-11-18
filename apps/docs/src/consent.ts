// docs.bearminion.com loads the same tags as bearminion.com, behind the same banner. Both come from one place:
// the main site's analytics snippets and banner text (apps/web/content/site.json, edited with BearMinion), and
// the default template's consent code, so the two sites cannot drift apart.
import { analyticsEnabled } from 'bearminion-site/src/lib/analytics'
import { consentAdvanced, consentCopy, consentDefaultScript, consentDomain, consentRequired } from 'bearminion-site/src/lib/consent'
import site from '../../web/content/site.json'

type SiteConsent = NonNullable<Parameters<typeof consentRequired>[0]['consent']>
interface SharedSite {
  analytics?: { head?: string; bodyEnd?: string }
  consent?: SiteConsent
}

const MAIN_SITE = 'https://bearminion.com'

// Only the two keys the docs read. The editor validates site.json when it writes it.
const shared = site as SharedSite

/** The banner asks (dev and previews too, so it can be checked); only a live build has snippets to hold back. */
export const asks = consentRequired(shared)
const live = analyticsEnabled(process.env, import.meta.env.PROD)
export const analytics = live ? shared.analytics : undefined
export const gated = asks && live
/** Advanced Consent Mode (`consent.mode` on bearminion.com): the head snippet loads at once, signals denied. */
export const headNow = Boolean(analytics?.head) && (!asks || consentAdvanced(shared))

const copy = consentCopy(shared.consent)
// A policy link such as `/privacy` points at the main site, which has the page.
export const consentText = { ...copy, policyHref: copy.policyHref && new URL(copy.policyHref, MAIN_SITE).href }

/** One choice for bearminion.com and docs.bearminion.com: unset, the browser shares it on the site's own domain. */
export const sharedDomain = consentDomain(process.env)
/** Consent Mode defaults, and a returning visitor's grant, before any tag. */
export const defaultScript = consentDefaultScript(sharedDomain)
