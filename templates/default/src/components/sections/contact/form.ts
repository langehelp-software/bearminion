import {
  NETWORK_ERROR,
  TURNSTILE_FAILED,
  TURNSTILE_FIELD,
  TURNSTILE_PENDING,
  botVerdict,
  buildRequest,
  collectSubmission,
  readResponse,
} from '../../../lib/contact-form'

/**
 * Wires every Contact form on the page: the states idle, sending, sent and error, field errors under their fields,
 * a message the visitor closes themselves when something went wrong, the spam trap and Cloudflare Turnstile. The
 * message goes to `/api/contact` as JSON. With JavaScript off the browser posts the form there itself and leaves the
 * page; there is no status handling in that case.
 */

const FIELD_ERROR = 'data-field-error'

function clearFieldErrors(form: HTMLFormElement) {
  for (const note of form.querySelectorAll(`[${FIELD_ERROR}]`)) note.remove()
  for (const control of form.querySelectorAll('[aria-invalid]')) {
    control.removeAttribute('aria-invalid')
    control.removeAttribute('aria-describedby')
  }
}

/** Puts each message under the field it names. Returns the first control marked, so focus can go there. */
function showFieldErrors(form: HTMLFormElement, errors: Readonly<Record<string, string>>): HTMLElement | null {
  let first: HTMLElement | null = null
  let count = 0
  for (const [name, message] of Object.entries(errors)) {
    const control = form.elements.namedItem(name)
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue
    if (control.type === 'hidden') continue
    const note = document.createElement('p')
    note.className = 'bm-form-error'
    note.setAttribute(FIELD_ERROR, '')
    note.id = `${form.id || 'contact-form'}-error-${count++}`
    note.textContent = message
    const holder = control.closest('label') ?? control.parentElement ?? form
    holder.append(note)
    control.setAttribute('aria-invalid', 'true')
    control.setAttribute('aria-describedby', note.id)
    first ??= control
  }
  return first
}

/**
 * A failed send is shown in a message that stays until the visitor closes it. It does not fade: an error that
 * disappears on its own is an error nobody finishes reading. One per form; a new one replaces the old.
 */
function toastRegion(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('[data-bm-toasts]')
  if (existing) return existing
  const region = document.createElement('div')
  region.className = 'bm-toasts'
  region.setAttribute('data-bm-toasts', '')
  // In the top layer, so nothing on the page (or the editor in `astro dev`) can sit over the close button.
  region.setAttribute('popover', 'manual')
  document.body.append(region)
  return region
}

function raise(region: HTMLElement) {
  try {
    if (!region.matches(':popover-open')) region.showPopover()
  } catch {
    // No popover support: the fixed position and z-index in the stylesheet still show it.
  }
}

function closeToast(owner: string) {
  for (const toast of toastRegion().querySelectorAll('[data-toast-for]')) {
    if (toast.getAttribute('data-toast-for') === owner) toast.remove()
  }
}

function showToast(owner: string, message: string) {
  closeToast(owner)
  const toast = document.createElement('div')
  toast.className = 'bm-toast'
  toast.setAttribute('role', 'alert')
  toast.setAttribute('data-toast-for', owner)
  const text = document.createElement('p')
  text.className = 'bm-toast-text'
  text.textContent = message
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'bm-toast-close'
  close.setAttribute('aria-label', 'Dismiss message')
  close.textContent = '×'
  close.addEventListener('click', () => toast.remove())
  toast.append(text, close)
  const region = toastRegion()
  region.append(toast)
  raise(region)
}

/** The part of Cloudflare's script the form uses. */
interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined
  reset(widgetId?: string): void
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let turnstileScript: Promise<TurnstileApi> | undefined

function loadTurnstile(): Promise<TurnstileApi> {
  const present = (window as unknown as { turnstile?: TurnstileApi }).turnstile
  if (present) return Promise.resolve(present)
  turnstileScript ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT
    script.async = true
    script.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
      if (api) resolve(api)
      else reject(new Error('Turnstile did not load.'))
    }
    script.onerror = () => {
      turnstileScript = undefined
      reject(new Error('Turnstile is blocked.'))
    }
    document.head.append(script)
  })
  return turnstileScript
}

interface TurnstileWidget {
  /** The current token, or an empty string while there is none. */
  token: string
  /** The widget reported an error, or its script never loaded. */
  failed: boolean
  /** A token works once. Ask for a new one after every send. */
  reset: () => void
}

function mountTurnstile(container: HTMLElement, siteKey: string): TurnstileWidget {
  const widget: TurnstileWidget = { token: '', failed: false, reset: () => undefined }
  loadTurnstile().then(
    (api) => {
      const id = api.render(container, {
        sitekey: siteKey,
        // The token is added to the request by the form script, not as a hidden field.
        'response-field': false,
        callback: (token: string) => {
          widget.token = token
          widget.failed = false
        },
        'expired-callback': () => {
          widget.token = ''
        },
        'error-callback': () => {
          widget.token = ''
          widget.failed = true
        },
      })
      widget.reset = () => {
        widget.token = ''
        api.reset(id)
      }
    },
    () => {
      widget.failed = true
    },
  )
  return widget
}

