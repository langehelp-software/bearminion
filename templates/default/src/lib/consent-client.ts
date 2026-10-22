import { CONSENT_KEY, parseChoice, serializeChoice } from './consent-store'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

let activated = false

function stored() {
  try {
    return parseChoice(localStorage.getItem(CONSENT_KEY), Date.now())
  } catch {
    return null
  }
}

function store(analytics: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, serializeChoice(analytics, Date.now()))
  } catch {
    // Storage is blocked: the choice lasts until the page closes.
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
  let opener: HTMLElement | null = null
  const open = () => {
    banner.hidden = false
    banner.focus()
  }
  const close = () => {
    banner.hidden = true
    opener?.focus()
    opener = null
  }

  const previous = stored()
  if (previous) signal(previous.analytics)
  else banner.hidden = false

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
