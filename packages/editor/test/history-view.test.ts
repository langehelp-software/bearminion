// @vitest-environment happy-dom
import { h, render, type VNode } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryDialog } from '../src/ui/dialogs/history-dialog.js'
import { HistoryView } from '../src/ui/shell/history-view.js'
import { createEditor, type Editor, EditorContext } from '../src/ui/state/editor.js'
import type { Catalog } from '../src/ui/types.js'

const catalog: Catalog = {
  sectionOptions: { hero: [] },
  siteOptions: [],
  contentCounts: {},
  sectionDefaults: { hero: {} },
  sectionLabels: { hero: 'Hero' },
}

const page = (heading: string) => ({
  slug: 'index',
  title: 'Home',
  seo: {},
  sections: [{ id: 'hero', type: 'hero', anchor: 'hero', props: { heading } }],
})

const commits = [
  {
    sha: 'b'.repeat(40),
    short: 'bbbbbbb',
    message: 'Update content/pages/index.json',
    author: 'Ann',
    at: '2026-11-20T10:00:00Z',
    parent: 'a'.repeat(40),
  },
  { sha: 'a'.repeat(40), short: 'aaaaaaa', message: 'Initial', author: 'Ann', at: '2026-11-19T10:00:00Z' },
]

function api(url: string, init?: RequestInit): Response {
  const path = new URL(url, 'http://localhost').pathname + new URL(url, 'http://localhost').search
  const send = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (path === '/__bearminion/api/versions') return send({ commits, restoreCommits: true, branch: 'main' })
  if (path === `/__bearminion/api/versions/${'b'.repeat(40)}`)
    return send({ commit: commits[0], files: [{ path: 'content/pages/index.json', status: 'modified', key: 'pages/index.json' }] })
  if (path.startsWith(`/__bearminion/api/versions/${'a'.repeat(40)}/file`)) return new Response(JSON.stringify(page('Old')))
  if (path.startsWith(`/__bearminion/api/versions/${'b'.repeat(40)}/file`)) return new Response(JSON.stringify(page('New')))
  if (path.endsWith('/restore') && init?.method === 'POST')
    return send({ commit: 'ccccccc', written: ['content/pages/index.json'], removed: [] }, 201)
  return send({}, 503)
}

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('history UI', () => {
  let editor: Editor
  let root: HTMLElement
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => api(url, init))
    vi.stubGlobal('fetch', fetchMock)
    root = document.createElement('div')
    document.body.append(root)
    editor = createEditor()
    editor.doc.catalog.value = catalog
    editor.doc.markSaved(page('Hello'), { name: 'Site', header: { links: [] } })
  })

  afterEach(() => {
    render(null, root)
    root.remove()
    editor.dispose()
    vi.unstubAllGlobals()
  })

  // biome-ignore lint/suspicious/noExplicitAny: any component's vnode
  const draw = (node: VNode<any>) => render(h(EditorContext.Provider, { value: editor }, node), root)

  it('shows this tab’s steps and goes back to one', async () => {
    vi.useFakeTimers()
    editor.undo.noteChange()
    editor.edits.writeField('sections.0.props.heading', 'Changed')
    editor.undo.noteChange()
    vi.advanceTimersByTime(450)
    vi.useRealTimers()
    draw(h(HistoryDialog, { onClose: () => {} }))
    await settle()
    const rows = [...root.querySelectorAll('.bm-version')]
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('now')
    const back = root.querySelector<HTMLButtonElement>('button[aria-label="Go back to step 0"]')
    back?.click()
    expect(editor.doc.page.value?.sections[0]?.props.heading).toBe('Hello')
  })

  it('lists commits and opens one on the History screen', async () => {
    draw(h(HistoryDialog, { onClose: () => {} }))
    await settle()
    const tab = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Commits')
    tab?.click()
    await settle()
    const pick = root.querySelector<HTMLButtonElement>('.bm-commit-pick')
    expect(pick?.textContent).toContain('Update content/pages/index.json')
    expect(pick?.textContent).not.toContain('bbbbbbb')
    pick?.click()
    expect(editor.ui.view.value).toBe('history')
    expect(editor.ui.historyCommit.value).toBe('b'.repeat(40))
  })

  it('compares a commit field by field and restores it', async () => {
    editor.ui.historyCommit.value = 'b'.repeat(40)
    draw(h(HistoryView, {}))
    await settle()
    expect(root.querySelector('.bm-commit-title')?.textContent).toBe('Update content/pages/index.json')
    const card = root.querySelector('.bm-commit-file')
    expect(card?.querySelector('.bm-commit-file-name')?.textContent).toBe('content/pages/index.json')
    expect(card?.querySelector('.bm-commit-file-sum')?.textContent).toBe('1 field changed')
    expect(card?.querySelector('.bm-diff-label')?.textContent).toBe('Hero · heading')
    expect(card?.querySelector('.bm-diff-path')?.textContent).toBe('#hero › heading')
    expect(card?.querySelector('.bm-diff-old')?.textContent).toBe('Before: Old')
    expect(card?.querySelector('.bm-diff-new')?.textContent).toBe('After: New')
    expect(root.querySelector('.bm-timeline-on .bm-timeline-title')?.textContent).toBe('Update content/pages/index.json')
    const restore = [...root.querySelectorAll('button')].find((button) => button.textContent?.includes('Restore this version'))
    restore?.click()
    await settle()
    expect(root.querySelector('[role="alertdialog"]')?.textContent).toContain('adds a new commit')
    const discard = vi.spyOn(editor.session, 'discardAndGo').mockImplementation(() => {})
    const confirm = [...root.querySelectorAll('[role="alertdialog"] button')].find(
      (button) => button.textContent === 'Restore',
    ) as HTMLButtonElement
    confirm.click()
    await settle()
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/restore') && (init as RequestInit)?.method === 'POST')).toBe(
      true,
    )
    // The open page was restored: the editor reloads it instead of keeping a stale draft.
    expect(discard).toHaveBeenCalled()
    expect(editor.ui.toasts.list.value.at(-1)?.title).toMatch(/Restored 1 file from bbbbbbb in commit ccccccc/)
  })
})
