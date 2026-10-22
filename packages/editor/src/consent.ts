/** Longest copy the consent banner takes, in characters. The editor shows the same limits. */
export const CONSENT_LIMITS = { title: 80, body: 400, button: 30, link: 40 } as const

/** Where visitors reopen the banner: a link in the footer, or a small fixed icon in the bottom-left corner. */
export const CONSENT_REOPEN = ['footer', 'icon'] as const
export type ConsentReopen = (typeof CONSENT_REOPEN)[number]

/** A policy link points to a path on this site, an anchor or an http(s) address, so it cannot run script. */
export const CONSENT_HREF = /^(\/|#|https?:\/\/)/
export const CONSENT_HREF_MESSAGE = 'Use a path on this site or an http(s) address'

/** The texts of the banner. Each one is optional in `site.consent`; a theme falls back to {@link CONSENT_COPY}. */
export interface ConsentText {
  title?: string
  body?: string
  accept?: string
  reject?: string
  /** The footer link that reopens the banner, and the label of the corner icon. */
  settings?: string
  policyLabel?: string
  policyHref?: string
}

export type ConsentTextKey = keyof ConsentText

export interface ConsentCopy {
  title: string
  body: string
  accept: string
  reject: string
  settings: string
  policyLabel: string
  policyHref?: string
}

/** The banner's words when `site.consent` does not set its own. The editor shows them, and themes render them. */
export const CONSENT_COPY = {
  title: 'Cookies',
  body: 'This site counts visits with analytics cookies. Nothing is loaded until you accept.',
  accept: 'Accept',
  reject: 'Reject',
  settings: 'Cookie settings',
  policyLabel: 'Privacy policy',
} as const satisfies Omit<ConsentCopy, 'policyHref'>

/** `site.consent` laid over the defaults. */
export function consentCopy(consent?: ConsentText): ConsentCopy {
  return {
    title: consent?.title ?? CONSENT_COPY.title,
    body: consent?.body ?? CONSENT_COPY.body,
    accept: consent?.accept ?? CONSENT_COPY.accept,
    reject: consent?.reject ?? CONSENT_COPY.reject,
    settings: consent?.settings ?? CONSENT_COPY.settings,
    policyLabel: consent?.policyLabel ?? CONSENT_COPY.policyLabel,
    policyHref: consent?.policyHref,
  }
}

const LIMIT_OF: Record<Exclude<ConsentTextKey, 'policyHref'>, number> = {
  title: CONSENT_LIMITS.title,
  body: CONSENT_LIMITS.body,
  accept: CONSENT_LIMITS.button,
  reject: CONSENT_LIMITS.button,
  settings: CONSENT_LIMITS.link,
  policyLabel: CONSENT_LIMITS.link,
}

/** What is wrong with a draft of the banner copy, per field. The same rules as `siteConsentSchema`, without zod. */
export function consentTextIssues(copy: ConsentText): Partial<Record<ConsentTextKey, string>> {
  const issues: Partial<Record<ConsentTextKey, string>> = {}
  for (const key of Object.keys(LIMIT_OF) as (keyof typeof LIMIT_OF)[]) {
    const value = copy[key]
    if (value === undefined) continue
    if (value.trim() === '') issues[key] = 'Cannot be empty'
    else if (value.length > LIMIT_OF[key]) issues[key] = `At most ${LIMIT_OF[key]} characters`
  }
  const href = copy.policyHref
  if (href !== undefined && (href.length > 500 || !CONSENT_HREF.test(href))) issues.policyHref = CONSENT_HREF_MESSAGE
  return issues
}
