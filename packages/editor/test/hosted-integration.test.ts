import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bearminionHostedEditor } from '../src/hosted-integration.js'

type Hooks = NonNullable<ReturnType<typeof bearminionHostedEditor>['hooks']>
const root = path.resolve('/projects/site')

interface Update {
  output?: string
  vite: {
    ssr: { noExternal: string[] }
    plugins: { resolveId(id: string): string | null; load(id: string): string | null }[]
  }
}

function setup(
  options: Parameters<typeof bearminionHostedEditor>[0],
  config: Record<string, unknown> = { adapter: { name: 'x' }, output: 'static' },
) {
  const updates: Update[] = []
  const middleware: unknown[] = []
  const hook = (bearminionHostedEditor(options).hooks as Hooks)['astro:config:setup'] as (input: unknown) => void
  hook({
    config: { root: pathToFileURL(`${root}/`), ...config },
    updateConfig: (value: Update) => updates.push(value),
    addMiddleware: (value: unknown) => middleware.push(value),
  })
  return { updates, middleware }
}

describe('bearminionHostedEditor', () => {
  it('switches to server output, registers the middleware first and bundles the package with the site', () => {
    const { updates, middleware } = setup({ module: './src/editor.ts' })
    expect(updates[0]?.output).toBe('server')
    expect(updates[0]?.vite.ssr.noExternal).toEqual(['bearminion', 'x'])
    expect(middleware).toEqual([{ entrypoint: 'bearminion/hosted-astro', order: 'pre' }])
  })

  it('leaves an output the site chose alone', () => {
    expect(setup({ module: './src/editor.ts' }, { adapter: {}, output: 'server' }).updates[0]).not.toHaveProperty('output')
  })

  it('generates the module that hands the middleware the site’s editor', () => {
    const plugin = setup({ module: './src/editor.ts', signIn: 'optional' }).updates[0]?.vite.plugins[0] as Update['vite']['plugins'][number]
    const id = plugin.resolveId('virtual:bearminion/editor')
    expect(id).toBe('\0virtual:bearminion/editor')
    expect(plugin.resolveId('./other')).toBeNull()
    const code = plugin.load(id as string) as string
    expect(code).toContain(`export { default as editor } from ${JSON.stringify(path.join(root, 'src/editor.ts'))}`)
    expect(code).toContain('export const signIn = "optional"')
    expect(plugin.load('other')).toBeNull()
  })

  it('refuses a project with no adapter, a bad mode and a missing module', () => {
    expect(() => setup({ module: './src/editor.ts' }, { output: 'static' })).toThrow(/adapter/)
    expect(() => bearminionHostedEditor({ module: './e.ts', signIn: 'maybe' as never })).toThrow(/signIn/)
    expect(() => bearminionHostedEditor({ module: '' })).toThrow(/module/)
  })
})
