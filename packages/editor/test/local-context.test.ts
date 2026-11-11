import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleEditorRequest } from '../src/api.js'
import { API_PREFIX } from '../src/model.js'
import { resolveEditorContext } from '../src/options.js'
import { stableStringify } from '../src/stable-json.js'
import { sectionRegistry, siteDefinition } from './starter.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

/** The editor API reaches undo history, Commit changes and the form handlers through the context's ports. */
describe('the context of a local project', () => {
  const home = { slug: 'index', title: 'Home', seo: { title: 'Home', description: '', noindex: false, nofollow: false }, sections: [] }

  function project() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-local-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'content', 'pages'), { recursive: true })
    fs.mkdirSync(path.join(root, 'src', 'forms'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src', 'forms', 'contact.ts'), 'export default {}\n')
    fs.writeFileSync(
      path.join(root, 'content', 'site.json'),
      stableStringify({ name: 'Local', url: 'https://l.example', seo: {}, header: { links: [] }, footer: { columns: [] } }),
    )
    fs.writeFileSync(path.join(root, 'content', 'pages', 'index.json'), stableStringify(home))
    const context = resolveEditorContext({ sections: sectionRegistry, site: siteDefinition, git: true }, root)
    async function call(method: string, pathname: string, body?: unknown): Promise<Response> {
      const response = await handleEditorRequest(
        new Request(`http://127.0.0.1:4321${API_PREFIX}${pathname}`, {
          method,
          headers: { host: '127.0.0.1:4321', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        context,
        { remoteAddress: '127.0.0.1' },
      )
      if (response === null) throw new Error('no response')
      return response
    }
    return { root, context, call }
  }

  it('has history, git and the form lookup', () => {
    const { context } = project()
    expect(context.history).toBeDefined()
    expect(context.commits).toBeDefined()
    expect(context.formFile?.('contact')).toMatch(/src[\\/]forms[\\/]contact\.ts$/)
  })

  it('keeps a copy of every save, and can read it back', async () => {
    const { root, call } = project()
    const saved = await call('PUT', '/pages/index', { ...home, title: 'Home 2' })
    expect(saved.status).toBe(200)
    expect(fs.existsSync(path.join(root, '.editor', 'history', 'pages', 'index'))).toBe(true)

    const listed = (await (await call('GET', '/history/pages/index')).json()) as { entries: { id: string }[] }
    expect(listed.entries.length).toBeGreaterThanOrEqual(2)
    const snapshot = await call('GET', `/history/pages/index/${listed.entries[0]?.id}`)
    expect(snapshot.status).toBe(200)
    expect(((await snapshot.json()) as { title: string }).title).toBe('Home 2')
  })

  it('answers Commit changes, which is on, and finds the form handler', async () => {
    const { call } = project()
    const info = (await (await call('GET', '/git')).json()) as { enabled: boolean; repo: boolean }
    expect(info.enabled).toBe(true)
    const forms = (await (await call('GET', '/forms')).json()) as { handlers: Record<string, { file: string | null }> }
    expect(forms.handlers).toEqual({ contact: { file: 'src/forms/contact.ts' } })
  })
})
