import fs from 'node:fs'
import os from 'node:os'
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
    define: Record<string, string>
    plugins: { resolveId(id: string): string | null; load(id: string): string | null }[]
  }
}

function setup(
  options: Parameters<typeof bearminionHostedEditor>[0],
  config: Record<string, unknown> = { adapter: { name: 'x' }, output: 'static' },
  projectRoot = root,
) {
  const warnings: string[] = []
  const updates: Update[] = []
  const middleware: unknown[] = []
  const hook = (bearminionHostedEditor(options).hooks as Hooks)['astro:config:setup'] as (input: unknown) => void
  hook({
    config: { root: pathToFileURL(`${projectRoot}/`), ...config },
    logger: { warn: (message: string) => warnings.push(message) },
    updateConfig: (value: Update) => updates.push(value),
    addMiddleware: (value: unknown) => middleware.push(value),
  })
  return { updates, middleware, warnings }
}

describe('bearminionHostedEditor', () => {
  it('switches to server output, registers the middleware first and bundles the package with the site', () => {
    const { updates, middleware } = setup({ module: './src/editor.ts' })
    expect(updates[0]?.output).toBe('server')
    expect(updates[0]?.vite.ssr.noExternal).toEqual(['bearminion', 'x'])
    expect(updates[0]?.vite.define).toEqual({ 'import.meta.env.BEARMINION_HOSTED': 'true' })
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
    expect(code).toContain('export const preview = undefined')
    expect(plugin.load('other')).toBeNull()
  })

  describe('the theme preview', () => {
    const moduleCode = (options: Parameters<typeof bearminionHostedEditor>[0], projectRoot: string) => {
      const result = setup(options, undefined, projectRoot)
      const plugin = result.updates[0]?.vite.plugins[0] as Update['vite']['plugins'][number]
      return { code: plugin.load('\0virtual:bearminion/editor') as string, warnings: result.warnings }
    }
    const project = (files: string[]) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-hosted-'))
      for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        fs.writeFileSync(path.join(dir, file), 'export default {}')
      }
      return dir
    }

    it('wires src/lib/render-preview.ts when the site has it, loaded on first use', () => {
      const dir = project(['src/lib/render-preview.ts'])
      const { code, warnings } = moduleCode({ module: './src/editor.ts' }, dir)
      expect(code).toContain(`export const preview = () => import(${JSON.stringify(path.join(dir, 'src/lib/render-preview.ts'))})`)
      expect(warnings.filter((warning) => warning.includes('live preview'))).toEqual([])
    })

    it('warns once when the site has none, and stays quiet when it was turned off', () => {
      const dir = project([])
      expect(moduleCode({ module: './src/editor.ts' }, dir).warnings.filter((warning) => warning.includes('live preview'))).toHaveLength(1)
      const off = moduleCode({ module: './src/editor.ts', previewModule: false }, project(['src/lib/render-preview.ts']))
      expect(off.code).toContain('export const preview = undefined')
      expect(off.warnings.filter((warning) => warning.includes('live preview'))).toEqual([])
    })

    it('takes a module named by hand, and refuses one that does not exist', () => {
      const dir = project(['src/theme/preview.ts'])
      expect(moduleCode({ module: './src/editor.ts', previewModule: 'src/theme/preview.ts' }, dir).code).toContain(
        JSON.stringify(path.join(dir, 'src/theme/preview.ts')),
      )
      expect(() => moduleCode({ module: './src/editor.ts', previewModule: 'src/nope.ts' }, dir)).toThrow(/previewModule/)
    })
  })

  it('refuses a project with no adapter, a bad mode and a missing module', () => {
    expect(() => setup({ module: './src/editor.ts' }, { output: 'static' })).toThrow(/adapter/)
    expect(() => bearminionHostedEditor({ module: './e.ts', signIn: 'maybe' as never })).toThrow(/signIn/)
    expect(() => bearminionHostedEditor({ module: '' })).toThrow(/module/)
  })
})
