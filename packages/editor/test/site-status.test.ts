import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleEditorRequest } from '../src/api.js'
import { createMigrator } from '../src/migrate.js'
import { API_PREFIX } from '../src/model.js'
import type { EditorContext } from '../src/options.js'
import type { Registry } from '../src/registry/types.js'
import { buildSiteStatus, isNewerVersion, sectionState } from '../src/site-status.js'
import { localSiteStatus } from '../src/site-status-local.js'
import { createFileStore } from '../src/store.js'
import { defaultTheme } from '../src/theme.js'
import { VERSION } from '../src/version.js'
import { siteDefinition } from './starter.js'

const section = (type: string, label: string) => ({ type, label, description: `${label} section` }) as never

const catalog: Registry = {
  schemaVersion: 1,
  template: 'default',
  version: '9.9.9',
  files: {},
  items: {
    hero: { dir: 'hero', type: 'hero', label: 'Hero', description: 'Big top', files: [], npm: {} },
    'logo-strip': { dir: 'logo-strip', type: 'logoStrip', label: 'Logo strip', description: 'Logos', files: [], npm: {} },
    faq: { dir: 'faq', type: 'faq', label: 'FAQ', description: 'Questions', files: [], npm: {} },
  },
}

let root = ''
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true })
  root = ''
})

describe('site status', () => {
  it('lists installed sections with their state, then what the release can add', () => {
    const status = buildSiteStatus({
      version: '1.2.3',
      mode: 'local',
      sections: { hero: section('hero', 'Hero'), pricingTable: section('pricingTable', 'Pricing table') },
      catalog,
      files: { hero: { current: 2, outdated: 1 } },
    })
    expect(status.sections).toEqual([
      { dir: 'hero', type: 'hero', label: 'Hero', description: 'Hero section', installed: true, state: 'update' },
      {
        dir: 'pricing-table',
        type: 'pricingTable',
        label: 'Pricing table',
        description: 'Pricing table section',
        installed: true,
        state: 'custom',
      },
      { dir: 'faq', type: 'faq', label: 'FAQ', description: 'Questions', installed: false },
      { dir: 'logo-strip', type: 'logoStrip', label: 'Logo strip', description: 'Logos', installed: false },
    ])
  })

  it('knows only what is installed without a catalog', () => {
    const status = buildSiteStatus({ version: '1.2.3', mode: 'hosted', sections: { logoStrip: section('logoStrip', 'Logo strip') } })
    expect(status.sections).toEqual([
      { dir: 'logo-strip', type: 'logoStrip', label: 'Logo strip', description: 'Logo strip section', installed: true },
    ])
  })

  it('sums file states into one per section', () => {
    expect(sectionState({ current: 3 })).toBe('current')
    expect(sectionState({ current: 1, edited: 1 })).toBe('edited')
    expect(sectionState({ edited: 1, outdated: 1 })).toBe('update')
    expect(sectionState({ outdated: 1, conflict: 1 })).toBe('conflict')
    expect(sectionState({ differs: 1 })).toBe('conflict')
  })

  it('knows its own version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('compares versions', () => {
    expect(isNewerVersion('1.26.0', '1.25.9')).toBe(true)
    expect(isNewerVersion('1.25.0', '1.25.0')).toBe(false)
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(false)
    expect(isNewerVersion('2.0.0', '2.0.0-beta.1')).toBe(true)
    expect(isNewerVersion('2.0.0-beta.1', '1.9.0')).toBe(true)
  })

  it('answers GET /status from a local project, comparing files with the registry', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-status-'))
    const file = 'src/components/sections/hero/Hero.astro'
    fs.mkdirSync(path.join(root, 'src/components/sections/hero'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src/components/sections/hero/definition.ts'), '')
    fs.writeFileSync(path.join(root, file), 'mine')
    const registryFile = path.join(root, 'registry.json')
    fs.writeFileSync(
      registryFile,
      JSON.stringify({
        ...catalog,
        files: { [file]: { hash: 'release', history: [] } },
        items: { ...catalog.items, hero: { ...catalog.items.hero, files: [file] } },
      }),
    )
    const context: EditorContext = {
      root,
      contentDir: path.join(root, 'content'),
      uploadsDir: path.join(root, 'src/assets/uploads'),
      videosDir: path.join(root, 'public/videos'),
      maxVideoBytes: 1,
      maxImageBytes: 1,
      imageConvert: null,
      pageRules: { rename: true, delete: true },
      sections: { hero: section('hero', 'Hero') },
      site: siteDefinition,
      store: createFileStore({ root, contentDir: path.join(root, 'content'), uploadsDir: path.join(root, 'src/assets/uploads') }),
      migrator: createMigrator(),
      theme: defaultTheme,
      git: false,
    }
    context.siteStatus = localSiteStatus(context, registryFile)
    const request = new Request(`http://127.0.0.1:4321${API_PREFIX}/status`, { headers: { host: '127.0.0.1:4321' } })
    const response = await handleEditorRequest(request, context, { remoteAddress: '127.0.0.1' })
    const body = (await response?.json()) as {
      version: string
      mode: string
      sections: { dir: string; state?: string; installed: boolean }[]
    }
    expect(body.version).toBe(VERSION)
    expect(body.mode).toBe('local')
    // The file is neither the release's nor in a lock: it needs a look before `add` touches it.
    expect(body.sections[0]).toMatchObject({ dir: 'hero', installed: true, state: 'conflict' })
    expect(body.sections.filter((item) => !item.installed).map((item) => item.dir)).toEqual(['faq', 'logo-strip'])
  })
})
