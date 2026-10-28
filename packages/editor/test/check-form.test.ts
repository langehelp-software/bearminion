import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkForm, envNamesOf, parseJsonc } from '../src/add/check-form.js'
import { GLUE, HANDLER_PATH, HANDLERS } from '../src/add/forms.js'
import { run } from '../src/command.js'

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const write = (root: string, file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), content)
}

/** A site with the handler and the glue for `host`, exactly as the recipes write them. */
function site(host: string, changes: Record<string, string | null> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-check-'))
  temporary.push(root)
  write(root, HANDLER_PATH, (HANDLERS[0] as (typeof HANDLERS)[number]).source)
  for (const file of GLUE.find((glue) => glue.name === host)?.files ?? []) write(root, file.path, file.source)
  if (host === 'cloudflare') {
    write(
      root,
      'wrangler.jsonc',
      (GLUE.find((glue) => glue.name === 'cloudflare')?.files[1]?.source ?? '')
        .replace('"my-site"', '"my-worker"')
        .replace('"CONTACT_FROM": ""', '"CONTACT_FROM": "Me <me@example.com>"')
        .replace('"CONTACT_TO": ""', '"CONTACT_TO": "me@example.com"'),
    )
  }
  for (const [file, content] of Object.entries(changes)) {
    if (content === null) fs.rmSync(path.join(root, file))
    else write(root, file, content)
  }
  return root
}

const problems = (root: string, host: string) =>
  checkForm(root, host)
    .findings.filter((finding) => finding.level === 'problem')
    .map((finding) => finding.message)

describe('bearminion check form', () => {
  it.each(['vercel', 'netlify', 'cloudflare'])('finds no problem in what add form writes for %s', (host) => {
    expect(problems(site(host), host)).toEqual([])
  })

  it('says a handler that is not there leaves the form unanswered', () => {
    expect(problems(site('vercel', { [HANDLER_PATH]: null }), 'vercel')[0]).toContain('missing')
  })

  it('flags the import without ".js", the error that failed the first Vercel deploy', () => {
    const root = site('vercel', {
      'api/contact.ts': "import form from '../src/forms/contact'\nexport const POST = (r: Request) => form.fetch(r, process.env)\n",
    })
    expect(problems(root, 'vercel').join('\n')).toContain('ERR_MODULE_NOT_FOUND')
  })

  it('finds a Netlify function in the wrong folder, and one without a path', () => {
    const misspelled = site('netlify', {
      'netlify/functions/contact.mts': null,
      'netlify/function/contact.mts': 'export default () => 1\n',
    })
    expect(problems(misspelled, 'netlify').join('\n')).toContain('0 new function(s)')
    const noPath = site('netlify', {
      'netlify/functions/contact.mts':
        "import form from '../../src/forms/contact.js'\nexport default (r: Request) => form.fetch(r, process.env)\n",
    })
    expect(problems(noPath, 'netlify').join('\n')).toContain('/.netlify/functions/contact')
  })

  it('reads the functions folder from netlify.toml', () => {
    const source = fs.readFileSync(path.join(site('netlify'), 'netlify/functions/contact.mts'), 'utf8')
    const root = site('netlify', {
      'netlify/functions/contact.mts': null,
      'netlify.toml': '[functions]\ndirectory = "fn"\n',
      'fn/contact.mts': source,
    })
    expect(problems(root, 'netlify')).toEqual([])
  })

  it('wants CONTACT_FROM and CONTACT_TO under "vars" on Cloudflare, and a Worker name that is not the placeholder', () => {
    const wrangler = fs.readFileSync(path.join(site('cloudflare'), 'wrangler.jsonc'), 'utf8')
    const empty = site('cloudflare', {
      'wrangler.jsonc': wrangler.replace('"CONTACT_TO": "me@example.com"', '"CONTACT_TO": ""').replace('"my-worker"', '"my-site"'),
    })
    const found = problems(empty, 'cloudflare').join('\n')
    expect(found).toContain('CONTACT_TO is not set under "vars"')
    expect(found).toContain('placeholder name')
    expect(found).not.toContain('CONTACT_FROM is not')
  })

  it('reads a Wrangler config with comments and trailing commas', () => {
    expect(parseJsonc('// c\n{ "a": "x//y", /* b */ "list": [1, 2,], }\n')).toEqual({ a: 'x//y', list: [1, 2] })
    expect(parseJsonc('{ nope')).toBeUndefined()
  })

  it('reads the environment names a handler uses', () => {
    expect(envNamesOf("env.A_KEY + env['B'] + env.c")).toEqual(['A_KEY', 'B'])
  })

  it('says what it cannot see: the host settings, and a missing host', () => {
    const vercel = checkForm(site('vercel'), 'vercel')
      .findings.map((finding) => finding.message)
      .join('\n')
    expect(vercel).toContain('CONTACT_FROM, CONTACT_TO, RESEND_API_KEY')
    expect(vercel).toContain('cannot read them from here')
    expect(checkForm(site('vercel')).findings.some((finding) => finding.message.includes('cannot tell where this site runs'))).toBe(true)
  })

  it('exits 1 with the fix when something is wrong, and prints JSON on request', async () => {
    const root = site('vercel', { 'api/contact.ts': null })
    const lines: string[] = []
    const code = await run(['check', 'form', '--host', 'vercel', '--cwd', root], { log: (line) => lines.push(line) })
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('fix: npx bearminion add form')
    const json: string[] = []
    expect(await run(['check', 'form', '--host', 'vercel', '--json', '--cwd', root], { log: (line) => json.push(line) })).toBe(1)
    expect(JSON.parse(json.join('\n')).ok).toBe(false)
    const clean: string[] = []
    expect(await run(['check', 'form', '--host', 'vercel', '--cwd', site('vercel')], { log: (line) => clean.push(line) })).toBe(0)
    expect(clean.join('\n')).toContain('No problems found')
  })
})
