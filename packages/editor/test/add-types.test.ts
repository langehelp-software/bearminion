import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONTENT_MODEL_PATH,
  linkContentModel,
  normalizePath,
  PRESETS,
  registerType,
  specProblem,
  TYPES_DIR,
  TYPES_INDEX,
  type TypeSpec,
  typeFileSource,
  typesIndexSource,
  variableName,
} from '../src/add/type.js'
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
    expect(text).toContain('npx bearminion add type')
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
  it('updates the files, writes the blog type and the index, and passes them in a content model shaped like the starter’s', async () => {
    const root = site({ ...OLD, [CONTENT_MODEL_PATH]: MODEL })
    const { code, text } = await exec(['add', 'blog', '--cwd', root, '--yes'], registryDir())
    expect(code, text).toBe(0)
    expect(text).toContain(`create    ${TYPES_DIR}/blog.ts`)
    expect(text).toContain(`create    ${TYPES_INDEX}`)
    expect(text).toContain(`update    ${CONTENT_MODEL_PATH}`)
    expect(text).toContain('Wrote 9 files')
    expect(read(root, ROUTE)).toBe(NEW[ROUTE])
    expect(read(root, `${TYPES_DIR}/blog.ts`)).toBe(typeFileSource(PRESETS.blog as TypeSpec))
    expect(read(root, TYPES_INDEX)).toContain('export const siteTypes = defineTypes({\n  blog,\n})')
    const model = read(root, CONTENT_MODEL_PATH)
    expect(model).toContain(
      "import { siteDefinition } from '../components/organisms/site-definition'\nimport { siteTypes } from './types'\n",
    )
    expect(model).toContain('  site: siteDefinition,\n  types: siteTypes,\n  theme: defineTheme({}),')
    // The type files and the content model are the site's own, so they are not tracked in the lock.
    expect(Object.keys(JSON.parse(read(root, LOCK_FILE)).files)).not.toContain(CONTENT_MODEL_PATH)

    const again = await exec(['add', 'blog', '--cwd', root, '--yes'], registryDir())
    expect(again.code).toBe(1)
    expect(again.text).toContain(`${TYPES_DIR}/blog.ts already exists`)
    expect(read(root, CONTENT_MODEL_PATH)).toBe(model)
  })

  it('leaves a content model of another shape alone and prints the lines to add', async () => {
    const own = 'export const contentModel = makeModel()\n'
    const root = site({ ...NEW, [CONTENT_MODEL_PATH]: own })
    const { code, text } = await exec(['add', 'blog', '--cwd', root, '--yes'], registryDir())
    expect(code, text).toBe(0)
    expect(read(root, CONTENT_MODEL_PATH)).toBe(own)
    expect(text).toContain('was left as it is')
    expect(text).toContain('  types: siteTypes,')
    expect(fs.existsSync(path.join(root, `${TYPES_DIR}/blog.ts`))).toBe(true)
  })

  it('declares nothing when a changed file stops the update, and nothing on a dry run', async () => {
    const registry = registryDir()
    const stopped = site({ ...OLD, [ROUTE]: '---\n// mine\n---\n', [CONTENT_MODEL_PATH]: MODEL })
    expect((await exec(['add', 'blog', '--cwd', stopped, '--yes'], registry)).code).toBe(1)
    expect(read(stopped, CONTENT_MODEL_PATH)).toBe(MODEL)
    expect(fs.existsSync(path.join(stopped, TYPES_DIR))).toBe(false)
    const dry = site({ ...OLD, [CONTENT_MODEL_PATH]: MODEL })
    const { text } = await exec(['add', 'blog', '--cwd', dry, '--dry-run', '--json'], registry)
    expect(JSON.parse(text)).toMatchObject({ ok: true, dryRun: true, declared: { id: 'blog' } })
    expect(read(dry, CONTENT_MODEL_PATH)).toBe(MODEL)
    expect((await exec(['add', 'blog', 'news', '--cwd', dry, '--yes'], registry)).code).toBe(2)
  })
})

