import { batch } from '@preact/signals'
import { applyPendingEdits, type PageDraft, slugFromPath } from '../../draft.js'
import { reloadDecision } from '../../draft-store.js'
import type { ContentTypeInfo, EntryListItem } from '../../api-types.js'
import { getCatalog, getDocumentAt, getEntries, getGit, getImages, getPages, getSite, getTypes, saveDraft } from '../api-client.js'
import { setUploadRules } from '../prepare-image.js'
import type { PageSummary, SiteDraft } from '../types.js'
import { type DocumentStore, pruneDraft } from './document.js'
import type { Edits } from './edits.js'
import type { LocalDrafts } from './local-drafts.js'
import { SAVE_TOAST, type UiState } from './ui.js'

/** How long a save waits for the first load before giving up. */
const READY_TIMEOUT_MS = 8000
/** Astro reloads once its content loader has refreshed (about a second on a slow machine), so give it room. */
const RELOAD_WAIT_MS = 2500

export type SaveOutcome = 'saved' | 'clean' | 'failed'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** `/blog/` and `/blog` are one address. */
function normalizePathname(pathname: string): string {
  return (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname) || '/'
}

/** How the list shows what a type is sorted by: a date, a number or a word as it is. */
function sortText(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * The documents of the declared content types, as the editor lists and links them: each single, each type's listing
 * page, and each entry in the type's own order.
 */
export function typeDocuments(
  types: readonly ContentTypeInfo[],
  entries: Readonly<Record<string, readonly EntryListItem[]>>,
): PageSummary[] {
  const documents: PageSummary[] = []
  for (const type of types) {
    if (type.builtIn) continue
    if (type.kind === 'single') {
      documents.push({
        slug: type.path.slice(1),
        title: type.label,
        file: `${type.id}.json`,
        type: type.id,
        path: type.path,
        fixed: 'single',
      })
      continue
    }
    if (type.listing) {
      documents.push({
        slug: type.listing.slug,
        title: `${type.label}: listing page`,
        file: '_listing.json',
        type: type.id,
        path: type.listing.path,
        fixed: 'listing',
      })
    }
    for (const entry of entries[type.id] ?? []) {
      const sortValue = sortText(entry.sortValue)
      documents.push({
        slug: entry.slug,
        title: entry.title,
        file: entry.file,
        anchors: entry.anchors,
        type: type.id,
        path: entry.path,
        ...(sortValue === undefined ? {} : { sortValue }),
        ...(entry.draft ? { draft: true } : {}),
        ...(entry.noindex ? { noindex: true } : {}),
        ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
      })
    }
  }
  return documents
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
  /** The browser's own `location.reload`. The reload guard replaces the global one and hands the original here. */
  let nativeReload: () => void = () => location.reload()

  /** Load the document at the current address, with everything the editor shows beside it. */
  async function load() {
    const seq = ++loadSeq
    const [schemaRes, siteRes, listRes, imageRes, openedRes, typesRes] = await Promise.all([
      getCatalog(),
      getSite(),
      getPages(),
      getImages(),
      getDocumentAt(location.pathname),
      getTypes(),
    ])
    if (seq !== loadSeq) return
    const types = typesRes.ok ? typesRes.value.types : []
    const declared = types.filter((type) => type.kind === 'multi' && !type.builtIn)
    const lists = await Promise.all(declared.map((type) => getEntries(type.id)))
    if (seq !== loadSeq) return
    const entries = Object.fromEntries(declared.map((type, index) => [type.id, lists[index]?.ok ? lists[index].value.entries : []]))
    const opened = openedRes.ok ? openedRes.value : null
    const slug = opened?.slug ?? slugFromPath(location.pathname)
    // A listing page's document has no slug of its own. The draft carries the listing's, so it reads like any page.
    const pageRes: { ok: true; value: PageDraft } | { ok: false } = opened
      ? { ok: true, value: opened.kind === 'listing' ? { ...opened.document, slug } : opened.document }
      : { ok: false }
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
      doc.ref.value = opened ? { type: opened.type, kind: opened.kind } : { type: 'pages', kind: 'entry' }
      doc.savedSlug.value = slug
      doc.types.value = types
      if (listRes.ok) doc.pages.value = [...listRes.value.pages, ...typeDocuments(types, entries)]
      if (imageRes.ok) {
        doc.images.value = imageRes.value.images
        if (imageRes.value.limits) setUploadRules(imageRes.value.limits)
      }
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
      ui.draftOffer.value = queued.length > 0 ? null : drafts.readOffer(doc.draftId.peek(), nextPage ? savedPageJson : '', savedSiteJson)
      if (drafts.foreignSave(doc.draftId.peek())) ui.toasts.warning('Another tab saved this page.', { key: 'foreign-save' })
    })
    ready = true
    markReady()
    document.documentElement.setAttribute('data-bearminion-ready', '')
  }

  /** Load the page at the current URL. */
  function start() {
    doc.savedSlug.value = slugFromPath(location.pathname)
    void load()
  }

  async function untilReady(): Promise<boolean> {
    if (ready) return true
    return Promise.race([loaded.then(() => true), delay(READY_TIMEOUT_MS).then(() => false)])
  }

  async function writeDraft(currentPage: PageDraft | null, currentSite: SiteDraft | null): Promise<SaveOutcome> {
    const from = doc.savedSlug.peek()
    const { type, kind } = doc.ref.peek()
    if (currentPage && kind !== 'entry' && currentPage.slug !== from) {
      ui.fail('Could not change the address.', [{ path: 'slug', message: 'This document has a fixed address, set in the content model.' }])
      return 'failed'
    }
    if (currentPage && type === 'pages' && currentPage.slug !== from && from === 'index') {
      ui.fail('Could not rename the home page.', [{ path: 'slug', message: 'The home page is served at / and keeps the slug index.' }])
      return 'failed'
    }
    if (currentPage) drafts.publishSaved('page')
    if (currentSite) drafts.publishSaved('site')
    // One request: the server validates the page and the site, then writes them (and any rename) together.
    const result = await saveDraft({
      page: currentPage ? pagePayload(pruneDraft(currentPage, doc.catalog.peek()?.optionalContent), from) : undefined,
      site: currentSite ?? undefined,
    })
    if (!result.ok) {
      if (currentPage) drafts.retractSaved('page')
      if (currentSite) drafts.retractSaved('site')
      ui.fail('Save failed validation.', result.issues)
      return 'failed'
    }
    const saved = result.value
    // The server answers a listing page as it is stored, without the slug the draft carries.
    const savedPage = saved.page ? (kind === 'listing' ? { ...saved.page, slug: from } : saved.page) : null
    if (savedPage && savedPage.slug !== from) {
      doc.savedSlug.value = savedPage.slug
      drafts.publishSaved('page')
    }
    batch(() => {
      doc.markSaved(savedPage, saved.site ?? null)
      ui.draftOffer.value = null
      if (ui.dialog.peek()?.kind === 'changes') ui.dialog.value = null
      ui.status.value = 'Saved. The page reloads from disk.'
      ui.toasts.dismissKey(SAVE_TOAST)
    })
    return 'saved'
  }

  /** The open document as `/save` takes it: an entry with the slug it is stored under, a single, or a listing page. */
  function pagePayload(document: PageDraft, from: string) {
    const { type, kind } = doc.ref.peek()
    if (kind === 'single') return { type, document }
    if (kind === 'listing') {
      const { slug: _address, ...listing } = document
      return { type, listing: true, document: listing as PageDraft }
    }
    return type === 'pages' ? { from, document } : { type, from, document }
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
    const address = doc.href.peek()
    if (address !== null && normalizePathname(location.pathname) !== address) {
      // The document moved (a rename), so its old URL no longer exists.
      reloadQueued = false
      location.assign(address)
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
