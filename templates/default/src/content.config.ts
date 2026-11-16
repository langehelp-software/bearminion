import { defineCollection } from 'astro:content'
import { contentCollections } from 'bearminion/content'
import { contentDirectory } from './lib/content-dir'
import { contentModel } from './lib/content-model'

/**
 * `pages` (id = slug) and `site` (id `site`) read from `content/`. The editor writes the same
 * files, and Astro refreshes these collections when they change. `types` holds one more collection for each content
 * type declared in `content-model.ts`, and is empty when there are none.
 */
const { pages, site, types } = contentCollections(contentModel, {
  contentDir: contentDirectory(),
  // Dev only: a page holding a section type the site dropped still loads, so the editor can remove it.
  tolerateOrphans: import.meta.env.DEV,
})

export const collections = {
  pages: defineCollection(pages),
  site: defineCollection(site),
  ...Object.fromEntries(Object.entries(types).map(([name, collection]) => [name, defineCollection(collection)])),
}