describe('bearminion add type', () => {
  it('declares a second type next to the first: a new file and one line in the index', async () => {
    const registry = registryDir()
    const root = site({ ...NEW, [CONTENT_MODEL_PATH]: MODEL })
    expect((await exec(['add', 'blog', '--cwd', root, '--yes'], registry)).code).toBe(0)
    const model = read(root, CONTENT_MODEL_PATH)
    const { code, text } = await exec(
      [
        'add',
        'type',
        'case-studies',
        '--cwd',
        root,
        '--yes',
        '--field',
        'client:text',
        '--field',
        'year:number',
        '--field',
        'level?:choice=small|large',
        '--field',
        'tags:list',
        '--sort',
        'year:desc',
        '--listing',
        '6',
      ],
      registry,
    )
    expect(code, text).toBe(0)
    expect(read(root, CONTENT_MODEL_PATH)).toBe(model)
    const index = read(root, TYPES_INDEX)
    expect(index).toContain("import { blog } from './blog'\nimport { caseStudies } from './case-studies'\n")
    expect(index).toContain("defineTypes({\n  blog,\n  'case-studies': caseStudies,\n})")
    const file = read(root, `${TYPES_DIR}/case-studies.ts`)
    expect(file).toContain("import { multi } from 'bearminion'\nimport { z } from 'zod'")
    expect(file).toContain("export const caseStudies = multi({\n  path: '/case-studies/{slug}',")
    expect(file).toContain("    level: z.enum(['small', 'large']).optional(),")
    expect(file).toContain('    tags: z.array(z.string()).default([]),')
    expect(file).toContain("  sort: { by: 'year', order: 'desc' },\n  listing: { perPage: 6 },")

    const clash = await exec(['add', 'type', 'posts', '--path', '/blog/{slug}', '--cwd', root, '--yes'], registry)
    expect(clash.code).toBe(2)
    expect(clash.text).toContain(`/blog is already the address of the type in ${TYPES_DIR}/blog.ts`)
  })

  it('declares a single without fields or a listing', async () => {
    const root = site({ ...NEW, [CONTENT_MODEL_PATH]: MODEL })
    const { code, text } = await exec(['add', 'type', 'about', '--kind', 'single', '--cwd', root, '--yes'], registryDir())
    expect(code, text).toBe(0)
    expect(read(root, `${TYPES_DIR}/about.ts`)).toContain("import { single } from 'bearminion'\n\n")
    expect(read(root, `${TYPES_DIR}/about.ts`)).toContain("export const about = single({\n  path: '/about',\n})")
  })

  it('refuses what astro dev would refuse, before writing anything', async () => {
    const registry = registryDir()
    const root = site({ ...NEW, [CONTENT_MODEL_PATH]: MODEL, 'content/pages/about.json': '{}\n' })
    const cases: Array<[string[], string]> = [
      [['add', 'type', 'News'], 'kebab-case'],
      [['add', 'type', 'home'], 'cannot be a type id'],
      [['add', 'type', 'news', '--field', 'title:text'], 'every entry already has a title'],
      [['add', 'type', 'news', '--field', 'when?:date', '--sort', 'when:desc'], 'optional'],
      [['add', 'type', 'news', '--field', 'x:colour'], 'the kind must be one of'],
      [['add', 'type', 'news', '--listing', 'many'], '--listing'],
      [['add', 'type', 'about', '--kind', 'single', '--listing', '5'], 'A single'],
      [['add', 'type'], 'Give the type an id'],
      [['add', 'type', 'company', '--kind', 'single', '--path', '/about'], '/about is already a page (content/pages/about.json)'],
    ]
    for (const [argv, message] of cases) {
      const { code, text } = await exec([...argv, '--cwd', root, '--yes'], registry)
      expect(code, argv.join(' ')).toBe(2)
      expect(text, argv.join(' ')).toContain(message)
    }
    expect(fs.existsSync(path.join(root, TYPES_DIR))).toBe(false)
  })

  it('asks in a terminal: what it is, its address, its fields, a listing and the order', async () => {
    const root = site({ ...NEW, [CONTENT_MODEL_PATH]: MODEL })
    const answers = ['events', '', 'startsOn', 'venue', 'Main hall, Garden', '']
    // Add a field, startsOn required, another, venue required, another (then no name), a listing, write.
    const yesNo = [true, true, true, true, true, true, true]
    const picks = ['multi', 'date', 'choice', 'startsOn:asc']
    const asked: string[] = []
    const { code, text } = await exec(['add', 'type', '--cwd', root], registryDir(), {
      ask: async (question: string, initial?: string) => {
        asked.push(question)
        return answers.shift() || initial || ''
      },
      confirm: async (question: string) => {
        asked.push(question)
        return yesNo.shift() ?? false
      },
      choose: async (question: string) => {
        asked.push(question)
        return picks.shift()
      },
    })
    expect(code, `${text}\n${asked.join('\n')}`).toBe(0)
    const file = read(root, `${TYPES_DIR}/events.ts`)
    expect(file).toContain("  path: '/events/{slug}',")
    expect(file).toContain('    startsOn: z.iso.date(),')
    expect(file).toContain("    venue: z.enum(['Main hall', 'Garden']),")
    expect(file).toContain("  sort: { by: 'startsOn', order: 'asc' },\n  listing: { perPage: 10 },")
    expect(asked.at(-1)).toBe('Write 3 files?')
  })

  it('stops when the person gives no id, and writes nothing', async () => {
    const root = site({ ...NEW, [CONTENT_MODEL_PATH]: MODEL })
    const { code } = await exec(['add', 'type', '--cwd', root], registryDir(), {
      ask: async () => '',
      confirm: async () => true,
      choose: async () => undefined,
    })
    expect(code).toBe(1)
    expect(fs.existsSync(path.join(root, TYPES_DIR))).toBe(false)
  })
})

