import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import bearminion, { loadContent } from 'bearminion/astro'
import type { AstroIntegration } from 'astro'
import { defineConfig } from 'astro/config'
import { contentDirectory } from './src/lib/content-dir'
import { contentModel } from './src/lib/content-model'
import { formsRequired, hasFormHandler, requiredFormsError, unhandledFormMessage, unhandledForms } from './src/lib/form-check'
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

/** The folder with the site's form handlers. The Contact form posts to `/api/contact`, which `src/forms/contact.ts` answers. */
const formsDir = process.env.BEARMINION_FORMS_DIR
  ? path.resolve(process.env.BEARMINION_FORMS_DIR)
  : fileURLToPath(new URL('./src/forms', import.meta.url))

/**
 * A form without a handler is a warning, not an error: a new site must still start and build. `BEARMINION_FORMS=required`
 * (set in the host's build environment) turns the warning into a failed build.
 */
const formCheck: AstroIntegration = {
  name: 'bearminion-site:form-check',
  hooks: {
    'astro:server:start': ({ logger }) => {
      for (const form of unhandledForms(content.pages, hasFormHandler(formsDir))) logger.warn(unhandledFormMessage(form))
    },
    'astro:build:start': ({ logger }) => {
      const forms = unhandledForms(content.pages, hasFormHandler(formsDir))
      const failure = formsRequired(process.env.BEARMINION_FORMS) ? requiredFormsError(forms) : undefined
      if (failure) throw failure
      for (const form of forms) logger.warn(unhandledFormMessage(form))
    },
  },
}

export default defineConfig({
  site: content.site.url,
  integrations: [
    bearminion({
      contentDir,
      ...contentModel,
      // `astro build` stops when the files `bearminion sync` writes no longer match the section directories.
      sectionsDir: 'src/components/sections',
      git: process.env.BEARMINION_GIT === 'true',
      uploadsDir: process.env.BEARMINION_UPLOADS_DIR
        ? path.resolve(process.env.BEARMINION_UPLOADS_DIR)
        : path.resolve(contentDir, '../src/assets/uploads'),
      // Test isolation only, like the two overrides above: uploaded videos go to `public/videos` unless it is set.
      ...(process.env.BEARMINION_VIDEOS_DIR ? { videosDir: path.resolve(process.env.BEARMINION_VIDEOS_DIR) } : {}),
      // Test isolation only: the folder with the forms to serve in dev. Your forms live in `src/forms`.
      ...(process.env.BEARMINION_FORMS_DIR ? { forms: { dir: path.resolve(process.env.BEARMINION_FORMS_DIR) } } : {}),
    }),
    sitemap({
      filter: createSitemapFilter(content.pages),
    }),
    devPages,
    formCheck,
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
