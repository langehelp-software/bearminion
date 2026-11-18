/** Longest copy the consent banner takes, in characters. The editor shows the same limits. */
export const CONSENT_LIMITS = { title: 80, body: 400, button: 30, link: 40 } as const

/** Where visitors reopen the banner: a link in the footer, or a small fixed icon in the bottom-left corner. */
export const CONSENT_REOPEN = ['footer', 'icon'] as const
export type ConsentReopen = (typeof CONSENT_REOPEN)[number]

/**
 * How Google Consent Mode treats a visitor who has not accepted. `basic` (the default): no tag loads before the
 * visitor accepts. `advanced`: the head snippet loads at once with every signal denied, so Google tags send
 * cookieless pings for visitors who reject or do not answer, and set cookies only after they accept.
 */
export const CONSENT_MODES = ['basic', 'advanced'] as const
export type ConsentMode = (typeof CONSENT_MODES)[number]

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

/**
 * The default message in advanced mode, where the default one would be wrong: Google tags load before the visitor
 * answers and count the visit without cookies.
 */
export const CONSENT_ADVANCED_BODY =
  'This site counts visits anonymously, without cookies. If you accept, it also uses analytics cookies to recognise returning visitors.'

/** The default texts for a mode: only the message differs. */
export function consentDefaults(mode?: ConsentMode): Omit<ConsentCopy, 'policyHref'> {
  return mode === 'advanced' ? { ...CONSENT_COPY, body: CONSENT_ADVANCED_BODY } : CONSENT_COPY
}

/** `site.consent` laid over the defaults for its mode. */
export function consentCopy(consent?: ConsentText & { mode?: ConsentMode }): ConsentCopy {
  const defaults = consentDefaults(consent?.mode)
  return {
    title: consent?.title ?? defaults.title,
    body: consent?.body ?? defaults.body,
    accept: consent?.accept ?? defaults.accept,
    reject: consent?.reject ?? defaults.reject,
    settings: consent?.settings ?? defaults.settings,
    policyLabel: consent?.policyLabel ?? defaults.policyLabel,
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
