import { CONSENT_KEY, choiceCookie, domainCandidates, parseChoice, readChoiceCookie, serializeChoice, sharesDomain } from './consent-store'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

let activated = false
/** The domain whose sites share the choice: the site's own, unless the build said otherwise. */
let shared: string | undefined

/** The site's own domain: the broadest one the browser lets this page set a cookie on (as Google's `auto` does). */
function ownDomain(): string | undefined {
  const probe = 'bm-consent-probe'
  for (const domain of domainCandidates(location.hostname)) {
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in every browser the template supports
    document.cookie = `${probe}=1; Path=/; Domain=${domain}; SameSite=Lax`
    if (!document.cookie.split(';').some((pair) => pair.trim() === `${probe}=1`)) continue
    // biome-ignore lint/suspicious/noDocumentCookie: same
    document.cookie = `${probe}=; Max-Age=0; Path=/; Domain=${domain}`
    return domain
  }
  return undefined
}

/** `data-consent-domain`: `off`, a domain this page is on, or nothing for the site's own domain. */
function sharedDomain(setting: string | undefined): string | undefined {
  if (setting === 'off') return undefined
  if (setting) return sharesDomain(location.hostname, setting) ? setting : undefined
  return ownDomain()
}

function fromCookie() {
  return shared ? parseChoice(readChoiceCookie(document.cookie), Date.now()) : null
}

function fromStorage() {
  try {
    return parseChoice(localStorage.getItem(CONSENT_KEY), Date.now())
  } catch {
    return null
  }
}

/** The shared cookie wins: it may hold a newer answer given on a sibling site. */
function stored() {
  return fromCookie() ?? fromStorage()
}

function writeCookie(value: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in every browser the template supports
  if (shared) document.cookie = choiceCookie(value, shared, location.protocol === 'https:')
}

function store(analytics: boolean): void {
  const value = serializeChoice(analytics, Date.now())
  writeCookie(value)
  try {
    localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // Storage is blocked: the choice lasts until the page closes, or as long as the shared cookie.
  }
}

/** Puts the held-back snippets into the page. Scripts are rebuilt, because a cloned script does not run. */
function activate(): void {
  if (activated) return
  activated = true
  for (const template of document.querySelectorAll<HTMLTemplateElement>('template[data-consent-snippet]')) {
    const target = template.dataset.consentSnippet === 'body' ? document.body : document.head
    for (const node of Array.from(template.content.childNodes)) {
      if (!(node instanceof HTMLScriptElement)) {
        target.append(node.cloneNode(true))
        continue
      }
      const script = document.createElement('script')
      for (const attribute of Array.from(node.attributes)) script.setAttribute(attribute.name, attribute.value)
      script.text = node.text
      target.append(script)
    }
  }
}

/** Removes Google Analytics' cookies from this host and every parent domain. */
function clearAnalyticsCookies(): void {
  const parts = location.hostname.split('.')
  const domains = parts.map((_, index) => parts.slice(index).join('.')).filter((domain) => domain.includes('.'))
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim() ?? ''
    if (name !== '_ga' && name !== '_gid' && !name.startsWith('_ga_') && !name.startsWith('_gat')) continue
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in every browser the template supports
    document.cookie = `${name}=; Max-Age=0; path=/`
    // biome-ignore lint/suspicious/noDocumentCookie: same
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`
  }
}

function signal(analytics: boolean): void {
  window.gtag?.('consent', 'update', { analytics_storage: analytics ? 'granted' : 'denied' })
  if (analytics) activate()
}

/** Shows the banner until the visitor has chosen, applies a stored choice, and wires the buttons and the footer link. */
export function initConsent(banner: HTMLElement): void {
  shared = sharedDomain(banner.dataset.consentDomain)
  let opener: HTMLElement | null = null
  // The corner icon, when the site uses one, shows only while the banner is closed.
  const icon = document.querySelector<HTMLElement>('[data-consent-icon]')
  const sync = () => {
    if (icon) icon.hidden = !banner.hidden
  }
  const open = () => {
    banner.hidden = false
    sync()
    banner.focus()
  }
  const close = () => {
    banner.hidden = true
    sync()
    opener?.focus()
    opener = null
  }

  const previous = stored()
  // A choice made before the domain was shared moves into the cookie, keeping its date.
  if (previous && shared && !fromCookie()) writeCookie(serializeChoice(previous.analytics, previous.at))
  if (previous) signal(previous.analytics)
  else banner.hidden = false
  sync()

  function choose(analytics: boolean): void {
    const wasOn = stored()?.analytics === true || activated
    store(analytics)
    if (!analytics && wasOn) {
      // Loaded scripts cannot be unloaded: clear what they wrote, and reload without them.
      signal(false)
      clearAnalyticsCookies()
      location.reload()
      return
    }
    signal(analytics)
    close()
  }

  banner.querySelector('[data-consent-accept]')?.addEventListener('click', () => choose(true))
  banner.querySelector('[data-consent-reject]')?.addEventListener('click', () => choose(false))
  for (const link of document.querySelectorAll<HTMLElement>('[data-consent-open]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      opener = link
      open()
    })
  }
}