function bind(root: HTMLElement) {
  if (root.dataset.bound === 'true') return
  root.dataset.bound = 'true'
  const form = root.querySelector('[data-contact-form]')
  const success = root.querySelector('[data-contact-success]')
  const reset = root.querySelector('[data-contact-reset]')
  const topicInput = root.querySelector('[data-topic-input]')
  if (!(form instanceof HTMLFormElement) || !(success instanceof HTMLElement)) return
  const submit = form.querySelector('button[type="submit"]')
  const label = submit?.textContent ?? ''
  const owner = form.dataset.formId ?? form.id
  // The clock for the "too fast" check starts when the form is on the page.
  const openedAt = Date.now()

  const container = form.querySelector('[data-turnstile-widget]')
  const siteKey = form.dataset.turnstileKey
  const turnstile = container instanceof HTMLElement && siteKey ? mountTurnstile(container, siteKey) : null

  const busy = (on: boolean) => {
    form.toggleAttribute('aria-busy', on)
    if (!(submit instanceof HTMLButtonElement)) return
    submit.disabled = on
    submit.textContent = on ? 'Sending…' : label
  }
  const thanksLine = () => success.querySelector<HTMLElement>('[data-field$=".props.thanks"]')
  const finish = (message?: string) => {
    form.hidden = true
    success.dataset.shown = ''
    success.querySelector('[data-contact-message]')?.remove()
    const thanks = thanksLine()
    if (message) {
      // The endpoint's own words replace the section's thank-you text. Plain text only.
      const line = document.createElement('p')
      line.setAttribute('data-contact-message', '')
      line.className = thanks?.className ?? 'mt-3 text-muted'
      line.textContent = message
      if (thanks) thanks.hidden = true
      success.querySelector('p')?.after(line)
    } else if (thanks) {
      thanks.hidden = false
    }
    success.focus({ preventScroll: true })
  }
  const failed = (message: string, field?: HTMLElement | null) => {
    busy(false)
    showToast(owner, message)
    if (field) field.focus()
    else if (submit instanceof HTMLButtonElement) submit.focus()
  }

  for (const chip of root.querySelectorAll('[data-topic]')) {
    chip.addEventListener('click', () => {
      for (const item of root.querySelectorAll('[data-topic]')) item.setAttribute('aria-pressed', 'false')
      chip.setAttribute('aria-pressed', 'true')
      if (topicInput instanceof HTMLInputElement) topicInput.value = chip.textContent?.trim() ?? ''
    })
  }

  // A field marked wrong stops being marked as soon as it is edited.
  form.addEventListener('input', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement) || target.getAttribute('aria-invalid') !== 'true') return
    document.getElementById(target.getAttribute('aria-describedby') ?? '')?.remove()
    target.removeAttribute('aria-invalid')
    target.removeAttribute('aria-describedby')
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    clearFieldErrors(form)
    closeToast(owner)
    const trap = form.elements.namedItem('_gotcha')
    const verdict = botVerdict(trap instanceof HTMLInputElement ? trap.value : '', openedAt, Date.now())
    if (verdict) {
      // A script filled the trap or submitted at once. Look as if it worked, and send nothing.
      finish()
      return
    }
    if (turnstile && turnstile.token === '') {
      showToast(owner, turnstile.failed ? TURNSTILE_FAILED : TURNSTILE_PENDING)
      return
    }
    const submission = collectSubmission(new FormData(form).entries(), owner, location.pathname)
    if (turnstile) submission[TURNSTILE_FIELD] = turnstile.token
    const request = buildRequest(submission)
    busy(true)
    void fetch(request.url, request.init).then(
      async (response) => {
        const body: unknown = await response.json().catch(() => undefined)
        const result = readResponse(response.status, body)
        // The token is spent whether the send worked or not.
        turnstile?.reset()
        if (result.ok) {
          busy(false)
          finish(result.message)
          return
        }
        failed(result.error, result.fieldErrors ? showFieldErrors(form, result.fieldErrors) : null)
      },
      () => {
        turnstile?.reset()
        failed(NETWORK_ERROR)
      },
    )
  })

  reset?.addEventListener('click', () => {
    form.reset()
    clearFieldErrors(form)
    closeToast(owner)
    success.querySelector('[data-contact-message]')?.remove()
    const thanks = thanksLine()
    if (thanks) thanks.hidden = false
    form.hidden = false
    delete success.dataset.shown
  })
}

export function bindContacts(): void {
  for (const root of document.querySelectorAll('[data-contact]')) {
    if (root instanceof HTMLElement) bind(root)
  }
}
