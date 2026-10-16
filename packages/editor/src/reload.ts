import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { isInside } from './security.js'

const RELOAD_DELAY_MS = 50
/** Ignore the watcher's initial scan so opening `astro dev` does not reload immediately. */
const STARTUP_GRACE_MS = 300

const RELOAD_EXTENSIONS = new Set(['.json'])

/**
 * Set on `globalThis` by `contentCollections()`. Astro's content layer then reloads the page itself once its
 * loader has refreshed the data, so the editor stays out of it: reloading earlier would show stale content
 * and a second reload would follow.
 */
export const CONTENT_COLLECTIONS_MARKER = Symbol.for('bearminion.contentCollections')

function collectionsOwnReload(): boolean {
  return (globalThis as Record<symbol, unknown>)[CONTENT_COLLECTIONS_MARKER] === true
}

/**
 * Full-reload when content JSON changes.
 *
 * Uploaded images do not reload the page. A reload would drop the unsaved draft,
 * and a new file is not in the eager asset glob yet. Dev preview serves that file
 * from `/__bearminion/assets` until a production build resolves it with Astro Image.
 *
 * Page routes read JSON through `fs` inside `getStaticPaths`, so Vite does not
 * track those files as modules. `addWatchFile` would restart the whole dev
 * server (it is for config dependencies). Invalidating the module graph and
 * sending Astro's `astro:content-changed` event drops the route cache, and a
 * client asks the editor to reload. The editor reloads immediately when the draft
 * is clean, and asks to save, discard, or cancel when it is not.
 *
 * A site that loads content through `contentCollections()` gets Astro's own reload instead (see
 * {@link CONTENT_COLLECTIONS_MARKER}); the client routes that one through the same save/discard prompt.
 */
export function contentReloadPlugin(directories: readonly string[]): Plugin {
  const roots = directories.map((directory) => path.resolve(directory))
  const attached = new WeakSet<object>()
  return {
    name: 'bearminion-content-reload',
    apply: 'serve',
    configureServer(server) {
      if (attached.has(server)) return
      attached.add(server)
      for (const root of roots) server.watcher.add(root)
      const started = Date.now()
      let timer: NodeJS.Timeout | undefined
      const schedule = (file: string) => {
        if (Date.now() - started < STARTUP_GRACE_MS) return
        if (!shouldReload(roots, file)) return
        if (collectionsOwnReload()) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          reloadDevContent(server)
        }, RELOAD_DELAY_MS)
      }
      server.watcher.on('add', schedule)
      server.watcher.on('change', schedule)
      server.watcher.on('unlink', schedule)
    },
  }
}

/** How long after a save the dev server holds back the early reload (see {@link dropEarlyReloadAfterSave}). */
const EARLY_RELOAD_WINDOW_MS = 3000

/**
 * A save is announced to the browser twice: Vite sends a bare `full-reload` the moment the file changes, and Astro
 * sends one with `path: '*'` once its content store has re-read the files. The browser reloads on both, so the first
 * reload loads the old content and the second fixes it. Right after the editor saves, the bare one is dropped, which
 * leaves the single reload that has the new content behind it.
 */
export function dropEarlyReloadAfterSave(server: ViteDevServer): { saving: () => void } {
  let until = 0
  const send = server.ws.send.bind(server.ws) as (...args: unknown[]) => void
  server.ws.send = ((...args: unknown[]) => {
    const payload = args[0]
    const bareReload =
      typeof payload === 'object' &&
      payload !== null &&
      'type' in payload &&
      payload.type === 'full-reload' &&
      !('path' in payload && payload.path)
    if (bareReload && Date.now() < until) return
    send(...args)
  }) as typeof server.ws.send
  return {
    saving: () => {
      until = Date.now() + EARLY_RELOAD_WINDOW_MS
    },
  }
}

export function shouldReload(roots: readonly string[], file: string): boolean {
  const resolved = path.resolve(file)
  if (!roots.some((root) => isInside(root, resolved))) return false
  return RELOAD_EXTENSIONS.has(path.extname(resolved).toLowerCase())
}

export function reloadDevContent(server: ViteDevServer): void {
  server.moduleGraph.invalidateAll()
  for (const environment of Object.values(server.environments)) {
    environment.moduleGraph.invalidateAll()
    const modules = evaluatedModules(environment)
    if (modules) {
      for (const node of modules.idToModuleMap.values()) {
        modules.invalidateModule(node)
      }
    }
    environment.hot.send('astro:content-changed', {})
  }
  server.ws.send({ type: 'custom', event: 'bearminion:content-reload', data: {} })
}

interface EvaluatedModuleNode {
  id: string
}

interface EvaluatedModuleGraph {
  idToModuleMap: Map<string, EvaluatedModuleNode>
  invalidateModule: (node: EvaluatedModuleNode) => void
}

function evaluatedModules(environment: object): EvaluatedModuleGraph | undefined {
  if (!('runner' in environment)) return undefined
  const runner = environment.runner
  if (typeof runner !== 'object' || runner === null || !('evaluatedModules' in runner)) return undefined
  const modules = runner.evaluatedModules
  if (typeof modules !== 'object' || modules === null) return undefined
  if (!('idToModuleMap' in modules) || !('invalidateModule' in modules)) return undefined
  if (typeof modules.invalidateModule !== 'function') return undefined
  return modules as EvaluatedModuleGraph
}
