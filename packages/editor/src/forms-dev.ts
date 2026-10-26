import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { parseEnv } from 'node:util'
import type { Form, FormEnv } from './forms/index.js'
import { resolveDir } from './security.js'

/**
 * The dev server's route for the forms in `src/forms`. A file `src/forms/contact.ts` that default-exports
 * `defineForm(...)` answers at `/api/contact` while `astro dev` runs, the same path the host's function has once
 * published. By default it only receives the message and prints it (a dry run), so editing a page never sends a real
 * email; start the dev server with `BEARMINION_FORMS_LIVE=on` to run the handler.
 */

export interface FormsConfig {
  /** Absolute folder holding one file per form. */
  dir: string
  /** The path the forms answer under, such as `/api`. */
  prefix: string
}

/** Where the forms are and under which path, or `null` when the option turns them off. */
export function resolveFormsConfig(option: false | { dir?: string; prefix?: string } | undefined, root: string): FormsConfig | null {
  if (option === false) return null
  const prefix = (option?.prefix ?? '/api').replace(/\/+$/, '')
  return { dir: resolveDir(root, option?.dir, 'src/forms'), prefix: prefix.startsWith('/') ? prefix : `/${prefix}` }
}

const FORM_FILE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const EXTENSIONS = ['.ts', '.mts', '.js', '.mjs']
const BODY_LIMIT = 1_048_576

/** The file behind `name`, or `null` when there is none. `name` is checked, so it cannot leave the folder. */
export function formFile(dir: string, name: string): string | null {
  if (!FORM_FILE.test(name)) return null
  for (const extension of EXTENSIONS) {
    const file = path.join(dir, `${name}${extension}`)
    if (fs.existsSync(file)) return file
  }
  return null
}

/** `.env`, `.env.local`, `.env.development` and `.env.development.local` of the project, later ones winning. */
export function readDotEnv(root: string): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    try {
      Object.assign(merged, parseEnv(fs.readFileSync(path.join(root, name), 'utf8')))
    } catch {
      // No such file, or it does not parse: Vite skips it too.
    }
  }
  return merged
}

/** True when `BEARMINION_FORMS_LIVE=on` is in the environment or in the project's `.env` files. */
export function formsAreLive(root: string): boolean {
  return (process.env.BEARMINION_FORMS_LIVE ?? readDotEnv(root).BEARMINION_FORMS_LIVE) === 'on'
}

export interface FormsMiddlewareOptions extends FormsConfig {
  root: string
  /** Run the handler. Off: print the message and answer ok. */
  live: boolean
  /** Loads a form file through the dev server, so TypeScript and edits work. */
  load: (file: string) => Promise<unknown>
  log: { info: (message: string) => void; error: (message: string) => void }
}

type Next = (error?: unknown) => void

function isForm(value: unknown): value is Form {
  return typeof value === 'object' && value !== null && typeof (value as Form).fetch === 'function'
}

export function createFormsMiddleware(options: FormsMiddlewareOptions) {
  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const pathname = (req.url ?? '/').split('?')[0]?.replace(/\/+$/, '') ?? ''
    if (!pathname.startsWith(`${options.prefix}/`)) {
      next()
      return
    }
    const name = pathname.slice(options.prefix.length + 1)
    const file = formFile(options.dir, name)
    if (!file) {
      next()
      return
    }
    void answer(req, res, options, name, file).catch((error: unknown) => {
      options.log.error(`/${name}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
      if (!res.headersSent) fail(res, 500, error instanceof Error ? error.message : 'The form failed.')
    })
  }
}

function fail(res: ServerResponse, status: number, error: string): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ ok: false, error }))
}

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  options: FormsMiddlewareOptions,
  name: string,
  file: string,
): Promise<void> {
  const loaded = (await options.load(file)) as { default?: unknown } | undefined
  const form = loaded?.default
  if (!isForm(form)) {
    const relative = path.relative(options.root, file).split(path.sep).join('/')
    options.log.error(`${relative} must \`export default defineForm(...)\` from 'bearminion/forms'.`)
    return fail(res, 500, `${relative} must export default defineForm(...).`)
  }
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item)
  }
  const method = (req.method ?? 'GET').toUpperCase()
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readLimited(req, BODY_LIMIT)
  if (body === null) return fail(res, 413, 'The message is too large.')
  const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, { method, headers, ...(body ? { body } : {}) })
  const env: FormEnv = { ...readDotEnv(options.root), ...process.env }
  const response = await form.fetch(request, env, {
    dev: true,
    ...(options.live
      ? {}
      : {
          dryRun: (submission) =>
            options.log.info(
              `/${name} received a message. Dry run: nothing was sent. Start the dev server with BEARMINION_FORMS_LIVE=on to run your handler.\n${JSON.stringify(submission, null, 2)}`,
            ),
        }),
  })
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.end(Buffer.from(await response.arrayBuffer()))
}

/** The body of the request, or `null` once it is over `limit` bytes. */
function readLimited(req: IncomingMessage, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer | string) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buffer.length
      if (size > limit) {
        resolve(null)
        req.resume()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    req.on('error', reject)
  })
}
