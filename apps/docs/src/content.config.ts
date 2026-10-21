import { docsSchema } from '@astrojs/starlight/schema'
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * The pages are the repository's `docs/` folder, so they stay readable on GitHub and change in the same pull request as
 * the code. `docs/README.md`, the folder's index on GitHub, is the docs home here.
 */
export const collections = {
  docs: defineCollection({
    loader: glob({
      pattern: '*.md',
      base: '../../docs',
      generateId: ({ entry }) => (entry === 'README.md' ? 'index' : entry.replace(/\.md$/, '')),
    }),
    schema: docsSchema(),
  }),
}
