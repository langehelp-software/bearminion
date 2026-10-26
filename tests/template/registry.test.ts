import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { run } from '../../packages/editor/src/command'
import { readRegistry, writeRegistry } from '../../packages/editor/src/registry/build'
import { hashContent } from '../../packages/editor/src/registry/hash'
import { SITE_FILES } from '../../packages/editor/src/registry/closure'
import { scanSections, syncSections } from '../../packages/editor/src/sections-manifest'

const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/default')
const sectionsDir = path.join(template, 'src/components/sections')
const temporary: string[] = []
const scratch = (label: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bearminion-${label}-`))
  temporary.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true })
})

const registry = readRegistry({ templateDir: template, version: '0.0.0-test' })
const registryDir = scratch('registry')
writeRegistry(registry, template, registryDir)

/** The template as a site would have it: its own files, and none of the files the registry can write. */
function siteWithout(remove: (file: string) => boolean): string {
  const site = scratch('site')
  fs.copyFileSync(path.join(template, 'package.json'), path.join(site, 'package.json'))
  for (const file of listFiles(path.join(template, 'src'), 'src')) {
    if (file.endsWith('.stories.ts') || file.startsWith('src/stories/') || remove(file)) continue
    fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true })
    fs.copyFileSync(path.join(template, file), path.join(site, file))
  }
  return site
}

function listFiles(dir: string, prefix: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}/${entry.name}`
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative]
  })
}

async function add(site: string, names: string[]) {
  const out: string[] = []
  const code = await run(['add', ...names, '--yes', '--cwd', site], { log: (line) => out.push(line), registryDir })
  return { code, text: out.join('\n') }
}

const sameAsTemplate = (site: string, file: string) =>
  hashContent(file, fs.readFileSync(path.join(site, file))) === hashContent(file, fs.readFileSync(path.join(template, file)))

describe('the registry of the default template', () => {
  it('has an item for every section directory, and none needs a site file or a story', () => {
    expect(Object.keys(registry.items).sort()).toEqual(scanSections(sectionsDir).map((entry) => entry.dir))
    for (const item of Object.values(registry.items)) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.description.length).toBeGreaterThan(0)
      expect(item.files.some((file) => SITE_FILES.includes(file) || file.endsWith('.stories.ts'))).toBe(false)
      expect(item.files.some((file) => file.startsWith(`src/components/sections/${item.dir}/definition.ts`))).toBe(true)
    }
  })

  it('knows every npm package it needs from the template package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(template, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    for (const item of Object.values(registry.items)) {
      for (const [name, range] of Object.entries(item.npm)) expect(pkg.dependencies[name] ?? range).toBe(range)
    }
  })
})

describe('bearminion add on a site that lacks a section', () => {
  for (const item of Object.values(registry.items)) {
    it(`gives back ${item.dir} exactly as the template has it`, async () => {
      const site = siteWithout((file) => file.startsWith(`src/components/sections/${item.dir}/`))
      expect(syncSections(path.join(site, 'src/components/sections')).entries.map((entry) => entry.dir)).not.toContain(item.dir)
      const { code, text } = await add(site, [item.dir])
      expect(text).toContain(`Adding ${item.dir}`)
      expect(code).toBe(0)
      for (const file of item.files) expect(sameAsTemplate(site, file)).toBe(true)
      expect(syncSections(path.join(site, 'src/components/sections'), { check: true }).changed).toEqual([])
      expect(scanSections(path.join(site, 'src/components/sections')).map((entry) => entry.dir)).toContain(item.dir)
      expect((await add(site, [item.dir])).text).toContain('already in this site')
    })
  }
})

describe('bearminion add on a site with nothing of the template', () => {
  it('builds every section from the registry alone', async () => {
    const tracked = new Set(Object.keys(registry.files))
    const site = siteWithout((file) => tracked.has(file))
    expect(fs.existsSync(path.join(site, 'src/components/sections/hero'))).toBe(false)
    const { code } = await add(site, Object.keys(registry.items))
    expect(code).toBe(0)
    for (const file of tracked) expect(sameAsTemplate(site, file)).toBe(true)
    const lock = JSON.parse(fs.readFileSync(path.join(site, 'bearminion.lock.json'), 'utf8')) as { files: Record<string, unknown> }
    expect(Object.keys(lock.files).sort()).toEqual([...tracked].sort())
  })
})
