import {
  HOME_SLUG,
  NOT_FOUND_SLUG,
  PAGINATION_SEGMENT,
  entryPath,
  listingPageCount,
  listingPath,
  resolveTypes,
  sortEntries,
  type Entry,
  type ListingDocument,
  type MultiType,
  type ResolvedTypes,
  type SingleType,
  type TypesInput,
} from './content-types.js'

/*
 * Which address shows which document. One function answers it for the static build (every address, from the content
 * the build loaded) and for a hosted editor (one address, from the repository), so the two cannot disagree. Pure: no
 * Node, Astro or Vite imports.
 */

/** A site's content, however it was read: `loadContent()`, Astro's collections, or a store. */
export interface SiteContent {
  /** Everything in `content/pages/`: the home page (`index`), the 404 page and the pages. */
  pages: readonly Entry[]
  /** The entries of each declared type, by type id. */
  entries?: Readonly<Record<string, readonly Entry[]>>
  /** The listing page document of each type that has one saved, by type id. */
  listings?: Readonly<Record<string, ListingDocument>>
  /** The document of each declared single that has been saved, by type id. */
  singles?: Readonly<Record<string, Entry>>
}

/** One entry as a listing shows it. */
export interface ListedEntry {
  slug: string
  title: string
  /** The entry's address, such as `/blog/first-post`. */
  path: string
  /** The entry's SEO description, for a card that has no excerpt field. */
  description: string
  fields: Record<string, unknown>
}

export interface Pagination {
  /** The page shown, from 1. */
  page: number
  pages: number
  /** How many entries the listing has over all its pages. */
  total: number
  perPage: number
  /** Address of the page before this one, or null on the first. */
  previous: string | null
  next: string | null
  links: { page: number; path: string; current: boolean }[]
}

export interface PageRoute {
  kind: 'page'
  /** Id of the document's content type: `home`, `not-found`, `pages`, or one the site declares. */
  type: string
  path: string
  page: Entry
}

export interface ListingRoute {
  kind: 'listing'
  type: string
  path: string
  /** The listing as a page: its sections are shown above the list on the first page only. */
  page: Entry
  entries: ListedEntry[]
  pagination: Pagination
}

export type Route = PageRoute | ListingRoute

export interface RouteOptions {
  /** The language strings are sorted in. Pass the site's `lang`. Default `en`. */
  locale?: string
  /** Include entries whose `fields.draft` is true. For `astro dev` and the editor; a build leaves them out. */
  drafts?: boolean
}

const emptySeo = (title: string) => ({ title, description: '', noindex: false, nofollow: false })

/** An entry that is not ready to be published: its type declares a `draft` field and it is on. */
export function isDraft(entry: { fields?: Record<string, unknown> }): boolean {
  return entry.fields?.draft === true
}

/** What a declared single shows before it has been saved once: its label and nothing else. */
export function emptySingle(type: SingleType): Entry {
  return { slug: type.slug, title: type.label, seo: emptySeo(type.label), sections: [], ...(type.fields ? { fields: {} } : {}) }
}

/** What a listing page shows above its list before it has been saved once. */
export function emptyListing(type: MultiType): ListingDocument {
  return { title: type.label, seo: emptySeo(type.label), sections: [] }
}

/** The entries a listing shows, in its order. */
export function listedEntries(type: MultiType, entries: readonly Entry[], options: RouteOptions = {}): Entry[] {
  return sortEntries(type, options.drafts ? entries : entries.filter((entry) => !isDraft(entry)), options.locale)
}

/** One page of a type's listing. `entries` is what {@link listedEntries} returned. Undefined when there is no such page. */
export function listingRoute(
  type: MultiType,
  listing: ListingDocument | undefined,
  entries: readonly Entry[],
  page: number,
): ListingRoute | undefined {
  if (!type.listing) return undefined
  const pages = listingPageCount(type, entries.length)
  if (!Number.isInteger(page) || page < 1 || page > pages) return undefined
  const { perPage, slug } = type.listing
  const document = listing ?? emptyListing(type)
  const first = page === 1
  return {
    kind: 'listing',
    type: type.id,
    path: listingPath(type, page),
    page: {
      slug,
      title: document.title,
      // Every listing page is its own address, so each needs a title of its own for search results and tabs.
      seo: first ? document.seo : { ...document.seo, title: `${document.seo.title} - Page ${page}` },
      sections: first ? document.sections : [],
    },
    entries: entries.slice((page - 1) * perPage, page * perPage).map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      path: entryPath(type, entry.slug),
      description: entry.seo.description,
      fields: entry.fields ?? {},
    })),
    pagination: {
      page,
      pages,
      total: entries.length,
      perPage,
      previous: first ? null : listingPath(type, page - 1),
      next: page === pages ? null : listingPath(type, page + 1),
      links: Array.from({ length: pages }, (_, index) => ({
        page: index + 1,
        path: listingPath(type, index + 1),
        current: index + 1 === page,
      })),
    },
  }
}

