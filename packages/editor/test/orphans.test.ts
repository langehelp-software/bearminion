import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { handleEditorRequest } from '../src/api.js'
import { API_PREFIX, resolveEditorContext } from '../src/options.js'
import { isOrphanSection } from '../src/section-schema.js'
import { ContentValidationError } from '../src/index.js'
import { loadContent } from '../src/astro.js'
import { withoutOrphanSections } from '../src/page.js'
import { contentCollections } from '../src/content.js'
import { validateEditorPage, validatePage } from '../src/validate.js'
import { contentModel, sectionRegistry } from './starter.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const starterContent = path.resolve(here, '../../../templates/default/content')
/** The starter's images: saving content that points at a missing image fails validation. */
const starterAssets = path.resolve(here, '../../../templates/default/src/assets')
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

const orphan = { id: 'old-1', type: 'retired', props: { heading: 'Gone' }, extra: 1 }

function projectWithOrphan(): { root: string; contentDir: string; file: string; page: { sections: unknown[] } } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-orphan-'))
  roots.push(root)
  const contentDir = path.join(root, 'content')
  fs.cpSync(starterContent, contentDir, { recursive: true })
  fs.cpSync(starterAssets, path.join(root, 'src', 'assets'), { recursive: true })
  const file = path.join(contentDir, 'pages', 'about.json')
  const page = JSON.parse(fs.readFileSync(file, 'utf8')) as { sections: unknown[] }
  page.sections.splice(1, 0, orphan)
  fs.writeFileSync(file, JSON.stringify(page))
  return { root, contentDir, file, page }
}

describe('orphaned sections', () => {
  it('detects an unregistered type', () => {
    expect(isOrphanSection(sectionRegistry, orphan)).toBe(true)
    expect(isOrphanSection(sectionRegistry, { type: 'hero' })).toBe(false)
    expect(isOrphanSection(sectionRegistry, { type: 'toString' })).toBe(true)
    expect(isOrphanSection(sectionRegistry, 'x')).toBe(false)
  })

  it('is rejected by the site schema and kept by the editor schema', () => {
    const { page } = projectWithOrphan()
    expect(validatePage(page, sectionRegistry).success).toBe(false)
    const result = validateEditorPage(page, sectionRegistry)
    expect(result.success).toBe(true)
    expect(result.success && result.data.sections[1]).toEqual(orphan)
  })

  it('still validates registered sections and orphan identity', () => {
    const { page } = projectWithOrphan()
    const badOrphan = { ...page, sections: [{ type: 'retired', id: 'has space' }] }
    expect(validateEditorPage(badOrphan, sectionRegistry).success).toBe(false)
    const badKnown = { ...page, sections: [{ id: 'h', type: 'hero', variant: 'nope', tone: 'base', props: {} }] }
    const result = validateEditorPage(badKnown, sectionRegistry)
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0]?.path.slice(0, 2)).toEqual(['sections', 0])
    const duplicate = { ...page, sections: [orphan, { ...orphan }] }
    expect(validateEditorPage(duplicate, sectionRegistry).success).toBe(false)
  })

  it('keeps the orphan through an editor save and leaves the preview without it', async () => {
    const { root, contentDir, file } = projectWithOrphan()
    const context = resolveEditorContext({ ...contentModel, contentDir }, root)
    const rendered: unknown[] = []
    const call = async (method: string, pathname: string, json?: unknown) => {
      const headers = new Headers({ host: '127.0.0.1:4321' })
      if (json !== undefined) headers.set('content-type', 'application/json')
      const response = await handleEditorRequest(
        new Request(`http://127.0.0.1:4321${pathname}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) }),
        context,
        {
          remoteAddress: '127.0.0.1',
          renderPreview: async (page) => {
            rendered.push(page)
            return '<p>ok</p>'
          },
        },
      )
      if (response === null) throw new Error('no response')
      return response
    }

    const loaded = await call('GET', `${API_PREFIX}/pages/about`)
    expect(loaded.status).toBe(200)
    const page = (await loaded.json()) as { sections: { id: string }[] }
    expect(page.sections.map((section) => section.id)).toContain('old-1')

    expect((await call('POST', `${API_PREFIX}/preview`, { page })).status).toBe(200)
    expect((rendered[0] as { sections: { id: string }[] }).sections.map((section) => section.id)).not.toContain('old-1')

    expect((await call('PUT', `${API_PREFIX}/pages/about`, page)).status).toBe(200)
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as { sections: { id: string; extra?: number }[] }
    expect(written.sections.find((section) => section.id === 'old-1')).toMatchObject({ extra: 1, type: 'retired' })

    const pages = await call('GET', `${API_PREFIX}/pages`)
    expect(pages.status).toBe(200)

    // An orphan the file does not already have is refused, with or without the existing one.
    const added = { ...page, sections: [...page.sections, { id: 'new-1', type: 'retired', props: {} }] }
    const refused = await call('PUT', `${API_PREFIX}/pages/about`, added)
    expect(refused.status).toBe(400)
    expect(JSON.stringify(await refused.json())).toContain(`sections.${added.sections.length - 1}.type`)
    const retyped = {
      ...page,
      sections: page.sections.map((section) => (section.id === 'old-1' ? { ...section, type: 'other' } : section)),
    }
    expect((await call('PUT', `${API_PREFIX}/pages/about`, retyped)).status).toBe(400)
  })

  it('lets config-time loading tolerate them while the strict loaders still fail', () => {
    const { contentDir } = projectWithOrphan()
    expect(() => loadContent(contentDir, contentModel)).toThrow(ContentValidationError)
    const content = loadContent(contentDir, contentModel, { tolerateOrphans: true })
    expect(content.pages.find((page) => page.slug === 'about')?.sections.map((section) => section.id)).toContain('old-1')
  })

  it('tolerates them in collections only when asked, and drops them for rendering', () => {
    const { contentDir, page } = projectWithOrphan()
    expect(contentCollections(contentModel, { contentDir }).pages.schema.safeParse(page).success).toBe(false)
    const tolerant = contentCollections(contentModel, { contentDir, tolerateOrphans: true }).pages.schema.safeParse(page)
    expect(tolerant.success).toBe(true)
    if (!tolerant.success) return
    const drawn = withoutOrphanSections(tolerant.data, sectionRegistry)
    expect(drawn.sections.map((section) => section.id)).not.toContain('old-1')
    expect(drawn.sections).toHaveLength(tolerant.data.sections.length - 1)
    expect(withoutOrphanSections(drawn, sectionRegistry)).toBe(drawn)
  })
})
