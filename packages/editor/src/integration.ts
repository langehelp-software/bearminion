import fs from 'node:fs'
import path from 'node:path'
import type { AstroIntegration } from 'astro'
import { editorClientPlugin } from './editor-client.js'
import { createFormsMiddleware, formsAreLive, resolveFormsConfig } from './forms-dev.js'
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
      'astro:server:setup'({ server, logger }) {
        const context = resolveEditorContext(options, server.config.root)
        const previewModule = options.previewModule ?? '/src/lib/render-preview.ts'
        const reloads = dropEarlyReloadAfterSave(server)
        server.middlewares.use(announceVideoChanges(server, context.videosDir))
        const forms = resolveFormsConfig(options.forms, context.root)
        if (forms) {
          server.middlewares.use(
            createFormsMiddleware({
              ...forms,
              root: context.root,
              live: formsAreLive(context.root),
              load: (file) => loadModule(server.environments.ssr, file),
              log: { info: (message) => logger.info(message), error: (message) => logger.error(message) },
            }),
          )
        }
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

/**
 * The videos folder is ignored by the file watcher (see above), but Vite learns which files `public/` holds from that
 * watcher, and answers 404 for any other path. So a video uploaded in the editor would not play in the dev site until
 * the server restarted. After an upload or delete, tell Vite about exactly the files that appeared or went away.
 * The event only refreshes Vite's list of public files; it does not reload the page, so the draft stays.
 */
export function announceVideoChanges(server: { watcher: { emit: (event: 'add' | 'unlink', file: string) => unknown } }, videosDir: string) {
  const list = (): Set<string> => {
    try {
      return new Set(fs.readdirSync(videosDir))
    } catch {
      return new Set()
    }
  }
  return (
    req: { method?: string; url?: string },
    res: { once: (event: 'finish', listener: () => void) => unknown },
    next: () => void,
  ): void => {
    const route = (req.url ?? '').split('?')[0]?.replace(/\/$/, '') ?? ''
    if (
      (req.method === 'POST' || req.method === 'DELETE') &&
      (route === `${API_PREFIX}/videos` || route.startsWith(`${API_PREFIX}/videos/`))
    ) {
      const before = list()
      res.once('finish', () => {
        const after = list()
        for (const name of after) if (!before.has(name)) server.watcher.emit('add', path.join(videosDir, name))
        for (const name of before) if (!after.has(name)) server.watcher.emit('unlink', path.join(videosDir, name))
      })
    }
    next()
  }
}

/** Loads a module through the dev server's SSR runner, so TypeScript works and an edit is picked up on the next call. */
async function loadModule(environment: object, file: string): Promise<unknown> {
  const runner = (environment as { runner?: { import?: (id: string) => Promise<unknown> } }).runner
  if (!runner?.import) throw new Error('The SSR dev environment cannot load a form.')
  return runner.import(file)
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
