import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { scanSections, syncSections } from '../../packages/editor/src/sections-manifest'
import { sectionDefinitions, sectionTypes } from '../../templates/default/src/components/sections/definitions'

const sectionsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/default/src/components/sections')

describe('the starter sections', () => {
  it('has generated files that match its directories (run `npx bearminion sync` when this fails)', () => {
    expect(syncSections(sectionsDir, { check: true }).changed).toEqual([])
  })

  it('registers every directory under its camelCase name, and that name is the definition type', () => {
    const entries = scanSections(sectionsDir)
    expect(Object.keys(sectionDefinitions).sort()).toEqual(entries.map((entry) => entry.key).sort())
    for (const { key } of entries) expect(sectionDefinitions[key as keyof typeof sectionDefinitions].type).toBe(key)
  })

  it('has a component for every type', () => {
    // The map imports `.astro` files, which this runner cannot load, so read its keys from the file.
    const text = fs.readFileSync(path.join(sectionsDir, 'components.gen.ts'), 'utf8')
    const mapped = [...text.matchAll(/^ {2}(\w+): \w+,$/gm)].map((match) => match[1])
    expect(mapped.sort()).toEqual([...sectionTypes].sort())
  })

  it('keeps the order of the Add section menu', () => {
    expect(sectionTypes).toEqual([
      'hero',
      'logoStrip',
      'steps',
      'gallery',
      'features',
      'text',
      'textImage',
      'stats',
      'testimonials',
      'pricing',
      'media',
      'faq',
      'cta',
      'contact',
    ])
    expect(Object.keys(sectionDefinitions)).toEqual([...sectionTypes])
  })
})
