import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  CONSENT_COPY,
  CONSENT_DEFAULT_SCRIPT,
  consentAdvanced,
  consentCopy,
  consentDefaultScript,
  consentDomain,
  consentRequired,
} from '../../templates/default/src/lib/consent'
import {
  CONSENT_MAX_AGE_MS,
  choiceCookie,
  domainCandidates,
  parseChoice,
  readChoiceCookie,
  serializeChoice,
  sharesDomain,
} from '../../templates/default/src/lib/consent-store'

const snippet = { head: '<script async src="https://example.com/a.js"></script>' }

describe('consent gate', () => {
  it('asks when snippets are set, unless the owner switched the banner off', () => {
    expect(consentRequired({ analytics: snippet })).toBe(true)
    expect(consentRequired({ analytics: { bodyEnd: '<noscript>x</noscript>' } })).toBe(true)
    expect(consentRequired({ analytics: snippet, consent: { enabled: false } })).toBe(false)
    expect(consentRequired({ analytics: snippet, consent: { enabled: true, title: 'Hi' } })).toBe(true)
  })

  it('has nothing to ask about without snippets', () => {
    expect(consentRequired({})).toBe(false)
    expect(consentRequired({ analytics: {} })).toBe(false)
    expect(consentRequired({ analytics: { head: '  \n' } })).toBe(false)
    expect(consentRequired({ consent: { title: 'Hi' } })).toBe(false)
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

  it('says the visit is counted without cookies in advanced mode, unless the site has its own message', () => {
    expect(consentCopy({ mode: 'advanced' }).body).toMatch(/anonymously, without cookies/)
    expect(consentCopy({ mode: 'advanced' }).title).toBe(CONSENT_COPY.title)
    expect(consentCopy({ mode: 'basic' }).body).toBe(CONSENT_COPY.body)
    expect(consentCopy({ mode: 'advanced', body: 'Ours.' }).body).toBe('Ours.')
    expect(consentAdvanced({ consent: { mode: 'advanced' } })).toBe(true)
    expect(consentAdvanced({ consent: {} })).toBe(false)
    expect(consentAdvanced({})).toBe(false)
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

describe('shared choice across subdomains', () => {
  const now = 1_800_000_000_000

  it('leaves the domain to the browser unless BEARMINION_CONSENT_DOMAIN says otherwise', () => {
    expect(consentDomain({})).toBeUndefined()
    expect(consentDomain({ BEARMINION_CONSENT_DOMAIN: '  ' })).toBeUndefined()
    expect(consentDomain({ BEARMINION_CONSENT_DOMAIN: 'OFF' })).toBe('off')
    expect(consentDomain({ BEARMINION_CONSENT_DOMAIN: 'bearminion.com' })).toBe('bearminion.com')
    expect(consentDomain({ BEARMINION_CONSENT_DOMAIN: ' .BearMinion.com ' })).toBe('bearminion.com')
    expect(consentDomain({ BEARMINION_CONSENT_DOMAIN: 'example.co.uk' })).toBe('example.co.uk')
  })

  it('fails the build on a value that is neither off nor a domain', () => {
    for (const value of ['localhost', 'no', 'https://bearminion.com', 'bearminion.com/docs', 'bear minion.com', '-a.com', 'a..com']) {
      expect(() => consentDomain({ BEARMINION_CONSENT_DOMAIN: value }), value).toThrow(/BEARMINION_CONSENT_DOMAIN/)
    }
  })

  it('tries the domains broadest first, so the browser picks the one the site is on', () => {
    expect(domainCandidates('docs.bearminion.com')).toEqual(['bearminion.com', 'docs.bearminion.com'])
    expect(domainCandidates('bearminion.com')).toEqual(['bearminion.com'])
    expect(domainCandidates('Shop.Example.co.uk.')).toEqual(['co.uk', 'example.co.uk', 'shop.example.co.uk'])
    expect(domainCandidates('bearminion-git-x.vercel.app')).toEqual(['vercel.app', 'bearminion-git-x.vercel.app'])
    expect(domainCandidates('localhost')).toEqual([])
    expect(domainCandidates('127.0.0.1')).toEqual([])
    expect(domainCandidates('[::1]')).toEqual([])
  })

  it('applies to the domain and its subdomains only', () => {
    expect(sharesDomain('bearminion.com', 'bearminion.com')).toBe(true)
    expect(sharesDomain('docs.bearminion.com', 'bearminion.com')).toBe(true)
    expect(sharesDomain('DOCS.BearMinion.com', 'bearminion.com')).toBe(true)
    expect(sharesDomain('notbearminion.com', 'bearminion.com')).toBe(false)
    expect(sharesDomain('bearminion.com.evil.io', 'bearminion.com')).toBe(false)
    expect(sharesDomain('localhost', 'bearminion.com')).toBe(false)
    expect(sharesDomain('bearminion-git-x.vercel.app', 'bearminion.com')).toBe(false)
  })

  it('writes a cookie for the whole domain that lasts as long as the choice', () => {
    const value = serializeChoice(true, now)
    const cookie = choiceCookie(value, 'bearminion.com', true)
    expect(cookie).toBe(
      `bm-consent=${encodeURIComponent(value)}; Max-Age=${CONSENT_MAX_AGE_MS / 1000}; Path=/; Domain=bearminion.com; SameSite=Lax; Secure`,
    )
    expect(choiceCookie(value, 'example.test', false)).not.toContain('Secure')
  })

  it('reads the choice back out of document.cookie', () => {
    const value = serializeChoice(false, now)
    const jar = `_ga=GA1.1.1; bm-consent=${encodeURIComponent(value)}; other=x`
    expect(parseChoice(readChoiceCookie(jar), now)).toEqual({ v: 1, analytics: false, at: now })
    expect(readChoiceCookie('_ga=1; xbm-consent=1')).toBeNull()
    expect(readChoiceCookie('')).toBeNull()
    expect(readChoiceCookie('bm-consent=%E0%A4%A')).toBeNull()
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

  /** Runs the script with a cookie jar and a stored choice, and returns the consent commands it queued. */
  function run(script: string, { cookie = '', stored = null as string | null } = {}) {
    const sandbox: Record<string, unknown> = {
      document: { cookie },
      localStorage: { getItem: () => stored },
      Date,
      JSON,
    }
    sandbox.window = sandbox
    vm.runInNewContext(script, sandbox)
    return ((sandbox.dataLayer as ArrayLike<unknown>[]) ?? []).map((entry) => Array.from(entry).slice(1))
  }
  const granted = ['update', { analytics_storage: 'granted' }]

  it('grants analytics again before any tag for a visitor who accepted earlier', () => {
    const yes = serializeChoice(true, Date.now() - 1000)
    const no = serializeChoice(false, Date.now() - 1000)
    expect(run(CONSENT_DEFAULT_SCRIPT, { stored: yes })[1]).toEqual(granted)
    expect(run(CONSENT_DEFAULT_SCRIPT, { cookie: `_ga=1; bm-consent=${encodeURIComponent(yes)}` })[1]).toEqual(granted)
    // The shared cookie wins over the site's own storage.
    expect(run(CONSENT_DEFAULT_SCRIPT, { cookie: `bm-consent=${encodeURIComponent(no)}`, stored: yes })).toHaveLength(1)
    // With BEARMINION_CONSENT_DOMAIN=off a sibling's cookie is not this site's answer.
    expect(run(consentDefaultScript('off'), { cookie: `bm-consent=${encodeURIComponent(yes)}` })).toHaveLength(1)
    expect(run(consentDefaultScript('off'), { stored: yes })[1]).toEqual(granted)
  })

  it('leaves everything denied without a valid, current grant', () => {
    expect(run(CONSENT_DEFAULT_SCRIPT)).toHaveLength(1)
    expect(run(CONSENT_DEFAULT_SCRIPT, { stored: serializeChoice(false, Date.now()) })).toHaveLength(1)
    expect(run(CONSENT_DEFAULT_SCRIPT, { stored: serializeChoice(true, Date.now() - CONSENT_MAX_AGE_MS - 1) })).toHaveLength(1)
    expect(run(CONSENT_DEFAULT_SCRIPT, { stored: JSON.stringify({ v: 99, analytics: true, at: Date.now() }) })).toHaveLength(1)
    expect(run(CONSENT_DEFAULT_SCRIPT, { stored: '{broken' })).toHaveLength(1)
  })
})
