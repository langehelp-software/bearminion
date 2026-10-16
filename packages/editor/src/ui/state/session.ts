import { batch } from '@preact/signals'
import { applyPendingEdits, pageHref, type PageDraft, slugFromPath, slugifyAnchor } from '../../draft.js'
import { reloadDecision } from '../../draft-store.js'
import { getCatalog, getGit, getImages, getPage, getPages, getSite, saveDraft } from '../api-client.js'
import type { SiteDraft } from '../types.js'
import { type DocumentStore, pruneDraft } from './document.js'
import type { Edits } from './edits.js'
import type { LocalDrafts } from './local-drafts.js'
import type { UiState } from './ui.js'

/** How long a save waits for the first load before giving up. */
const READY_TIMEOUT_MS = 8000
/** Astro reloads once its content loader has refreshed (about a second on a slow machine), so give it room. */
const RELOAD_WAIT_MS = 2500

export type SaveOutcome = 'saved' | 'clean' | 'failed'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Loading, saving, and leaving the page: the editor's conversation with the dev server and the browser. */
export function createSession(doc: DocumentStore, ui: UiState, edits: Edits, drafts: LocalDrafts) {
  let ready = false
  let markReady: () => void = () => {}
  const loaded = new Promise<void>((resolve) => {
    markReady = resolve
  })
  /** Set once the editor gave up the page (discard and go), so nothing persists or prompts on the way out. */
  let leaving = false
  let loadSeq = 0
  let saveInFlight = false
  /** A content reload arrived during a save. It runs once the save settles. */
  let reloadQueued = false
  let reloadArrived: (() => void) | null = null
  /** Set while this page is waiting to become the home page. Applied on save. */
  let homeSwap: { previousSlug: string } | null = null
  /** The browser's own `location.reload`. The reload guard replaces the global one and hands the original here. */
  let nativeReload: () => void = () => location.reload()

  async function load(slug: string) {
    const seq = ++loadSeq
    const [schemaRes, siteRes, listRes, imageRes, pageRes] = await Promise.all([
      getCatalog(),
      getSite(),
      getPages(),
      getImages(),
      getPage(slug),
    ])
    if (seq !== loadSeq) return
    const queued = edits.takePending()
    const flushed = applyPendingEdits(pageRes.ok ? pageRes.value : null, siteRes.ok ? siteRes.value : null, queued)
    edits.returnPending(flushed.pending)
    const nextPage = flushed.page as PageDraft | null
    const nextSite = flushed.site as SiteDraft | null
    const savedPageJson = pageRes.ok ? JSON.stringify(pageRes.value) : ''
    const savedSiteJson = siteRes.ok ? JSON.stringify(siteRes.value) : doc.savedSiteJson.peek()
    batch(() => {
      if (schemaRes.ok) {
        doc.catalog.value = schemaRes.value
        const { projectId } = schemaRes.value
        if (typeof projectId === 'string' && projectId !== '') doc.projectId.value = projectId
      }
      if (listRes.ok) doc.pages.value = listRes.value.pages
      if (imageRes.ok) doc.images.value = imageRes.value.images
      if (nextSite) {
        doc.site.value = nextSite
        doc.savedSiteJson.value = savedSiteJson
      }
      doc.page.value = nextPage
      doc.savedPageJson.value = nextPage ? savedPageJson : ''
      if (nextPage) {
        ui.selectedId.value = nextPage.sections[0]?.id ?? null
        ui.status.value = 'Edits stay in the browser until you save.'
      } else {
        ui.status.value = 'This route is not a content page. Site settings are still editable.'
      }
      ui.draftOffer.value = queued.length > 0 ? null : drafts.readOffer(slug, nextPage ? savedPageJson : '', savedSiteJson)
      if (drafts.foreignSave(slug)) ui.tabNotice.value = 'Another tab saved this page.'
    })
    ready = true
    markReady()
    document.documentElement.setAttribute('data-bearminion-ready', '')
  }

  /** Load the page at the current URL. */
  function start() {
    const slug = slugFromPath(location.pathname)
    doc.savedSlug.value = slug
    void load(slug)
  }

  async function untilReady(): Promise<boolean> {
    if (ready) return true
    return Promise.race([loaded.then(() => true), delay(READY_TIMEOUT_MS).then(() => false)])
  }

  /** Slug the current home page moves to: its title as a slug, never `index`, unique among pages. */
  function previousHomeSlug(): string {
    const pages = doc.pages.peek()
    const home = pages.find((item) => item.slug === 'index')
    const taken = new Set(pages.map((item) => item.slug))
    let base = slugifyAnchor(home?.title ?? '') || 'home'
    if (base === 'index') base = 'home'
    let slug = base
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`
    return slug
  }

  function becomeHome(previousSlug: string | null) {
    const current = doc.page.peek()
    if (!current) return
    homeSwap = previousSlug ? { previousSlug } : null
    edits.updatePage({ ...current, slug: 'index' })
  }

  /** The page form's "home page" switch. Replacing an existing home page asks first. */
  function setHome(next: boolean) {
    const current = doc.page.peek()
    if (!current) return
    const savedSlug = doc.savedSlug.peek()
    if (next) {
      const home = doc.pages.peek().find((item) => item.slug === 'index')
      if (home && savedSlug !== 'index') {
        ui.dialog.value = { kind: 'home', title: home.title, previousSlug: previousHomeSlug() }
        return
      }
      becomeHome(null)
      return
    }
    if (savedSlug !== 'index') {
      homeSwap = null
      edits.updatePage({ ...current, slug: savedSlug })
    }
  }

  async function writeDraft(currentPage: PageDraft | null, currentSite: SiteDraft | null): Promise<SaveOutcome> {
    const from = doc.savedSlug.peek()
    if (currentPage && currentPage.slug !== from && from === 'index') {
      ui.fail('Could not rename the home page.', [
        { path: 'slug', message: 'The home page slug stays index. Set another page as home to move it.' },
      ])
      return 'failed'
    }
    const promoting = currentPage !== null && currentPage.slug === 'index' && from !== 'index'
    const previousSlug =
      promoting && doc.pages.peek().some((item) => item.slug === 'index') ? (homeSwap?.previousSlug ?? previousHomeSlug()) : undefined
    if (currentPage) drafts.publishSaved('page')
    if (currentSite) drafts.publishSaved('site')
    // One request: the server validates the page and the site, then writes them (and any rename) together.
    const result = await saveDraft({
      page: currentPage
        ? {
            from,
            document: pruneDraft(currentPage, doc.catalog.peek()?.optionalContent),
            ...(previousSlug === undefined ? {} : { previousHomeSlug: previousSlug }),
          }
        : undefined,
      site: currentSite ?? undefined,
    })
    if (!result.ok) {
      if (currentPage) drafts.retractSaved('page')
      if (currentSite) drafts.retractSaved('site')
      ui.fail(promoting ? 'Could not set the home page.' : 'Save failed validation.', result.issues)
      return 'failed'
    }
    const saved = result.value
    if (saved.page && saved.page.slug !== from) {
      homeSwap = null
      doc.savedSlug.value = saved.page.slug
      drafts.publishSaved('page')
    }
    batch(() => {
      doc.markSaved(saved.page ?? null, saved.site ?? null)
      ui.draftOffer.value = null
      if (ui.dialog.peek()?.kind === 'changes') ui.dialog.value = null
      ui.status.value = 'Saved. The page reloads from disk.'
    })
    return 'saved'
  }

  async function save(): Promise<SaveOutcome> {
    if (!(await untilReady())) {
      batch(() => {
        ui.status.value = 'Still loading the page.'
        ui.open.value = true
      })
      return 'failed'
    }
    ui.issues.value = []
    const pageDirty = doc.pageDirty.peek()
    const siteDirty = doc.siteDirty.peek()
    if (!pageDirty && !siteDirty) {
      ui.status.value = 'Nothing to save.'
      return 'clean'
    }
    saveInFlight = true
    try {
      return await writeDraft(pageDirty ? doc.page.peek() : null, siteDirty ? doc.site.peek() : null)
    } finally {
      saveInFlight = false
    }
  }

  function waitForContentReload(): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        reloadArrived = null
        resolve()
      }, RELOAD_WAIT_MS)
      reloadArrived = () => {
        window.clearTimeout(timer)
        reloadArrived = null
        resolve()
      }
    })
  }

  /** Save, then go to `href`, or reload in place once Astro has picked up the new content. */
  async function saveAndGo(href: string | null) {
    // A second Save (or ⌘S) while one is running would only queue a second write and a second reload.
    if (ui.saveStage.peek() !== 'idle') return
    ui.saveStage.value = 'saving'
    const outcome = await save()
    if (outcome !== 'saved') {
      ui.saveStage.value = 'idle'
      reloadQueued = false
      return
    }
    // The page unloads when the reload comes. If it never does, do not leave Save stuck.
    ui.saveStage.value = 'reloading'
    window.setTimeout(() => {
      if (ui.saveStage.peek() === 'reloading') ui.saveStage.value = 'idle'
    }, RELOAD_WAIT_MS + 4000)
    if (href) {
      reloadQueued = false
      location.assign(href)
      return
    }
    const savedSlug = doc.savedSlug.peek()
    if (slugFromPath(location.pathname) !== savedSlug) {
      // The page moved (rename or new home), so its old URL no longer exists.
      reloadQueued = false
      location.assign(pageHref(savedSlug))
      return
    }
    if (!reloadQueued) await waitForContentReload()
    reloadQueued = false
    nativeReload()
  }

  function navigate(href: string | null) {
    if (href) location.assign(href)
    else nativeReload()
  }

  /** Leaving the page: go at once when clean, wait for a running save, otherwise ask. */
  function requestLeave(href: string | null) {
    const decision = reloadDecision({ dirty: doc.dirty.peek(), saveInFlight })
    if (decision === 'defer') {
      reloadQueued = true
      return
    }
    if (decision === 'reload') {
      navigate(href)
      return
    }
    batch(() => {
      ui.dialog.value = { kind: 'leave', href }
      ui.open.value = true
    })
  }

  /** Astro or Vite wants to reload the page, usually because content on disk changed. */
  function onContentReload() {
    if (saveInFlight) {
      reloadQueued = true
      return
    }
    if (reloadArrived) {
      reloadArrived()
      return
    }
    requestLeave(null)
  }

  function discardAndGo(href: string | null) {
    drafts.dropStored()
    leaving = true
    navigate(href)
  }

  async function loadGit() {
    const result = await getGit()
    ui.gitState.value = result.ok ? result.value : null
  }

  return {
    start,
    load,
    save,
    saveAndGo,
    requestLeave,
    onContentReload,
    discardAndGo,
    becomeHome,
    setHome,
    loadGit,
    /** Autosave and the leave prompt apply only while the editor owns the page. */
    isActive: () => ready && !leaving,
    isLeaving: () => leaving,
    setNativeReload: (reload: () => void) => {
      nativeReload = reload
    },
  }
}

export type Session = ReturnType<typeof createSession>
