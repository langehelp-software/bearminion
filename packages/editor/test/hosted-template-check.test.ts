import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { bearminionHostedEditor } from '../src/hosted-integration.js'
import { staleTemplateProblems } from '../src/hosted-template-check.js'

const roots: string[] = []

function project(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'bm-template-'))
  roots.push(root)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), text)
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const current = {
  'src/components/molecules/MediaFrame.astro': '',
  'src/lib/editing.ts': '',
  'src/pages/[...slug].astro': 'const live = Astro.locals.bearminion',
  'src/pages/404.astro': 'const live = Astro.locals.bearminion',
}

describe('staleTemplateProblems', () => {
  it('finds nothing in a current starter site, and nothing in a site that is not the starter', () => {
    expect(staleTemplateProblems(project(current))).toEqual([])
    expect(staleTemplateProblems(project({ 'src/pages/index.astro': '' }))).toEqual([])
  })

  it('names a missing src/lib/editing.ts in a starter site', () => {
    const { 'src/lib/editing.ts': _, ...without } = current
    const problems = staleTemplateProblems(project(without))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('src/lib/editing.ts')
  })

  it('names a page route that never reads the editor’s content', () => {
    const problems = staleTemplateProblems(
      project({ ...current, 'src/pages/[...slug].astro': 'const page = Astro.props.page', 'src/pages/404.astro': 'x' }),
    )
    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toContain('[...slug].astro')
    expect(problems.join(' ')).toContain('404.astro')
  })
})

describe('bearminionHostedEditor and a stale site', () => {
  function warnings(root: string): string[] {
    const messages: string[] = []
    const hook = (bearminionHostedEditor({ module: './src/editor.ts' }).hooks as Record<string, (input: unknown) => void>)[
      'astro:config:setup'
    ] as (input: unknown) => void
    hook({
      config: { root: pathToFileURL(`${root}/`), adapter: { name: 'x' }, output: 'static' },
      updateConfig: () => {},
      addMiddleware: () => {},
      logger: { warn: (message: string) => messages.push(message) },
    })
    return messages
  }

  it('warns once with every problem and the docs link, and still builds', () => {
    const { 'src/lib/editing.ts': _, ...without } = current
    const messages = warnings(project(without))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('src/lib/editing.ts')
    expect(messages[0]).toContain('keeping-the-sites-files-current')
  })

  it('stays quiet for a current site', () => {
    expect(warnings(project(current))).toEqual([])
  })
})
