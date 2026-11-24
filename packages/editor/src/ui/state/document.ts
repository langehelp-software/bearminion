import { batch, computed, signal } from '@preact/signals'
import type { ContentTypeInfo } from '../../api-types.js'
import { anchorSet, pageHref, type PageDraft } from '../../draft.js'
import { isOptionalPath, type OptionalContent, pruneSectionProps } from '../../section-optional.js'
import type { LibraryImage } from '../image-field.js'
import type { Catalog, DocumentRef, PageSummary, SiteDraft } from '../types.js'

/** Paths under `sections.` live in the page draft; every other path lives in the site draft. */
export function isPagePath(path: string): boolean {
  return path.startsWith('sections.')
}

/**
 * The two drafts being edited, what is on disk for each, and the reference data the editor loads with them.
 * Holds state only: previews, storage and the network live in the modules that use it.
 */
export function createDocumentStore() {
  const catalog = signal<Catalog | null>(null)
  const page = signal<PageDraft | null>(null)
  const site = signal<SiteDraft | null>(null)
  /** JSON of the page and site as they are on disk. Empty when there is no such document. */
  const savedPageJson = signal('')
  const savedSiteJson = signal('')
  /** Slug of the page file on disk. The draft's own slug differs while a rename or a new home page is pending. */
  const savedSlug = signal('index')
  /** Which document is open: an entry of a content type, a single, or a type's listing page. */
  const ref = signal<DocumentRef>({ type: 'pages', kind: 'entry' })
  /** The site's content types. Empty until loaded, and on an API from before content types. */
  const types = signal<ContentTypeInfo[]>([])
  /** Everything that can be opened or linked to: pages, the home and 404 pages, and the documents of declared types. */
  const pages = signal<PageSummary[]>([])
  const images = signal<LibraryImage[]>([])
  const projectId = signal<string | null>(null)

  const pageDirty = computed(() => page.value !== null && JSON.stringify(page.value) !== savedPageJson.value)
  const siteDirty = computed(() => site.value !== null && JSON.stringify(site.value) !== savedSiteJson.value)
  const dirty = computed(() => pageDirty.value || siteDirty.value)
  const currentSlug = computed(() => page.value?.slug ?? savedSlug.value)
  const anchors = computed(() => (page.value ? [...anchorSet(page.value.sections)] : []))
  const typeInfo = computed(() => types.value.find((type) => type.id === ref.value.type))
  const pageFile = computed(() => {
    const slug = currentSlug.value
    const { type, kind } = ref.value
    if (kind === 'single') return `singles/${type}.json`
    if (kind === 'listing') return `${type}/_listing.json`
    const file = pages.value.find((item) => item.slug === slug && (item.type ?? 'pages') === type)?.file ?? `${slug}.json`
    return `${type}/${file}`
  })
  /**
   * What tells this document apart in the browser's own storage (drafts, save notices, undo). A page is its slug, as it
   * always was; a `~` cannot be in a slug, so an entry called `contact` never meets the page `contact`.
   */
  const draftId = computed(() => {
    const { type, kind } = ref.value
    if (type === 'pages') return savedSlug.value
    return `${type}~${kind === 'listing' ? '_listing' : kind === 'single' ? '_single' : savedSlug.value}`
  })
  /** The address of the saved document, or null for a listing, whose pages each have their own. */
  const href = computed(() => {
    const { type, kind } = ref.value
    if (kind === 'listing') return null
    if (type === 'pages') return pageHref(savedSlug.value)
    const path = typeInfo.value?.path
    if (path === undefined) return null
    return kind === 'single' ? path : path.replace('{slug}', savedSlug.value)
  })
  /**
   * What names the open document where links are edited: a page's slug, as it always was, or the address of anything
   * that is not a page (see `isCurrentDocument`).
   */
  const linkKey = computed(() => (ref.value.type === 'pages' ? currentSlug.value : (href.value ?? currentSlug.value)))
  /** The section types this document may hold, or null for all. A listing page may show any section. */
  const allowedSections = computed(() => (ref.value.kind === 'listing' ? null : (typeInfo.value?.sections ?? null)))
  /** Whether the open document may get a new slug, and why not when it may not. */
  const renameRule = computed((): { allowed: boolean; reason?: string } => {
    const { type, kind } = ref.value
    if (kind !== 'entry') return { allowed: false, reason: 'This document has a fixed address, set in the content model.' }
    const allowed = type === 'pages' ? catalog.value?.pageRules?.rename !== false : typeInfo.value?.rename !== false
    return allowed ? { allowed } : { allowed, reason: 'Renaming is turned off for this site, so this address stays as it is.' }
  })

  function docFor(path: string): PageDraft | SiteDraft | null {
    return isPagePath(path) ? page.peek() : site.peek()
  }

  function setDoc(path: string, next: unknown) {
    if (isPagePath(path)) page.value = next as PageDraft
    else site.value = next as SiteDraft
  }

  /** Both arguments are what the server wrote. `null` leaves that document as it is. */
  function markSaved(nextPage: PageDraft | null, nextSite: SiteDraft | null) {
    batch(() => {
      if (nextPage) {
        page.value = nextPage
        savedPageJson.value = JSON.stringify(nextPage)
      }
      if (nextSite) {
        site.value = nextSite
        savedSiteJson.value = JSON.stringify(nextSite)
      }
    })
  }

  function sectionTypeAt(path: string): string | undefined {
    if (!isPagePath(path)) return undefined
    return page.peek()?.sections[Number(path.split('.')[1])]?.type
  }

  /** Optional section props can be emptied or removed. Site paths are never optional. */
  function isOptional(path: string): boolean {
    const type = sectionTypeAt(path)
    return type !== undefined && isOptionalPath(catalog.peek()?.optionalContent?.[type], path)
  }

  function addImage(image: LibraryImage) {
    images.value = [...images.peek(), image].sort((a, b) => a.filename.localeCompare(b.filename))
  }

  function dropImage(image: LibraryImage) {
    images.value = images.peek().filter((item) => item.path !== image.path)
  }

  return {
    catalog,
    page,
    site,
    savedPageJson,
    savedSiteJson,
    savedSlug,
    ref,
    types,
    typeInfo,
    draftId,
    href,
    linkKey,
    allowedSections,
    renameRule,
    pages,
    images,
    projectId,
    pageDirty,
    siteDirty,
    dirty,
    currentSlug,
    anchors,
    pageFile,
    docFor,
    setDoc,
    markSaved,
    sectionTypeAt,
    isOptional,
    addImage,
    dropImage,
  }
}

export type DocumentStore = ReturnType<typeof createDocumentStore>

/** A copy of the page without the empty optional text and the removed buttons, ready for the server. */
export function pruneDraft(page: PageDraft, optional: Record<string, OptionalContent> | undefined): PageDraft {
  return {
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      props: pruneSectionProps(optional?.[section.type], section.props as Record<string, unknown>),
    })),
  } as PageDraft
}