describe('the type files', () => {
  it('writes each preset and flag shape as a type the package accepts', () => {
    for (const spec of Object.values(PRESETS)) expect(specProblem(spec)).toBeUndefined()
    expect(variableName('2024-news')).toBe('type2024News')
    expect(normalizePath('multi', 'news/')).toBe('/news/{slug}')
    expect(normalizePath('single', '/about')).toBe('/about')
  })

  it('adds to an index this command wrote, and leaves any other shape alone', () => {
    const index = typesIndexSource('blog')
    const edit = registerType(index, 'news')
    expect(edit.action).toBe('update')
    expect(registerType(edit.action === 'update' ? edit.source : '', 'news').action).toBe('present')
    expect(registerType('export const siteTypes = { blog }\n', 'news').action).toBe('manual')
    const sorted = registerType(typesIndexSource('news'), 'blog')
    expect(sorted.action === 'update' && sorted.source).toContain("import { blog } from './blog'\nimport { news } from './news'\n")
    const empty = registerType("import { defineTypes } from 'bearminion'\n\nexport const siteTypes = defineTypes({})\n", 'news')
    expect(empty.action === 'update' && empty.source).toContain(
      "import { news } from './news'\n\nexport const siteTypes = defineTypes({\n  news,\n})",
    )
  })

  it('passes siteTypes in the content model once, and leaves a model with its own types alone', () => {
    const linked = linkContentModel(MODEL)
    expect(linked.action).toBe('link')
    expect(linkContentModel(linked.action === 'link' ? linked.source : '').action).toBe('linked')
    expect(linkContentModel(MODEL.replace('  site: siteDefinition,', '  site: siteDefinition,\n  types: defineTypes({}),')).action).toBe(
      'other',
    )
    expect(linkContentModel(MODEL.replace('  site: siteDefinition,', '  site: mySite,')).action).toBe('manual')
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
