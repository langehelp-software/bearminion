import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readRegistry } from '../src/registry/build.js'
import { GROUPS } from '../src/registry/groups.js'
import { readHistory } from '../src/registry/history.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const history = readHistory(path.resolve(here, '../registry-history.json'))
const registry = readRegistry({
  templateDir: path.resolve(here, '../../../templates/default'),
  version: '0.0.0-test',
  history,
  groups: GROUPS,
})

describe('the real registry history', () => {
  it('goes back to 1.0, so a site made before 1.9 is recognised without a lock file', () => {
    expect(Object.keys(history)).toEqual(expect.arrayContaining(['1.0.1', '1.8.0', '1.9.3', '1.17.0']))
    expect(history['1.8.0']?.['src/components/sections/contact/Contact.astro']).toBeDefined()
  })

  it('holds earlier releases of the files outside the sections that the hosted editor needs', () => {
    for (const file of ['src/components/seo/Seo.astro', 'src/env.d.ts', 'src/pages/404.astro', 'src/pages/[...slug].astro']) {
      expect(registry.files[file]?.history.length, file).toBeGreaterThan(0)
      expect(history['1.8.0']?.[file], file).toBeDefined()
    }
  })

  it('tracks every file of the hosted group', () => {
    for (const file of registry.groups?.hosted?.files ?? []) expect(registry.files[file], file).toBeDefined()
  })
})
