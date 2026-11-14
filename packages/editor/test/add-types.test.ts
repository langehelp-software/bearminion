import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../src/command.js'
import { readRegistry, writeRegistry } from '../src/registry/build.js'
import { TYPES_GROUP } from '../src/registry/groups.js'
import { hashContent } from '../src/registry/hash.js'
import { readHistory } from '../src/registry/history.js'
import { LOCK_FILE } from '../src/registry/types.js'

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

const ROUTE = 'src/pages/[...slug].astro'
const OLD: Record<string, string> = {
  [ROUTE]: '---\nconst page = await getPage()\n---\n',
  'src/content.config.ts': 'export const collections = { pages, site }\n',
  'src/lib/content.ts': 'export async function getPage() {}\n',
  'src/lib/sitemap.ts': 'export function createSitemapFilter(pages) {}\n',
}
const NEW: Record<string, string> = {
  [ROUTE]: '---\nconst route = await getRoute(pathname)\n---\n',
  'src/content.config.ts': 'export const collections = { pages, site, ...types }\n',
  'src/lib/content.ts': 'export async function getRoute() {}\n',
  'src/lib/sitemap.ts': 'export function createSitemapFilter(routes) {}\n',
  'src/components/organisms/EntryList.astro': '---\n---\n<ul></ul>\n',
  'src/components/organisms/Pagination.astro': '---\n---\n<nav></nav>\n',
}
const SECTIONS = 'src/components/sections'

function registryDir(): string {
  const template = folder('template')
  write(template, 'package.json', JSON.stringify({ dependencies: { astro: '^7.0.0' } }))
  for (const name of ['definitions.ts', 'definitions.gen.ts', 'components.gen.ts']) write(template, `${SECTIONS}/${name}`, '// file\n')
  // The registry needs at least one section to scan.
  write(
    template,
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
  write(template, `${SECTIONS}/media/wireframe.ts`, 'export const wireframe = []\n')
  write(template, `${SECTIONS}/media/Media.astro`, '---\n---\n<p>media</p>\n')
  for (const [file, content] of Object.entries(NEW)) write(template, file, content)
  const history = { '1.20.0': Object.fromEntries(Object.entries(OLD).map(([file, content]) => [file, hashContent(file, content)])) }
  const registry = readRegistry({ templateDir: template, version: '1.21.0', history, groups: { types: TYPES_GROUP } })
  const dir = folder('registry')
  writeRegistry(registry, template, dir)
  return dir
}

function site(files: Record<string, string> = OLD, config = 'sitemap({ filter: createSitemapFilter(content.pages) })\n'): string {
  const dir = folder('site')
  write(dir, 'package.json', '{ "name": "site" }\n')
  write(dir, 'astro.config.ts', config)
  for (const [file, content] of Object.entries(files)) write(dir, file, content)
  return dir
}

async function exec(argv: string[], registry: string, extra: Record<string, unknown> = {}) {
  const out: string[] = []
  const code = await run(argv, { log: (line) => out.push(line), registryDir: registry, ...extra })
  return { code, text: out.join('\n') }
}

describe('bearminion add types', () => {
  it('updates the files of a 1.20 site, adds the listing components, and says what is left', async () => {
    const root = site()
    const { code, text } = await exec(['add', 'types', '--cwd', root, '--yes'], registryDir())
    expect(code, text).toBe(0)
    for (const [file, content] of Object.entries(NEW)) expect(read(root, file), file).toBe(content)
    expect(text).toContain(`update    ${ROUTE}`)
    expect(text).toContain('create    src/components/organisms/EntryList.astro')
    expect(text).toContain('Wrote 6 files')
    expect(Object.keys(JSON.parse(read(root, LOCK_FILE)).files)).toEqual(Object.keys(NEW).sort())
    // The site's own config is not written, and the person is told what it leaves out.
    expect(read(root, 'astro.config.ts')).toContain('content.pages')
    expect(text).toMatch(/astro\.config\.ts is yours and was not changed.*sitemap/)
    expect(text).toContain('defineTypes')
  })

  it('stops on a file the person changed, writes nothing, and replaces it with --overwrite', async () => {
    const registry = registryDir()
    const root = site({ ...OLD, [ROUTE]: '---\n// my own route\n---\n' })
    const stopped = await exec(['add', 'types', '--cwd', root, '--yes'], registry)
    expect(stopped.code).toBe(1)
    expect(stopped.text).toContain(`conflict  ${ROUTE}`)
    expect(stopped.text).toContain('Nothing was written.')
    expect(read(root, 'src/lib/content.ts')).toBe(OLD['src/lib/content.ts'])
    expect(fs.existsSync(path.join(root, 'src/components/organisms/EntryList.astro'))).toBe(false)

    const forced = await exec(['add', 'types', '--cwd', root, '--yes', '--overwrite'], registry)
    expect(forced.code, forced.text).toBe(0)
    expect(read(root, ROUTE)).toBe(NEW[ROUTE])
  })

  it('has nothing to do on a current site, and no note when the config already passes routes', async () => {
    const root = site(NEW, 'sitemap({ filter: createSitemapFilter(siteRoutes(model, content)) })\n')
    const { code, text } = await exec(['add', 'types', '--cwd', root, '--yes'], registryDir())
    expect(code).toBe(0)
    expect(text).toContain('Nothing to write')
    expect(text).not.toContain('is yours')
  })

  it('writes nothing with --dry-run, reports JSON, and does not write unasked', async () => {
    const registry = registryDir()
    const root = site()
    const dry = await exec(['add', 'types', '--cwd', root, '--dry-run'], registry)
    expect(dry.code).toBe(0)
    expect(dry.text).toContain('Dry run: nothing was written.')
    expect(read(root, ROUTE)).toBe(OLD[ROUTE])
    const json = JSON.parse((await exec(['add', 'types', '--cwd', root, '--dry-run', '--json'], registry)).text)
    expect(json).toMatchObject({ ok: true, dryRun: true, written: [] })
    expect(json.files).toContainEqual({ path: ROUTE, action: 'update' })
    expect((await exec(['add', 'types', '--cwd', root], registry)).code).toBe(1)
    expect((await exec(['add', 'types', 'blog', '--cwd', root, '--yes'], registry)).code).toBe(2)
    expect(read(root, ROUTE)).toBe(OLD[ROUTE])
  })
})

describe('the real registry history', () => {
  it('knows the 1.20.0 copy of every content type file that existed then, so an untouched site updates without --overwrite', () => {
    const history = readHistory(path.resolve(__dirname, '../registry-history.json'))
    for (const file of [ROUTE, 'src/content.config.ts', 'src/lib/content.ts', 'src/lib/sitemap.ts']) {
      expect(history['1.20.0']?.[file], file).toMatch(/^[0-9a-f]{64}$/)
      expect(history['1.0.1']?.[file], file).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})
