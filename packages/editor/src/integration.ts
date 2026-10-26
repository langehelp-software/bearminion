import type { AstroIntegration } from 'astro'
import { editorClientPlugin } from './editor-client.js'
import { createEditorMiddleware } from './middleware.js'
import { API_PREFIX, resolveEditorContext, type BearminionOptions } from './options.js'
import { PreviewUnavailableError, loadThemePreview, type SitePreviewHtml } from './preview.js'
import { contentReloadPlugin, dropEarlyReloadAfterSave } from './reload.js'

export interface BearminionIntegration extends AstroIntegration {
  name: 'bearminion'
}

/**
 * Dev-only Astro integration. `astro build`, `astro preview`, and `astro sync`
 * return before any plugin, route, or script is registered. `astro:server:setup`
 * runs only while `astro dev` is serving.
 */
export function bearminion(options: BearminionOptions): BearminionIntegration {
  return {
    name: 'bearminion',
    hooks: {
      'astro:config:setup'({ command, config, updateConfig, injectScript }) {
        if (command !== 'dev') return
        const context = resolveEditorContext(options, rootInput(config.root))
        updateConfig({
          vite: {
            server: {
              watch: {
                // New uploads match the image glob. Ignoring the folder keeps
                // `astro dev` from full-reloading and dropping the draft.
                ignored: [
                  `${context.uploadsDir.replaceAll('\\', '/')}/**`,
                  `${context.videosDir.replaceAll('\\', '/')}/**`,
                  `${context.root.replaceAll('\\', '/')}/.editor/**`,
                ],
              },
            },
            plugins: [contentReloadPlugin([context.contentDir]), editorClientPlugin()],
          },
        })
        injectScript('page', 'import "virtual:bearminion-editor"')
      },
      'astro:server:setup'({ server }) {
        const context = resolveEditorContext(options, server.config.root)
        const previewModule = options.previewModule ?? '/src/lib/render-preview.ts'
        const reloads = dropEarlyReloadAfterSave(server)
        server.middlewares.use((req, _res, next) => {
          if (req.method === 'POST' && (req.url ?? '').split('?')[0]?.replace(/\/$/, '') === `${API_PREFIX}/save`) reloads.saving()
          next()
        })
        server.middlewares.use(
          createEditorMiddleware(context, {
            renderPreview: (page, motion) => renderPreview(server.environments.ssr, previewModule, page, motion),
            renderSitePreview: (site, pathname) => renderSitePreview(server.environments.ssr, previewModule, site, pathname),
          }),
        )
      },
    },
  }
}

async function renderPreview(environment: object, previewModule: string, page: unknown, motion: boolean): Promise<string> {
  const preview = await loadThemePreview(environment, previewModule)
  const sections = typeof page === 'object' && page !== null && 'sections' in page && Array.isArray(page.sections) ? page.sections : []
  return preview.page({ sections, motion })
}

async function renderSitePreview(environment: object, previewModule: string, site: unknown, pathname: string): Promise<SitePreviewHtml> {
  const preview = await loadThemePreview(environment, previewModule)
  if (!preview.site) {
    throw new PreviewUnavailableError(`${previewModule} does not define \`site\`, so header and footer have no live preview.`)
  }
  return preview.site({ site: site as never, pathname })
}

function rootInput(root: unknown): string | URL {
  if (typeof root === 'string' || root instanceof URL) return root
  return process.cwd()
}
