import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'

export const starter = path.resolve(import.meta.dirname, '../../templates/default')

export interface DevServer {
  child: ChildProcess
  logs: () => string
  stop: () => void
}

/**
 * Starts `astro dev` for the default template on `port`, with the content, upload and video folders pointed at
 * throwaway directories. `--ignore-lock` keeps Astro from moving the server to the background when it detects an
 * agent, and lets the test run next to your own `astro dev`.
 */
export async function startDevServer(options: {
  port: number
  contentDir: string
  uploadsDir: string
  videosDir?: string
  /** Folder with the form files to serve at /api/<name>. */
  formsDir?: string
  /** More environment for the dev server, such as `BEARMINION_FORMS_LIVE`. */
  env?: Record<string, string>
}): Promise<DevServer> {
  const astroBin = path.join(starter, 'node_modules', 'astro', 'bin', 'astro.mjs')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BEARMINION_CONTENT_DIR: options.contentDir,
    BEARMINION_UPLOADS_DIR: options.uploadsDir,
    ...(options.videosDir ? { BEARMINION_VIDEOS_DIR: options.videosDir } : {}),
    ...(options.formsDir ? { BEARMINION_FORMS_DIR: options.formsDir } : {}),
    ...options.env,
  }
  delete env.VITEST
  delete env.VITEST_POOL_ID
  delete env.VITEST_WORKER_ID
  env.NODE_ENV = 'development'
  const child = spawn(process.execPath, [astroBin, 'dev', '--port', String(options.port), '--host', '127.0.0.1', '--ignore-lock'], {
    cwd: starter,
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    logs += chunk.toString()
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    logs += chunk.toString()
  })
  const stop = () => {
    if (!child.pid) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
  try {
    await waitForHttp(`http://127.0.0.1:${options.port}/`, child, () => logs)
  } catch (error) {
    stop()
    throw error
  }
  return { child, logs: () => logs, stop }
}

/** Playwright's own Chromium (`pnpm exec playwright install chromium`), or the binary in BEARMINION_E2E_CHROMIUM. */
export function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.BEARMINION_E2E_CHROMIUM
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-gpu'] })
}

/** Opens a page of the site with the editor ready and no stored drafts. */
export async function openClean(page: Page, origin: string, pathname = '/'): Promise<void> {
  await page.goto(`${origin}${pathname}`, { waitUntil: 'networkidle' })
  // The dev server can reload the page once while it optimizes a dependency. Wait that out and clear the drafts again.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('bearminion:draft:')) localStorage.removeItem(key)
        }
      })
      break
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('navigation')) throw error
      await page.waitForLoadState('networkidle')
    }
  }
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Editor', exact: true }).waitFor()
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
}

/** Polls until `check` is true; throws `label` after 20 s. */
export async function waitFor(check: () => boolean, label: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 20_000) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(label)
}

function waitForHttp(url: string, child: ChildProcess, readLogs: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let settled = false
    let last = 'no probe yet'
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      if (error) reject(error)
      else resolve()
    }
    const timer = setInterval(() => {
      if (child.exitCode !== null) finish(new Error(`astro dev exited ${child.exitCode}\n${readLogs()}`))
      else if (Date.now() - started > 20_000) finish(new Error(`astro dev did not serve ${url} (${last})\n${readLogs()}`))
    }, 250)
    const probe = async () => {
      while (!settled && child.exitCode === null) {
        last = await probeStatus(url)
        if (last.startsWith('status 2')) return finish()
        if (last.startsWith('status 5') && Date.now() - started > 8_000) return finish(new Error(`${last}\n${readLogs()}`))
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 400))
      }
    }
    void probe()
  })
}

function probeStatus(url: string): Promise<string> {
  return new Promise((resolve) => {
    const req = http.get(url, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').replace(/\s+/g, ' ').slice(0, 180)
        resolve(`status ${response.statusCode ?? 0} ${body}`)
      })
    })
    req.setTimeout(3000, () => {
      req.destroy()
      resolve('timeout')
    })
    req.on('error', (error) => resolve(`error ${error.message}`))
  })
}
