import { batch, computed, signal } from '@preact/signals'
import { anchorSet, type PageDraft } from '../../draft.js'
import { isOptionalPath, type OptionalContent, pruneSectionProps } from '../../section-optional.js'
import type { LibraryImage } from '../image-field.js'
import type { Catalog, PageSummary, SiteDraft } from '../types.js'

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
  const pages = signal<PageSummary[]>([])
  const images = signal<LibraryImage[]>([])
  const projectId = signal<string | null>(null)

  const pageDirty = computed(() => page.value !== null && JSON.stringify(page.value) !== savedPageJson.value)
  const siteDirty = computed(() => site.value !== null && JSON.stringify(site.value) !== savedSiteJson.value)
  const dirty = computed(() => pageDirty.value || siteDirty.value)
  const currentSlug = computed(() => page.value?.slug ?? savedSlug.value)
  const anchors = computed(() => (page.value ? [...anchorSet(page.value.sections)] : []))
  const pageFile = computed(() => {
    const slug = currentSlug.value
    return `pages/${pages.value.find((item) => item.slug === slug)?.file ?? `${slug}.json`}`
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
