import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { addScript, configSource, findBaseConfig, HOSTS } from '../src/add/hosted.js'
import { run } from '../src/command.js'
import { readRegistry, writeRegistry } from '../src/registry/build.js'
import { hashContent } from '../src/registry/hash.js'
import { LOCK_FILE, type RegistryGroup } from '../src/registry/types.js'

const temporary: string[] = []
const folder = (label: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bearminion-${label}-`))
  temporary.push(dir)
  return dir
}
const write = (root: string, file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), content)
}
const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf8')
afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const SECTIONS = 'src/components/sections'
const GROUP: RegistryGroup = {
  label: 'Hosted editor',
  description: 'The files the hosted editor needs.',
  files: [`${SECTIONS}/media/Media.astro`, 'src/env.d.ts', 'src/lib/editing.ts', 'src/pages/[...slug].astro'],
}

function makeTemplate(): string {
  const dir = folder('template')
  write(dir, 'package.json', JSON.stringify({ dependencies: { astro: '^7.0.0' } }))
  write(dir, `${SECTIONS}/definitions.ts`, '// own\n')
  write(dir, `${SECTIONS}/definitions.gen.ts`, '// generated\n')
  write(dir, `${SECTIONS}/components.gen.ts`, '// generated\n')
  write(
    dir,
    `${SECTIONS}/media/definition.ts`,
    [
      'export const media = defineSection({',
      "  type: 'media',",
      "  label: 'Media',",
      "  description: 'The Media section.',",
      '})',
      '',
    ].join('\n'),
  )
  write(dir, `${SECTIONS}/media/wireframe.ts`, 'export const wireframe = []\n')
  write(dir, `${SECTIONS}/media/Media.astro`, '---\n---\n<p>media v2</p>\n')
  write(dir, 'src/env.d.ts', '/// <reference types="astro/client" />\n// v2\n')
  write(dir, 'src/lib/editing.ts', 'export const editing = true\n')
  write(dir, 'src/pages/[...slug].astro', '---\nconst live = Astro.locals.bearminion\n---\n')
  return dir
}

const SCRIPTS =
  '{\n  "name": "site",\n  "scripts": {\n    "dev": "astro dev",\n    "build": "astro build"\n  },\n  "dependencies": { "astro": "^7.0.0" }\n}\n'

function makeSite(
  options: { sections?: boolean; config?: string; configFile?: string; manifest?: string; lockfile?: string } = {},
): string {
  const dir = folder('site')
  write(dir, 'package.json', options.manifest ?? SCRIPTS)
  write(dir, options.configFile ?? 'astro.config.ts', options.config ?? "export default { site: 'https://example.com' }\n")
  write(dir, `${SECTIONS}/definitions.ts`, '// own\n')
  write(dir, `${SECTIONS}/definitions.gen.ts`, '// generated\n')
  write(dir, `${SECTIONS}/components.gen.ts`, '// generated\n')
  if (options.sections !== false) {
    write(dir, `${SECTIONS}/media/definition.ts`, 'export const media = {}\n')
    write(dir, `${SECTIONS}/media/Media.astro`, '---\n---\n<p>media v2</p>\n')
  }
  if (options.lockfile) write(dir, options.lockfile, '')
  return dir
}

function build(template: string, history: Record<string, Record<string, string>> = {}) {
  const registry = readRegistry({ templateDir: template, version: '1.18.0', history, groups: { hosted: GROUP } })
  const registryDir = folder('registry')
  writeRegistry(registry, template, registryDir)
  return { registry, registryDir }
}

async function exec(argv: string[], registryDir: string, extra: Record<string, unknown> = {}) {
  const out: string[] = []
  const code = await run(argv, { log: (line) => out.push(line), registryDir, ...extra })
  return { code, text: out.join('\n') }
}

describe('the hosted group in the registry', () => {
  it('tracks the group files with their history, and fails on a file the template lacks', () => {
    const template = makeTemplate()
    const old = hashContent('src/lib/editing.ts', 'export const editing = false\n')
    const { registry } = build(template, { '1.17.0': { 'src/lib/editing.ts': old } })
    expect(registry.groups?.hosted?.files).toEqual([...GROUP.files].sort())
    expect(registry.files['src/lib/editing.ts']?.history).toEqual([old])
    expect(registry.files['src/pages/[...slug].astro']).toBeDefined()
    expect(() => readRegistry({ templateDir: template, version: '1', groups: { hosted: { ...GROUP, files: ['src/nope.ts'] } } })).toThrow(
      /not in the template/,
    )
  })
})

describe('addScript', () => {
  it('adds one line without touching the rest of the file', () => {
    const patched = addScript(SCRIPTS, 'build:editor', 'astro build --config x.ts') as string
    expect(patched).toBe(SCRIPTS.replace('"scripts": {\n', '"scripts": {\n    "build:editor": "astro build --config x.ts",\n'))
    expect(JSON.parse(patched).scripts['build:editor']).toBe('astro build --config x.ts')
  })

  it('handles a one-line object, an empty one and a file with no scripts', () => {
    expect(JSON.parse(addScript('{ "scripts": { "dev": "a" } }', 'b', 'c') as string).scripts).toEqual({ b: 'c', dev: 'a' })
    expect(JSON.parse(addScript('{\n  "scripts": {}\n}\n', 'b', 'c') as string).scripts).toEqual({ b: 'c' })
    expect(addScript('{ "name": "x" }', 'b', 'c')).toBeUndefined()
  })
})

describe('the editor build config', () => {
  it('imports the site config and merges the adapter and the editor into it', () => {
    const site = makeSite()
    const base = findBaseConfig(site)
    const source = configSource(HOSTS[0] as (typeof HOSTS)[number], base as NonNullable<typeof base>)
    expect(base).toMatchObject({
      file: 'astro.config.ts',
      importPath: './astro.config',
      editorConfig: 'astro.editor.config.ts',
      addsEditor: false,
    })
    expect(source).toContain("import vercel from '@astrojs/vercel'")
    expect(source).toContain("import site from './astro.config'")
    expect(source).toContain('mergeConfig(site, {')
    expect(source).toContain("bearminionHostedEditor({ module: './src/editor.ts' })")
  })

  it('follows the config the site has: .mjs keeps its extension, and a config that adds the editor is recognised', () => {
    expect(findBaseConfig(makeSite({ configFile: 'astro.config.mjs' }))).toMatchObject({
      importPath: './astro.config.mjs',
      editorConfig: 'astro.editor.config.mjs',
    })
    expect(findBaseConfig(makeSite({ config: "integrations: [bearminionHostedEditor({ module: './x' })]" }))?.addsEditor).toBe(true)
    expect(findBaseConfig(folder('empty'))).toBeUndefined()
  })
})

describe('bearminion add hosted', () => {
  it('writes the starter files, the editor module, the build config and the script, notes them in the lock, and lists what is left', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite({ lockfile: 'pnpm-lock.yaml' })
    const { code, text } = await exec(['add', 'hosted', '--cwd', site, '--yes'], registryDir)
    expect(code, text).toBe(0)
    expect(read(site, 'src/lib/editing.ts')).toBe('export const editing = true\n')
    expect(read(site, 'src/pages/[...slug].astro')).toContain('locals.bearminion')
    expect(read(site, 'src/editor.ts')).toContain('createHostedEditor')
    expect(read(site, 'astro.editor.config.ts')).toContain('mergeConfig(site')
    expect(JSON.parse(read(site, 'package.json')).scripts['build:editor']).toBe('astro build --config astro.editor.config.ts')
    expect(read(site, 'package.json')).toContain('"dev": "astro dev"')
    expect(read(site, 'astro.config.ts')).toBe("export default { site: 'https://example.com' }\n")
    const lock = JSON.parse(read(site, LOCK_FILE))
    expect(Object.keys(lock.files)).toEqual(
      expect.arrayContaining([
        'src/lib/editing.ts',
        'src/editor.ts',
        'astro.editor.config.ts',
        'src/components/sections/media/Media.astro',
      ]),
    )
    expect(text).toContain('Build Command: pnpm run build:editor')
    expect(text).toContain('@astrojs/vercel')
    expect(text).toContain('/__bearminion/auth/callback')
  })

  it('writes a section file only when the site has that section', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite({ sections: false })
    const { code, text } = await exec(['add', 'hosted', '--cwd', site, '--yes'], registryDir)
    expect(code, text).toBe(0)
    expect(fs.existsSync(path.join(site, `${SECTIONS}/media/Media.astro`))).toBe(false)
  })

  it('writes nothing with --dry-run, and reports JSON', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const dry = await exec(['add', 'hosted', '--cwd', site, '--dry-run'], registryDir)
    expect(dry.code).toBe(0)
    expect(dry.text).toContain('Dry run: nothing was written.')
    expect(fs.existsSync(path.join(site, 'src/editor.ts'))).toBe(false)
    expect(read(site, 'package.json')).toBe(SCRIPTS)
    const json = JSON.parse((await exec(['add', 'hosted', '--cwd', site, '--dry-run', '--json'], registryDir)).text)
    expect(json).toMatchObject({ ok: true, host: 'vercel', script: 'add', dryRun: true, written: [] })
    expect(json.files.map((file: { path: string }) => file.path)).toContain('src/editor.ts')
  })

  it('asks before writing, and does not write without --yes when nobody can be asked', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    expect((await exec(['add', 'hosted', '--cwd', site], registryDir)).code).toBe(1)
    expect(fs.existsSync(path.join(site, 'src/editor.ts'))).toBe(false)
    const no = await exec(['add', 'hosted', '--cwd', site], registryDir, { confirm: async () => false })
    expect(no.code).toBe(1)
    expect(no.text).toContain('Nothing was written.')
    const yes = await exec(['add', 'hosted', '--cwd', site], registryDir, { confirm: async () => true })
    expect(yes.code).toBe(0)
    expect(fs.existsSync(path.join(site, 'src/editor.ts'))).toBe(true)
  })

  it('replaces a file of an earlier release that nobody changed, and stops on one the owner changed', async () => {
    const template = makeTemplate()
    const old = 'export const editing = false\n'
    const { registryDir } = build(template, { '1.17.0': { 'src/lib/editing.ts': hashContent('src/lib/editing.ts', old) } })
    const site = makeSite()
    write(site, 'src/lib/editing.ts', old)
    const updated = await exec(['add', 'hosted', '--cwd', site, '--yes', '--dry-run'], registryDir)
    expect(updated.text).toMatch(/update\s+src\/lib\/editing\.ts/)

    write(site, 'src/env.d.ts', '// my own types\n')
    const stopped = await exec(['add', 'hosted', '--cwd', site, '--yes'], registryDir)
    expect(stopped.code).toBe(1)
    expect(stopped.text).toMatch(/conflict\s+src\/env\.d\.ts/)
    expect(stopped.text).toContain('Nothing was written.')
    expect(fs.existsSync(path.join(site, 'src/editor.ts'))).toBe(false)
    expect(read(site, 'src/lib/editing.ts')).toBe(old)

    const forced = await exec(['add', 'hosted', '--cwd', site, '--yes', '--overwrite'], registryDir)
    expect(forced.code, forced.text).toBe(0)
    expect(read(site, 'src/env.d.ts')).toContain('// v2')
  })

  it('keeps an editor module and a build script the owner already has, and says so', async () => {
    const { registryDir } = build(makeTemplate())
    const manifest = SCRIPTS.replace('"dev"', '"build:editor": "my own build",\n    "dev"')
    const site = makeSite({ manifest })
    write(site, 'src/editor.ts', '// my editor\n')
    const { code, text } = await exec(['add', 'hosted', '--cwd', site, '--yes'], registryDir)
    expect(code, text).toBe(0)
    expect(read(site, 'src/editor.ts')).toBe('// my editor\n')
    expect(JSON.parse(read(site, 'package.json')).scripts['build:editor']).toBe('my own build')
    expect(text).toContain('src/editor.ts already exists and differs from the recipe, so it was left alone.')
    expect(text).toContain('already has a "build:editor" script')
  })

  it('does not add a second build when the site config already adds the editor', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite({ config: "export default { integrations: [bearminionHostedEditor({ module: './src/editor.ts' })] }\n" })
    const { code, text } = await exec(['add', 'hosted', '--cwd', site, '--yes'], registryDir)
    expect(code, text).toBe(0)
    expect(fs.existsSync(path.join(site, 'astro.editor.config.ts'))).toBe(false)
    expect(read(site, 'package.json')).toBe(SCRIPTS)
    expect(text).toContain('already adds the hosted editor itself')
  })

  it('is a no-op the second time', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    await exec(['add', 'hosted', '--cwd', site, '--yes'], registryDir)
    const again = await exec(['add', 'hosted', '--cwd', site, '--yes'], registryDir)
    expect(again.code).toBe(0)
    expect(again.text).toContain('Nothing to write')
  })

  it('names the adapter to install, and installs it with --install', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const calls: string[][] = []
    const { text } = await exec(['add', 'hosted', '--cwd', site, '--yes', '--install'], registryDir, {
      exec: (command: string, args: string[]) => {
        calls.push([command, ...args])
        return 0
      },
    })
    expect(calls).toEqual([['npm', 'install', '@astrojs/vercel@latest']])
    expect(text).not.toContain('Installing failed')
    const plain = await exec(['add', 'hosted', '--cwd', makeSite(), '--yes'], registryDir)
    expect(plain.text).toContain('Install it: npm install @astrojs/vercel@latest')
  })

  it('refuses a name, an unknown host, Cloudflare, a site with no Astro config and a package with no hosted files', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    expect((await exec(['add', 'hosted', 'form', '--cwd', site], registryDir)).code).toBe(2)
    expect((await exec(['add', 'hosted', '--host', 'fly', '--cwd', site], registryDir)).text).toContain('The hosts are: vercel.')
    expect((await exec(['add', 'hosted', '--host', 'cloudflare', '--cwd', site], registryDir)).text).toContain(
      'does not set up Cloudflare yet',
    )
    const bare = folder('bare')
    write(bare, 'package.json', '{}')
    expect((await exec(['add', 'hosted', '--cwd', bare, '--yes'], registryDir)).text).toContain('No Astro config found')
    const registry = readRegistry({ templateDir: makeTemplate(), version: '1.18.0' })
    const plain = folder('plain-registry')
    writeRegistry(registry, registry.template === 'default' ? makeTemplate() : makeTemplate(), plain)
    expect((await exec(['add', 'hosted', '--cwd', site, '--yes'], plain)).text).toContain('no hosted files')
  })
})
