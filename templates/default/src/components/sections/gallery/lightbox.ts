/**
 * The gallery lightbox. Each picture in the page is a link to its large file, so with JavaScript off a click simply
 * opens the picture. With it on, a click opens a native <dialog> that shows one picture at a time. The large file is
 * requested when the dialog opens (and the pictures next to it, so the arrows feel instant), never before.
 */

/** The index after moving `step` places from `from` in a list of `count`, wrapping at both ends. */
export function stepIndex(from: number, step: number, count: number): number {
  if (count <= 0) return 0
  return (((from + step) % count) + count) % count
}

/** Which way a finger moved: a mostly horizontal drag of at least `threshold` px. Positive is toward the next picture. */
export function swipeStep(dx: number, dy: number, threshold = 48): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.25) return 0
  return dx < 0 ? 1 : -1
}

interface Item {
  src: string
  alt: string
  caption: string
  opener: HTMLElement
}

function itemsOf(section: Element): Item[] {
  return [...section.querySelectorAll<HTMLElement>('[data-gallery-open]')].map((opener) => ({
    src: opener.getAttribute('href') ?? '',
    alt: opener.dataset.alt ?? '',
    caption: opener.dataset.caption ?? '',
    opener,
  }))
}

class Lightbox {
  private items: Item[] = []
  private index = 0
  private touch: { x: number; y: number } | null = null
  private readonly image: HTMLImageElement
  private readonly caption: HTMLElement
  private readonly counter: HTMLElement
  private readonly status: HTMLElement
  private readonly figure: HTMLElement

  constructor(private readonly dialog: HTMLDialogElement) {
    this.image = this.part<HTMLImageElement>('[data-gallery-image]')
    this.caption = this.part('[data-gallery-caption]')
    this.counter = this.part('[data-gallery-counter]')
    this.status = this.part('[data-gallery-status]')
    this.figure = this.part('[data-gallery-figure]')

    dialog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      if (target.closest('[data-gallery-close]')) return this.close()
      const step = target.closest<HTMLElement>('[data-gallery-step]')
      if (step) return this.go(Number(step.dataset.galleryStep))
      // The backdrop and the empty space around the picture close it; the picture and its caption do not.
      if (target === dialog || target === this.figure || target.hasAttribute('data-gallery-stage')) this.close()
    })
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') this.go(-1)
      else if (event.key === 'ArrowRight') this.go(1)
      else if (event.key === 'Home') this.show(0)
      else if (event.key === 'End') this.show(this.items.length - 1)
      else return
      event.preventDefault()
    })
    // The dialog's own Escape and the close button both end here, so focus always goes back to the picture opened.
    dialog.addEventListener('close', () => this.items[this.index]?.opener.focus({ preventScroll: true }))
    dialog.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return
      this.touch = { x: event.clientX, y: event.clientY }
    })
    dialog.addEventListener('pointerup', (event) => {
      if (!this.touch) return
      const step = swipeStep(event.clientX - this.touch.x, event.clientY - this.touch.y)
      this.touch = null
      if (step !== 0) this.go(step)
    })
    dialog.addEventListener('pointercancel', () => {
      this.touch = null
    })
    this.image.addEventListener('load', () => this.dialog.removeAttribute('data-loading'))
    this.image.addEventListener('error', () => {
      this.dialog.removeAttribute('data-loading')
      this.status.textContent = 'This picture could not be loaded.'
    })
  }

  private part<T extends HTMLElement = HTMLElement>(selector: string): T {
    const node = this.dialog.querySelector<T>(selector)
    if (!node) throw new Error(`Gallery lightbox is missing ${selector}`)
    return node
  }

  open(section: Element, opener: Element) {
    this.items = itemsOf(section)
    const start = this.items.findIndex((item) => item.opener === opener)
    this.dialog.toggleAttribute('data-single', this.items.length < 2)
    this.show(Math.max(0, start))
    if (!this.dialog.open) this.dialog.showModal()
    this.dialog.querySelector<HTMLElement>('[data-gallery-close]')?.focus({ preventScroll: true })
  }

  private go(step: number) {
    this.show(stepIndex(this.index, step, this.items.length))
  }

  private show(index: number) {
    const item = this.items[index]
    if (!item) return
    this.index = index
    this.status.textContent = ''
    this.dialog.setAttribute('data-loading', '')
    this.image.alt = item.alt
    this.image.src = item.src
    // A picture without a caption shows its description, so every picture in the lightbox says what it is.
    const text = item.caption || item.alt
    this.caption.textContent = text
    this.caption.hidden = text === ''
    this.counter.textContent = `${index + 1} / ${this.items.length}`
    // Fetch the neighbours now, so the next arrow press shows its picture at once.
    for (const near of [stepIndex(index, 1, this.items.length), stepIndex(index, -1, this.items.length)]) {
      if (near !== index) new Image().src = this.items[near]?.src ?? ''
    }
  }

  close() {
    if (this.dialog.open) this.dialog.close()
  }
}

const lightboxes = new WeakMap<HTMLDialogElement, Lightbox>()

/** One delegated listener, so sections added later by the editor's live preview work too. Safe to call twice. */
export function initGalleries(): void {
  const flag = '__bearminionGallery'
  const scope = window as unknown as Record<string, boolean | undefined>
  if (scope[flag]) return
  scope[flag] = true
  document.addEventListener('click', (event) => {
    const opener = (event.target as Element | null)?.closest<HTMLElement>('[data-gallery-open]')
    if (!opener) return
    // While the editor is on the page a click edits the picture. Either way the link itself must not navigate.
    event.preventDefault()
    // Preview mode shows the page as visitors see it, so the lightbox works there.
    const root = document.documentElement
    if (root.hasAttribute('data-bearminion-ready') && !root.hasAttribute('data-bearminion-preview')) return
    const section = opener.closest('[data-section-id]')
    const dialog = section?.querySelector<HTMLDialogElement>('dialog[data-gallery-dialog]')
    if (!section || !dialog) return
    let box = lightboxes.get(dialog)
    if (!box) {
      box = new Lightbox(dialog)
      lightboxes.set(dialog, box)
    }
    box.open(section, opener)
  })
}
