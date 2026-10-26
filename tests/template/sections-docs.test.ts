import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const sectionsDir = path.join(root, 'templates/default/src/components/sections')
const docsDir = path.join(root, 'docs/sections')

const directories = fs
  .readdirSync(sectionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

describe('the sections docs', () => {
  it('has a page for every section directory, and no page for a directory that is gone', () => {
    const pages = fs
      .readdirSync(docsDir)
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .map((file) => file.replace(/\.md$/, ''))
    expect(pages.sort()).toEqual([...directories].sort())
  })

  it('lists every section in the overview', () => {
    const overview = fs.readFileSync(path.join(docsDir, 'README.md'), 'utf8')
    for (const directory of directories) expect(overview).toContain(`](${directory}.md)`)
  })
})
