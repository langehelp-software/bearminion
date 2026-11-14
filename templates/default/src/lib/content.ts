import { getCollection, getEntry } from 'astro:content'
import type { Site } from '../components/organisms/site-definition'
import {
  LISTINGS_COLLECTION,
  SINGLES_COLLECTION,
  findRoute,
  resolveTypes,
  siteRoutes,
  withoutOrphanSections,
  type Entry,
  type ListingDocument,
  type Route,
  type RouteOptions,
  type SiteContent,
} from 'bearminion'
import type { Page } from '../components/sections/definitions'
import { contentModel } from './content-model'

/** In dev the collection can hold sections the site no longer defines. They are not drawn. */
const drawable = <TDocument extends { sections: readonly unknown[] }>(document: TDocument): TDocument =>
  withoutOrphanSections(document, contentModel.sections)

/** `content/site.json`, validated by the `site` collection. */
export async function getSite(): Promise<Site> {
  const entry = await getEntry('site', 'site')
  if (!entry) throw new Error('content/site.json is missing')
  return entry.data
}

/** One page by slug (the home page is `index`), or undefined. */
export async function getPage(slug: string): Promise<Page | undefined> {
  const entry = await getEntry('pages', slug)
  return entry && drawable(entry.data)
}

/** Every page except the slugs in `exclude`. */
export async function getPages(exclude: readonly string[] = []): Promise<Page[]> {
  return (await getCollection('pages', ({ id }) => !exclude.includes(id))).map((entry) => drawable(entry.data))
}

/** The collections of the content types the model declares are named at run time, so Astro has no types for them. */
const collectionOf = getCollection as unknown as (name: string) => Promise<{ id: string; data: unknown }[]>
const entryOf = getEntry as unknown as (collection: string, id: string) => Promise<{ data: unknown } | undefined>

/**
 * Everything the site publishes: the pages, plus the entries, listing pages and singles of the content types declared
 * in `content-model.ts`. A model with no `types` has only pages.
 */
export async function getContent(): Promise<SiteContent> {
  const types = resolveTypes(contentModel)
  const entries: Record<string, Entry[]> = {}
  const listings: Record<string, ListingDocument> = {}
  const singles: Record<string, Entry> = {}
  for (const type of types.multi) {
    if (type === types.pages) continue
    entries[type.id] = (await collectionOf(type.id)).map((entry) => drawable(entry.data as Entry))
    // A listing page that was never saved has no file; the route then shows the type's label and the list.
    const listing = type.listing ? await entryOf(LISTINGS_COLLECTION, type.id) : undefined
    if (listing) listings[type.id] = drawable(listing.data as ListingDocument)
  }
  for (const type of types.singles) {
    const single = type.builtIn ? undefined : await entryOf(SINGLES_COLLECTION, type.id)
    if (single) singles[type.id] = drawable(single.data as Entry)
  }
  return { pages: await getPages(), entries, listings, singles }
}

/** Lists are ordered in the site's language. `astro dev` also shows entries marked as drafts; a build leaves them out. */
async function routeOptions(): Promise<RouteOptions> {
  return { locale: (await getSite()).lang ?? 'en', drafts: import.meta.env.DEV }
}

/** Every address of the site with what it shows: pages, entries, singles and each page of a listing. */
export async function getRoutes(): Promise<Route[]> {
  return siteRoutes(contentModel, await getContent(), await routeOptions())
}

/** What the address `pathname` shows, or undefined when nothing lives there. */
export async function getRoute(pathname: string): Promise<Route | undefined> {
  return findRoute(contentModel, await getContent(), pathname, await routeOptions())
}
