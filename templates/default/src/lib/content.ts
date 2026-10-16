import { getCollection, getEntry } from 'astro:content'
import type { Site } from '../components/organisms/site-definition'
import { withoutOrphanSections } from 'bearminion'
import type { Page } from '../components/sections/definitions'
import { contentModel } from './content-model'

/** In dev the collection can hold sections the site no longer defines. They are not drawn. */
const drawable = (page: Page): Page => withoutOrphanSections(page, contentModel.sections)

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
