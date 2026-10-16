import { getAt, type PageDraft } from '../../draft.js'
import { previewPage, previewSite } from '../api-client.js'
import { announcePreview, isEditingText, swapOrganism } from '../dom.js'
import { destroyRichEditors } from '../rich-editor.js'
import { type DocumentStore, pruneDraft } from './document.js'

const PAGE_DEBOUNCE_MS = 160
const SITE_DEBOUNCE_MS = 200

/** Site edits that change the header or footer markup. Text typed on the page itself is skipped at render time. */
const SITE_PREVIEW_PATH =
  /^(name|nameMarks|brandLogo|header\.(variant|tone|sticky|actions|links)|footer\.(variant|tone|columns|text|legal|badge))(\.|$)/

export function affectsSitePreview(path: string): boolean {
  return SITE_PREVIEW_PATH.test(path)
}

/**
 * Re-renders the page's sections, header and footer on the dev server from the draft, without saving.
 * `onRendered` runs after new markup is in, so the overlay can re-measure.
 */
export function createLivePreview(doc: DocumentStore, onRendered: () => void) {
  let pageTimer: number | null = null
  let siteTimer: number | null = null
  /** Only the newest page render is applied; a slow earlier response is dropped. */
  let pageSeq = 0

  async function renderPage(draft: PageDraft) {
    const seq = ++pageSeq
    const site = doc.site.peek()
    const motion = site ? getAt(site, 'theme.motion') !== false : true
    const result = await previewPage(pruneDraft(draft, doc.catalog.peek()?.optionalContent), motion)
    if (seq !== pageSeq || !result.ok || typeof result.value.html !== 'string') return
    const main = document.querySelector('main#content')
    if (!main) return
    destroyRichEditors()
    main.innerHTML = result.value.html
    announcePreview()
    onRendered()
  }

  async function renderSite() {
    const site = doc.site.peek()
    if (!site) return
    const result = await previewSite(site, window.location.pathname)
    if (!result.ok) return
    const { header, footer } = result.value
    if (typeof header === 'string') swapOrganism('header', header)
    if (typeof footer === 'string') swapOrganism('footer', footer)
    announcePreview()
    onRendered()
  }

  function schedulePage() {
    if (pageTimer !== null) window.clearTimeout(pageTimer)
    pageTimer = window.setTimeout(() => {
      pageTimer = null
      const draft = doc.page.peek()
      if (draft) void renderPage(draft)
    }, PAGE_DEBOUNCE_MS)
  }

  /** Header and footer re-render for layout and brand edits made in the sidebar. Text typed on the page is left alone. */
  function scheduleSite() {
    if (siteTimer !== null) window.clearTimeout(siteTimer)
    siteTimer = window.setTimeout(() => {
      siteTimer = null
      // Typing on the page already shows the text. Swapping the element under the caret would lose it.
      if (isEditingText()) return
      void renderSite()
    }, SITE_DEBOUNCE_MS)
  }

  function dispose() {
    if (pageTimer !== null) window.clearTimeout(pageTimer)
    if (siteTimer !== null) window.clearTimeout(siteTimer)
    pageTimer = null
    siteTimer = null
  }

  return { renderPage, schedulePage, scheduleSite, dispose }
}

export type LivePreview = ReturnType<typeof createLivePreview>
