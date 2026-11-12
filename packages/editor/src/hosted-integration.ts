import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

const VIRTUAL_ID = 'virtual:bearminion/editor'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

export interface HostedEditorIntegrationOptions {
  /**
   * The site's editor module, relative to the project root. Its default export is a `HostedEditor` from
   * `createHostedEditor`, or a function `(context) => HostedEditor` for hosts that hand over secrets per request.
   */
  module: string
  /** `required` (default): the whole deployment is the editor, so visitors are sent to sign in. See `createHostedMiddleware`. */
  signIn?: 'required' | 'optional'
}

/**
 * Turns an Astro project into the hosted editor: server rendering, the sign-in middleware, and pages that draw from the
 * repository's current content (`Astro.locals.bearminion`). Add it to the editor deployment's build only: the public
 * static site must not use it. Needs an adapter (`@astrojs/cloudflare`, `@astrojs/vercel`, …).
 */
export function bearminionHostedEditor(options: HostedEditorIntegrationOptions): AstroIntegration {
  const signIn = options.signIn ?? 'required'
  if (signIn !== 'required' && signIn !== 'optional') throw new Error(`signIn must be "required" or "optional", got ${String(signIn)}.`)
  if (!options.module) throw new Error('bearminionHostedEditor needs `module`: the file that exports your hosted editor.')

  return {
    name: 'bearminion:hosted-editor',
    hooks: {
      'astro:config:setup'({ config, updateConfig, addMiddleware }) {
        if (!config.adapter) {
          throw new Error(
            'bearminionHostedEditor renders on a server, so the project needs an adapter (for example @astrojs/cloudflare or @astrojs/vercel). Add it to the editor build only.',
          )
        }
        const editorModule = path.resolve(fileURLToPath(config.root), options.module)
        updateConfig({
          ...(config.output === 'static' ? { output: 'server' as const } : {}),
          vite: {
            // The middleware imports a module this integration generates, so Vite has to bundle it with the project. Naming
            // `noExternal` replaces Astro's own default for the adapter's entry, so the adapter is named here as well.
            ssr: { noExternal: ['bearminion', config.adapter.name] },
            plugins: [
              {
                name: 'bearminion:hosted-editor-module',
                resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
                load: (id) =>
                  id === RESOLVED_ID
                    ? `export { default as editor } from ${JSON.stringify(editorModule)}\nexport const signIn = ${JSON.stringify(signIn)}\n`
                    : null,
              },
            ],
          },
        })
        addMiddleware({ entrypoint: 'bearminion/hosted-astro', order: 'pre' })
      },
    },
  }
}
