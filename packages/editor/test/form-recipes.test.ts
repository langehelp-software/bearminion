import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { GLUE, HANDLERS } from '../src/add/forms.js'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recipes-'))
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }))

const formsEntry = path.resolve(import.meta.dirname, '../src/forms/index.ts')

/** Type-checks the files as a site would, with `bearminion/forms` pointing at this checkout. */
function diagnose(files: Record<string, string>): string[] {
  const names: string[] = []
  for (const [file, source] of Object.entries(files)) {
    const target = path.join(directory, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, source)
    names.push(target)
  }
  const program = ts.createProgram(names, {
    noEmit: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: [],
    skipLibCheck: true,
    paths: { 'bearminion/forms': [formsEntry] },
    baseUrl: directory,
  })
  return (
    ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file !== undefined && names.includes(diagnostic.file.fileName))
      // The hosts' own types (Netlify, Cloudflare, Astro, process) are not installed here.
      .filter((diagnostic) => ![2307, 2304, 2580, 2503].includes(diagnostic.code))
      .map(
        (diagnostic) =>
          `${path.basename(diagnostic.file?.fileName ?? '')}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
      )
  )
}

describe('the form recipes', () => {
  it('the Forms guide shows each recipe exactly as the command writes it', () => {
    const guide = fs.readFileSync(path.resolve(import.meta.dirname, '../../../docs/forms.md'), 'utf8')
    for (const recipe of [...HANDLERS, ...GLUE]) expect(guide).toContain(recipe.source.trimEnd())
  })

  it('the check itself sees a wrong handler', () => {
    const bad =
      "import { defineForm } from 'bearminion/forms'\nexport default defineForm(async (submission) => { const n: number = submission.email })\n"
    expect(diagnose({ 'bad/contact.ts': bad }).length).toBeGreaterThan(0)
  })

  for (const handler of HANDLERS) {
    it(`${handler.name} type-checks against bearminion/forms and names its secrets`, () => {
      expect(diagnose({ [`${handler.name}/contact.ts`]: handler.source })).toEqual([])
      for (const name of handler.env) expect(handler.source).toContain(`env.${name}`)
    })
  }

  it('every glue file imports the handler from where the handler is written', () => {
    for (const glue of GLUE) {
      const depth = glue.path.split('/').length - 1
      const expected = `${depth === 0 ? './' : '../'.repeat(depth)}${glue.path.startsWith('src/') ? '' : 'src/'}forms/contact`
      const relative = glue.path.startsWith('src/') ? `${'../'.repeat(depth - 1)}forms/contact` : expected
      expect(glue.source).toContain(`from '${relative}'`)
    }
  })
})

/** Runs a recipe's source for real, with `bearminion/forms` pointing at this checkout. */
async function load(name: string): Promise<{ fetch: (request: Request, env?: Record<string, string>) => Promise<Response> }> {
  const recipe = HANDLERS.find((handler) => handler.name === name)
  if (recipe === undefined) throw new Error(`no recipe ${name}`)
  const file = path.join(directory, `run-${name}.ts`)
  fs.writeFileSync(file, recipe.source.replace("'bearminion/forms'", JSON.stringify(formsEntry)))
  return (await import(/* @vite-ignore */ file)).default
}

const post = (fields: Record<string, string>) =>
  new Request('https://site.example/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page: '/contact', ...fields }),
  })

const ENV = { RESEND_API_KEY: 're_test', CONTACT_FROM: 'Site <contact@mine.test>', CONTACT_TO: 'me@mine.test' }

describe('the resend recipe, run against a stand-in for Resend', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("sends one authorised request in Resend's shape, from and to taken from the environment", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response('{"id":"1"}', { status: 200 })
    })
    const form = await load('resend')
    const response = await form.fetch(
      post({ name: 'Ada\r\nBcc: x@evil.example', email: 'ada@example.com', message: 'Hello', topic: 'Quote' }),
      ENV,
    )
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.resend.com/emails')
    const init = calls[0]?.init as { method: string; headers: Record<string, string>; body: string }
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    const body = JSON.parse(init.body)
    expect(Object.keys(body).sort()).toEqual(['from', 'reply_to', 'subject', 'text', 'to'])
    expect(body.from).toBe('Site <contact@mine.test>')
    expect(body.to).toBe('me@mine.test')
    expect(body.reply_to).toBe('ada@example.com')
    expect(body.subject).toBe('New message from Ada Bcc: x@evil.example')
    expect(body.subject).not.toMatch(/[\r\n]/)
    expect(body.text).toContain('Hello')
  })

  it('has no address of its own in the file, and refuses to send while either one is missing', async () => {
    const recipe = HANDLERS.find((handler) => handler.name === 'resend')
    expect(recipe?.source).not.toMatch(/[\w.]+@[\w.-]+\.[a-z]{2,}/i)
    const fetched = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetched)
    const form = await load('resend')
    for (const env of [{ RESEND_API_KEY: 're_test' }, { ...ENV, CONTACT_TO: '' }, { ...ENV, CONTACT_FROM: '' }]) {
      const response = await form.fetch(post({ name: 'Ada', email: 'ada@example.com', message: 'Hi' }), env)
      expect(response.status).toBe(502)
    }
    expect(fetched).not.toHaveBeenCalled()
  })

  it("shows the visitor a calm error, and never the provider's answer, when Resend refuses", async () => {
    vi.stubGlobal('fetch', async () => new Response('{"message":"The domain is not verified"}', { status: 403 }))
    const form = await load('resend')
    const response = await form.fetch(post({ name: 'Ada', email: 'ada@example.com', message: 'Hi' }), ENV)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('domain')
  })
})
