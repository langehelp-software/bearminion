// The live section previews on the section pages (see src/remark-section-previews.ts). Each frame is a page of the
// previews build on this same site, so this script reaches into it: it sets the section's tone and the light or dark
// theme, scales a desktop-wide frame to fit the column, sizes the frame to its content, and shows the section's JSON.
class SectionPreview extends HTMLElement {
  #tone = 'base'
  #width = 1280
  #resize = new ResizeObserver(() => this.#fit())

  connectedCallback() {
    this.frame = this.querySelector('iframe')
    this.stage = this.querySelector('.bm-preview-stage')
    this.frame.addEventListener('load', () => {
      const main = this.frame.contentDocument?.querySelector('main')
      if (main) this.#resize.observe(main)
      this.#apply()
    })
    this.#resize.observe(this.stage)
    this.addEventListener('click', (event) => this.#click(event))
    new MutationObserver(() => this.#apply()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }

  #click(event) {
    const button = event.target.closest('button')
    if (!button) return
    if (button.dataset.toneChoice) this.#tone = button.dataset.toneChoice
    if (button.dataset.width) this.#width = Number(button.dataset.width)
    if (button.dataset.tab) this.#tab(button.dataset.tab)
    if (button.classList.contains('bm-preview-copy')) {
      navigator.clipboard?.writeText(this.querySelector('.bm-preview-content code').textContent)
      button.textContent = 'Copied'
      setTimeout(() => (button.textContent = 'Copy'), 1500)
      return
    }
    for (const other of button.parentElement.querySelectorAll('button[aria-pressed]'))
      other.setAttribute('aria-pressed', String(other === button))
    this.#apply()
  }

  #tab(name) {
    for (const tab of this.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name))
    this.querySelector('.bm-preview-content').hidden = name !== 'content'
    this.stage.hidden = name !== 'preview'
    this.querySelector('.bm-preview-controls').classList.toggle('bm-preview-muted', name !== 'preview')
  }

  #apply() {
    const doc = this.frame.contentDocument
    const section = doc?.querySelector('[data-section-id]')
    if (section) {
      section.setAttribute('data-tone', this.#tone)
      doc.documentElement.setAttribute('data-theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
      const json = doc.querySelector('[data-section-json]')
      if (json) {
        const content = JSON.parse(json.textContent)
        content.tone = this.#tone
        this.querySelector('.bm-preview-content code').textContent = JSON.stringify(content, null, 2)
      }
    }
    this.#fit()
  }

  /** A desktop layout is drawn at its own width and scaled down to the column, so it shows as it would on a screen. */
  #fit() {
    const available = this.stage.clientWidth
    if (available === 0) return
    const scale = Math.min(1, available / this.#width)
    // The section's own height: the page around it is at least as tall as the frame, so it would never shrink.
    const main = this.frame.contentDocument?.querySelector('main')
    const height = main ? Math.ceil(main.offsetTop + main.offsetHeight) : 480
    this.frame.style.width = `${this.#width}px`
    this.frame.style.height = `${height}px`
    this.frame.style.transform = `scale(${scale})`
    this.frame.style.left = `${Math.max(0, (available - this.#width * scale) / 2)}px`
    this.stage.style.height = `${Math.ceil(height * scale)}px`
  }
}

customElements.define('bm-section-preview', SectionPreview)
