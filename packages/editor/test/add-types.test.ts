import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CONTENT_MODEL_PATH, declareBlog } from '../src/add/blog.js'
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

const MODEL = [
  "import { defineTheme } from 'bearminion'",
  "import { siteDefinition } from '../components/organisms/site-definition'",
  '',
  'export const contentModel = {',
  '  sections: sectionDefinitions,',
  '  site: siteDefinition,',
  '  theme: defineTheme({}),',
  '}',
  '',
].join('\n')

describe('bearminion add blog', () => {
  it('updates the files and declares the blog in a content model shaped like the starter’s', async () => {
    const root = site({ ...OLD, [CONTENT_MODEL_PATH]: MODEL })
    const { code, text } = await exec(['add', 'blog', '--cwd', root, '--yes'], registryDir())
    expect(code, text).toBe(0)
    expect(text).toContain(`declare   ${CONTENT_MODEL_PATH}`)
    expect(text).toContain('Wrote 7 files')
    expect(read(root, ROUTE)).toBe(NEW[ROUTE])
    const model = read(root, CONTENT_MODEL_PATH)
    expect(model).toContain("import { defineTheme, defineTypes, imageSchema, multi } from 'bearminion'")
    expect(model).toContain("import { z } from 'zod'")
    expect(model).toContain("  site: siteDefinition,\n  types: defineTypes({\n    blog: multi({\n      path: '/blog/{slug}',")
    expect(model).toContain('  theme: defineTheme({}),')
    // The content model is the site's own file, so it is not tracked in the lock.
    expect(Object.keys(JSON.parse(read(root, LOCK_FILE)).files)).not.toContain(CONTENT_MODEL_PATH)

    const again = await exec(['add', 'blog', '--cwd', root, '--yes'], registryDir())
    expect(again.code).toBe(0)
    expect(again.text).toContain('already declares content types')
    expect(read(root, CONTENT_MODEL_PATH)).toBe(model)
  })

  it('leaves a content model of another shape alone and prints the lines to add', async () => {
    const own = 'export const contentModel = makeModel()\n'
    const root = site({ ...NEW, [CONTENT_MODEL_PATH]: own })
    const { code, text } = await exec(['add', 'blog', '--cwd', root, '--yes'], registryDir())
    expect(code).toBe(0)
    expect(read(root, CONTENT_MODEL_PATH)).toBe(own)
    expect(text).toContain('was left as it is')
    expect(text).toContain('blog: multi({')
  })

  it('declares nothing when a changed file stops the update, and nothing on a dry run', async () => {
    const registry = registryDir()
    const stopped = site({ ...OLD, [ROUTE]: '---\n// mine\n---\n', [CONTENT_MODEL_PATH]: MODEL })
    expect((await exec(['add', 'blog', '--cwd', stopped, '--yes'], registry)).code).toBe(1)
    expect(read(stopped, CONTENT_MODEL_PATH)).toBe(MODEL)
    const dry = site({ ...OLD, [CONTENT_MODEL_PATH]: MODEL })
    const { text } = await exec(['add', 'blog', '--cwd', dry, '--dry-run', '--json'], registry)
    expect(JSON.parse(text)).toMatchObject({ ok: true, dryRun: true, contentModel: 'declare' })
    expect(read(dry, CONTENT_MODEL_PATH)).toBe(MODEL)
  })
})

describe('declareBlog', () => {
  it('keeps the imports the file has, and adds zod once', () => {
    const withZod = MODEL.replace('import { siteDefinition }', "import { z } from 'zod'\nimport { siteDefinition }")
    const result = declareBlog(withZod)
    expect(result.action).toBe('declare')
    expect(result.action === 'declare' && result.source.match(/from 'zod'/g)).toHaveLength(1)
    expect(declareBlog(MODEL.replace('  site: siteDefinition,', '  site: siteDefinition,\n  types: defineTypes({}),')).action).toBe(
      'present',
    )
    expect(declareBlog(MODEL.replace("import { defineTheme } from 'bearminion'", '')).action).toBe('manual')
    expect(declareBlog(MODEL.replace('  site: siteDefinition,', '  site: mySite,')).action).toBe('manual')
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
