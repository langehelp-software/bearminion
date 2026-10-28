import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { hide } from '../../templates/default/src/lib/hidden-text'
import { launchBrowser } from './dev-server'

const template = path.resolve(import.meta.dirname, '../../templates/default')
const SKIPPED = new Set(['node_modules', 'dist', '.astro', '.editor', 'storybook-static', 'e2e-uploads'])
const temporary: string[] = []
afterAll(() => {
  for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true })
})

interface Built {
  status: number | null
  output: string
  dist: string
  /** Reads a built file. */
  read: (file: string) => string
}

/** Builds a copy of the template, so the test can add a handler, change the content and set environment variables. */
function build(options: { env?: Record<string, string>; handler?: boolean; content?: (pages: string) => void }): Built {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-prod-'))
  temporary.push(site)
  fs.cpSync(template, site, { recursive: true, filter: (file) => !SKIPPED.has(path.basename(file)) })
  fs.symlinkSync(path.join(template, 'node_modules'), path.join(site, 'node_modules'), 'dir')
  if (options.handler) {
    fs.mkdirSync(path.join(site, 'src/forms'), { recursive: true })
    fs.writeFileSync(
      path.join(site, 'src/forms/contact.ts'),
      "import { defineForm } from 'bearminion/forms'\n\nexport default defineForm(async () => {})\n",
    )
  }
  options.content?.(path.join(site, 'content/pages'))
  const env: NodeJS.ProcessEnv = { ...process.env, ...options.env }
  delete env.BEARMINION_FORMS
  Object.assign(env, options.env)
  for (const name of ['VITEST', 'VITEST_POOL_ID', 'VITEST_WORKER_ID']) delete env[name]
  const result = spawnSync(process.execPath, [path.join(site, 'node_modules/astro/bin/astro.mjs'), 'build'], {
    cwd: site,
    env,
    encoding: 'utf8',
  })
  const dist = path.join(site, 'dist')
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
    dist,
    read: (file) => fs.readFileSync(path.join(dist, file), 'utf8'),
  }
}

/** Every page of the site, with its sections, as the build reads them. */
interface PageSection {
  type: string
  props: { details: Array<{ value: string; hideFromCrawlers?: boolean }> }
}

function editPages(pages: string, change: (sections: PageSection[], slug: string) => void): void {
  for (const file of fs.readdirSync(pages)) {
    const full = path.join(pages, file)
    const page = JSON.parse(fs.readFileSync(full, 'utf8'))
    change(page.sections, file.replace(/\.json$/, ''))
    fs.writeFileSync(full, `${JSON.stringify(page, null, 2)}\n`)
  }
}

describe('BEARMINION_FORMS=required', () => {
  it('stops the build while a Contact section has no handler, and names the file', () => {
    const built = build({ env: { BEARMINION_FORMS: 'required' } })
    expect(built.status).not.toBe(0)
    expect(built.output).toContain('src/forms/contact.ts does not exist')
    expect(built.output).toContain('BEARMINION_FORMS=required stops the build')
  }, 240_000)

  it('builds once the handler exists', () => {
    const built = build({ env: { BEARMINION_FORMS: 'required' }, handler: true })
    expect(built.output).not.toContain('does not exist')
    expect(built.status).toBe(0)
    expect(fs.existsSync(path.join(built.dist, 'index.html'))).toBe(true)
  }, 240_000)

  it('builds without a handler when no page has a Contact section', () => {
    const built = build({
      env: { BEARMINION_FORMS: 'required' },
      content: (pages) =>
        editPages(pages, (sections) => {
          for (let index = sections.length - 1; index >= 0; index -= 1) if (sections[index]?.type === 'contact') sections.splice(index, 1)
        }),
    })
    expect(built.status).toBe(0)
  }, 240_000)

  it('only warns when the variable is not set', () => {
    const built = build({})
    expect(built.status).toBe(0)
    expect(built.output).toContain('src/forms/contact.ts does not exist')
  }, 240_000)
})

describe('Hide from crawlers', () => {
  it('keeps a detail out of the built HTML and puts it back in the browser', async () => {
    const hidden = 'hello@example.com'
    const built = build({
      handler: true,
      content: (pages) =>
        editPages(pages, (sections) => {
          for (const section of sections) {
            if (section.type !== 'contact') continue
            for (const detail of section.props.details) detail.hideFromCrawlers = detail.value === hidden
          }
        }),
    })
    expect(built.status).toBe(0)
    const html = built.read('index.html')
    expect(html).not.toContain(hidden)
    expect(html).toContain(`data-hidden-value="${hide(hidden)}"`)
    // The detail that was not hidden is still plain text.
    expect(html).toContain('+1 555 010 0100')

    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const file = path.join(built.dist, url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname)
      if (!file.startsWith(built.dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.statusCode = 404
        response.end()
        return
      }
      response.setHeader(
        'content-type',
        file.endsWith('.html')
          ? 'text/html'
          : file.endsWith('.js')
            ? 'text/javascript'
            : file.endsWith('.css')
              ? 'text/css'
              : 'application/octet-stream',
      )
      response.end(fs.readFileSync(file))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const browser = await launchBrowser()
    try {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const page = await browser.newPage()
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
      // The script puts the value back and removes the marker, so the marker's absence is part of the proof.
      await page.waitForFunction(
        (value) =>
          document.querySelector('[data-hidden-value]') === null &&
          [...document.querySelectorAll('dd')].some((node) => node.textContent === value),
        hidden,
      )
    } finally {
      await browser.close()
      server.close()
    }
  }, 240_000)
})
