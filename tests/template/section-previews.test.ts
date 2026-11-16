import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { previewHtml, remarkSectionPreviews } from '../../apps/docs/src/remark-section-previews'

const root = path.resolve(import.meta.dirname, '../..')
const sectionsDir = path.join(root, 'docs/sections')

interface Node {
  type: string
  url?: string
  alt?: string
  value?: string
  children?: Node[]
}

const screenshot = (file: string, alt = 'Hero, split layout'): Node => ({
  type: 'root',
  children: [
    { type: 'paragraph', children: [{ type: 'text', value: 'Intro.' }] },
    { type: 'paragraph', children: [{ type: 'image', url: `../images/sections/${file}.webp`, alt }] },
  ],
})

/** A previews folder holding the given section/variant pages, as scripts/build-previews.mjs leaves it. */
function previews(...built: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-previews-'))
  for (const page of built) {
    fs.mkdirSync(path.join(dir, 'section', page), { recursive: true })
    fs.writeFileSync(path.join(dir, 'section', page, 'index.html'), '<main></main>')
  }
  return dir
}

describe('the live section previews in the docs', () => {
  it('turns a layout screenshot on a section page into a frame of that layout', () => {
    const problems: string[] = []
    const tree = screenshot('text-image-right', 'Text and image, "right" layout')
    remarkSectionPreviews({ sectionsDir, previewsDir: previews('text-image/right'), problems })(tree, {
      path: path.join(sectionsDir, 'text-image.md'),
    })
    expect(problems).toEqual([])
    expect(tree.children?.[0]?.type).toBe('paragraph')
    const html = tree.children?.[1]
    expect(html?.type).toBe('html')
    expect(html?.value).toContain(
      '<iframe src="/previews/section/text-image/right/" title="Text and image, &quot;right&quot; layout" loading="lazy">',
    )
    expect(html?.value).toContain('data-tone-choice="inverse"')
  })

  it('records a screenshot whose layout has no preview, and keeps the screenshot', () => {
    const problems: string[] = []
    const tree = screenshot('hero-gone')
    remarkSectionPreviews({ sectionsDir, previewsDir: previews('hero/split'), problems })(tree, { path: path.join(sectionsDir, 'hero.md') })
    expect(problems).toEqual(['docs/sections/hero.md: no preview for hero/gone; is it still a layout?'])
    expect(tree.children?.[1]?.type).toBe('paragraph')
  })

  it('leaves the screenshots alone when the previews were not built, and on pages outside docs/sections', () => {
    const problems: string[] = []
    const missing = path.join(os.tmpdir(), 'bearminion-no-previews')
    const tree = screenshot('hero-split')
    remarkSectionPreviews({ sectionsDir, previewsDir: missing, problems })(tree, { path: path.join(sectionsDir, 'hero.md') })
    expect(tree.children?.[1]?.type).toBe('paragraph')
    const elsewhere = screenshot('hero-split')
    remarkSectionPreviews({ sectionsDir, previewsDir: previews('hero/split'), problems })(elsewhere, {
      path: path.join(root, 'docs/editor.md'),
    })
    expect(elsewhere.children?.[1]?.type).toBe('paragraph')
    expect(problems).toEqual([])
  })

  it('names a preview for every screenshot of a layout on the section pages', () => {
    const shots = fs
      .readdirSync(sectionsDir)
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .flatMap((file) =>
        [...fs.readFileSync(path.join(sectionsDir, file), 'utf8').matchAll(/\]\(\.\.\/images\/sections\/([a-z0-9-]+)\.webp\)/g)].map(
          (match) => ({ file, name: match[1] ?? '' }),
        ),
      )
    expect(shots.length).toBeGreaterThan(30)
    for (const { file, name } of shots) expect(name.startsWith(`${file.replace(/\.md$/, '')}-`), `${file}: ${name}`).toBe(true)
    expect(previewHtml('cta', 'band', 'CTA')).toContain('href="/previews/section/cta/band/"')
  })
})
