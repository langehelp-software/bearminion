import path from 'node:path'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import bearminion, { loadContent } from 'bearminion/astro'
import type { AstroIntegration } from 'astro'
import { defineConfig } from 'astro/config'
import { contentDirectory } from './src/lib/content-dir'
import { contentModel } from './src/lib/content-model'
import { createSitemapFilter } from './src/lib/sitemap'

const contentDir = contentDirectory()
// Tolerant, so `astro dev` still starts when a page holds a section type the site dropped: the editor can then remove it.
const content = loadContent(contentDir, contentModel, { tolerateOrphans: true })

/** The style guide and the variants gallery are theme workshops: `astro dev` serves them, `astro build` leaves them out. */
const devPages: AstroIntegration = {
  name: 'bearminion-site:dev-pages',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') return
      injectRoute({ pattern: '/style-guide', entrypoint: new URL('./src/dev/style-guide.astro', import.meta.url) })
      injectRoute({ pattern: '/variants', entrypoint: new URL('./src/dev/variants.astro', import.meta.url) })
    },
  },
}

export default defineConfig({
  site: content.site.url,
  integrations: [
    bearminion({
      contentDir,
      ...contentModel,
      git: process.env.BEARMINION_GIT === 'true',
      uploadsDir: process.env.BEARMINION_UPLOADS_DIR
        ? path.resolve(process.env.BEARMINION_UPLOADS_DIR)
        : path.resolve(contentDir, '../src/assets/uploads'),
    }),
    sitemap({
      filter: createSitemapFilter(content.pages),
    }),
    devPages,
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
