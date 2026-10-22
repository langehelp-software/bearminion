import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { CONSENT_COPY, CONSENT_DEFAULT_SCRIPT, consentCopy, consentRequired } from '../../templates/default/src/lib/consent'
import { CONSENT_MAX_AGE_MS, parseChoice, serializeChoice } from '../../templates/default/src/lib/consent-store'

const snippet = { head: '<script async src="https://example.com/a.js"></script>' }

describe('consent gate', () => {
  it('asks when the build ships snippets, unless the owner switched the banner off', () => {
    expect(consentRequired({ analytics: snippet }, true)).toBe(true)
    expect(consentRequired({ analytics: { bodyEnd: '<noscript>x</noscript>' } }, true)).toBe(true)
    expect(consentRequired({ analytics: snippet, consent: { enabled: false } }, true)).toBe(false)
    expect(consentRequired({ analytics: snippet, consent: { enabled: true, title: 'Hi' } }, true)).toBe(true)
  })

  it('has nothing to ask about without snippets, or where snippets do not ship', () => {
    expect(consentRequired({}, true)).toBe(false)
    expect(consentRequired({ analytics: {} }, true)).toBe(false)
    expect(consentRequired({ analytics: { head: '  \n' } }, true)).toBe(false)
    expect(consentRequired({ analytics: snippet }, false)).toBe(false)
  })
})

describe('consent copy', () => {
  it('uses the defaults and lets the site override each text', () => {
    expect(consentCopy(undefined)).toEqual({ ...CONSENT_COPY, policyHref: undefined })
    expect(consentCopy({ title: 'Ciasteczka', accept: 'Tak' })).toMatchObject({
      title: 'Ciasteczka',
      accept: 'Tak',
      reject: CONSENT_COPY.reject,
      body: CONSENT_COPY.body,
    })
    expect(consentCopy({ policyHref: '/privacy' }).policyHref).toBe('/privacy')
  })
})

describe('stored choice', () => {
  const now = 1_800_000_000_000

  it('round-trips', () => {
    expect(parseChoice(serializeChoice(true, now), now + 1000)).toEqual({ v: 1, analytics: true, at: now })
    expect(parseChoice(serializeChoice(false, now), now + 1000)?.analytics).toBe(false)
  })

  it('asks again once the choice is old, from the future, from another version, or unreadable', () => {
    expect(parseChoice(serializeChoice(true, now), now + CONSENT_MAX_AGE_MS - 1)).not.toBeNull()
    expect(parseChoice(serializeChoice(true, now), now + CONSENT_MAX_AGE_MS)).toBeNull()
    expect(parseChoice(serializeChoice(true, now), now - 1)).toBeNull()
    expect(parseChoice(JSON.stringify({ v: 2, analytics: true, at: now }), now)).toBeNull()
    expect(parseChoice(JSON.stringify({ v: 1, analytics: 'yes', at: now }), now)).toBeNull()
    expect(parseChoice('not json', now)).toBeNull()
    expect(parseChoice('null', now)).toBeNull()
    expect(parseChoice(null, now)).toBeNull()
  })
})

describe('Consent Mode v2 defaults', () => {
  it('queues one default command that denies all four signals', () => {
    const sandbox: { window: Record<string, unknown>; dataLayer?: unknown[] } = { window: {} }
    sandbox.window = sandbox as unknown as Record<string, unknown>
    vm.runInNewContext(CONSENT_DEFAULT_SCRIPT, sandbox)
    const queue = sandbox.dataLayer ?? []
    expect(queue).toHaveLength(1)
    const [command, type, state] = Array.from(queue[0] as ArrayLike<unknown>)
    expect(command).toBe('consent')
    expect(type).toBe('default')
    expect(state).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    })
    expect(typeof sandbox.window.gtag).toBe('function')
  })
})
