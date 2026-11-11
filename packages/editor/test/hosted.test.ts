import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { API_PREFIX } from '../src/model.js'
import { createHostedContext, githubStore, handleHostedRequest } from '../src/hosted.js'
import { stableStringify } from '../src/stable-json.js'
import { FakeGithub } from './fake-github.js'
import { sectionRegistry, siteDefinition } from './starter.js'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

/** Every source file `entry` pulls in at run time (type-only imports vanish in the build, so they are skipped). */
function reachable(entry: string): Map<string, string> {
  const files = new Map<string, string>()
  const visit = (file: string): void => {
    if (files.has(file)) return
    const source = fs.readFileSync(file, 'utf8')
    files.set(file, source)
    for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      const [, typeOnly, spec] = match
      if (typeOnly || !spec?.startsWith('.')) continue
      const base = path.resolve(path.dirname(file), spec)
      const found = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')].find(
        (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
      )
      if (found) visit(found)
    }
  }
  visit(entry)
  return files
}

describe('the hosted entry', () => {
  it('reaches no Node module or Node global, so it runs in a Worker', () => {
    const problems: string[] = []
    const files = reachable(path.join(SRC, 'hosted.ts'))
    // The check is only worth something if it reaches the code that matters.
    for (const name of [
      'hosted-auth.ts',
      'hosted-editor.ts',
      'hosted-context.ts',
      'collections.ts',
      'entry-source.ts',
      'entry-blocks.ts',
    ]) {
      expect(
        [...files.keys()].some((file) => file.endsWith(`/${name}`)),
        name,
      ).toBe(true)
    }
    for (const [file, source] of files) {
      const name = path.relative(SRC, file)
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      for (const match of code.matchAll(/(?:from|import)\s*\(?\s*['"](node:[^'"]+)['"]/g)) problems.push(`${name} imports ${match[1]}`)
      for (const match of code.matchAll(/\b(Buffer|process\.[a-z]+|__dirname|__filename|require\()/g))
        problems.push(`${name} uses ${match[1]}`)
    }
    expect(problems).toEqual([])
  })
})

describe('the editor API on the hosted entry', () => {
  const home = { slug: 'index', title: 'Home', seo: { title: 'Home', description: '', noindex: false, nofollow: false }, sections: [] }
  const site = { name: 'Hosted', url: 'https://hosted.example', seo: {}, header: { links: [] }, footer: { columns: [] } }

  function setup() {
    const github = new FakeGithub({
      files: { 'content/site.json': stableStringify(site), 'content/pages/index.json': stableStringify(home) },
    })
    const context = createHostedContext({
      sections: sectionRegistry,
      site: siteDefinition,
      store: githubStore({ repo: 'acme/site', token: 't', fetch: github.fetch }),
    })
    async function call(method: string, pathname: string, headers: Record<string, string> = {}, body?: unknown): Promise<Response> {
      const response = await handleHostedRequest(
        new Request(`https://admin.example.com${API_PREFIX}${pathname}`, {
          method,
          headers: { host: 'admin.example.com', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        context,
      )
      if (response === null) throw new Error('no response')
      return response
    }
    return { github, call }
  }

  it('serves a signed-in, same-origin request from a host that is not localhost', async () => {
    const { call } = setup()
    const response = await call('GET', '/site', { 'sec-fetch-site': 'same-origin', origin: 'https://admin.example.com' })
    expect(response.status).toBe(200)
    expect(((await response.json()) as { name: string }).name).toBe('Hosted')
  })

  it('refuses cross-site requests, which would ride on the editor’s cookie', async () => {
    const { github, call } = setup()
    expect((await call('GET', '/site', { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    const before = github.commitCount
    const forged = await call('POST', '/pages', { origin: 'https://evil.example' }, { slug: 'about', title: 'About' })
    expect(forged.status).toBe(403)
    expect(github.commitCount).toBe(before)
  })

  it('commits a new page, and has no history and no Commit changes', async () => {
    const { github, call } = setup()
    const created = await call('POST', '/pages', { origin: 'https://admin.example.com' }, { slug: 'about', title: 'About' })
    expect(created.status).toBe(201)
    expect(github.text('content/pages/about.json')).toContain('"About"')

    expect(await (await call('GET', '/git')).json()).toEqual({ enabled: false, repo: false, files: [] })
    expect((await call('POST', '/git/commit', {}, { message: 'x' })).status).toBe(409)
    expect(await (await call('GET', '/history/pages/about')).json()).toEqual({ entries: [] })
  })
})