/**
 * Every address of the site with what it shows: the home page, the 404 page (at `/404`), declared singles, pages,
 * and for each declared type its listing pages and its entries. Throws when two documents claim one address, naming
 * both, so a hand-made file cannot silently replace another page.
 */
export function siteRoutes(model: TypesInput, content: SiteContent, options: RouteOptions = {}): Route[] {
  const types = resolveTypes(model)
  const routes: Route[] = []
  const bySlug = new Map(content.pages.map((page) => [page.slug, page]))

  const home = bySlug.get(HOME_SLUG)
  if (home) routes.push({ kind: 'page', type: types.home.id, path: types.home.path, page: home })
  const notFound = bySlug.get(NOT_FOUND_SLUG)
  if (notFound) routes.push({ kind: 'page', type: types.notFound.id, path: types.notFound.path, page: notFound })
  for (const type of types.singles) {
    if (type.builtIn) continue
    routes.push({ kind: 'page', type: type.id, path: type.path, page: content.singles?.[type.id] ?? emptySingle(type) })
  }
  for (const type of types.multi) {
    const own =
      type === types.pages
        ? content.pages.filter((page) => page.slug !== HOME_SLUG && page.slug !== NOT_FOUND_SLUG)
        : (content.entries?.[type.id] ?? [])
    const listed = listedEntries(type, own, options)
    for (let page = 1; page <= listingPageCount(type, listed.length); page++) {
      const route = listingRoute(type, content.listings?.[type.id], listed, page)
      if (route) routes.push(route)
    }
    for (const entry of listed) routes.push({ kind: 'page', type: type.id, path: entryPath(type, entry.slug), page: entry })
  }

  const seen = new Map<string, Route>()
  for (const route of routes) {
    const other = seen.get(route.path)
    if (other) {
      throw new Error(
        `Two documents share the address "${route.path}": ${describe(other)} and ${describe(route)}. Rename one of them, or change the type's path or listing slug.`,
      )
    }
    seen.set(route.path, route)
  }
  return routes
}

function describe(route: Route): string {
  return route.kind === 'listing' ? `the listing of "${route.type}"` : `"${route.page.slug}" (${route.type})`
}

/** `/blog/` and `/blog` are one address; the root stays `/`. */
export function normalizePath(pathname: string): string {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return trimmed === '' ? '/' : trimmed
}

/** The route at `pathname`, or undefined. */
export function findRoute(model: TypesInput, content: SiteContent, pathname: string, options: RouteOptions = {}): Route | undefined {
  const wanted = normalizePath(pathname)
  return siteRoutes(model, content, options).find((route) => route.path === wanted)
}

export type PathMatch =
  | { kind: 'single'; type: SingleType }
  | { kind: 'entry'; type: MultiType; slug: string }
  | { kind: 'listing'; type: MultiType; page: number }

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * What kind of document `pathname` would be, from the address alone: for a reader that fetches one document at a
 * time and must know which. It does not say the document exists. Null when no type has such an address.
 */
export function matchPath(types: ResolvedTypes, pathname: string): PathMatch | null {
  const path = normalizePath(pathname)
  if (path === '/') return { kind: 'single', type: types.home }
  const parts = path.slice(1).split('/')
  if (parts.some((part) => !SEGMENT.test(part))) return null
  const [first = '', second = '', third = ''] = parts
  const declared = types.multi.filter((type) => type !== types.pages)

  if (parts.length === 1) {
    const single = types.singles.find((type) => type.slug === first && type !== types.home)
    if (single) return { kind: 'single', type: single }
    const listing = declared.find((type) => type.listing?.slug === first)
    if (listing) return { kind: 'listing', type: listing, page: 1 }
    return { kind: 'entry', type: types.pages, slug: first }
  }
  if (parts.length === 2) {
    const type = declared.find((candidate) => candidate.prefix === first)
    if (!type) return null
    // `/blog/page` is the stem of the listing's page numbers, never an entry.
    if (type.listing?.slug === type.prefix && second === PAGINATION_SEGMENT) return null
    return { kind: 'entry', type, slug: second }
  }
  if (parts.length === 3 && second === PAGINATION_SEGMENT && /^[1-9][0-9]*$/.test(third)) {
    const type = declared.find((candidate) => candidate.listing?.slug === first)
    const page = Number(third)
    // Page 1 lives at the listing's own address; `/blog/page/1` would be a second address for it.
    return type && page >= 2 ? { kind: 'listing', type, page } : null
  }
  return null
}
