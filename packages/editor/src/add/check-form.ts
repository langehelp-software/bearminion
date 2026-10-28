import fs from 'node:fs'
import path from 'node:path'
import { readDotEnv } from '../forms-dev.js'
import { detectHost, GLUE, HANDLER_PATH } from './forms.js'

export type Level = 'ok' | 'problem' | 'note'

export interface Finding {
  level: Level
  message: string
  /** What to do about a problem. */
  fix?: string
}

export interface FormCheck {
  /** The host that was checked, when there is one. */
  host: string | undefined
  findings: Finding[]
}

const SECRET_NAME = /KEY|SECRET|TOKEN|PASSWORD/
const HOSTS_TEXT = GLUE.map((glue) => glue.name).join(', ')

function read(root: string, file: string): string | undefined {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8')
  } catch {
    return undefined
  }
}

/** The first of `candidates` that exists in `dir` (relative to `root`), as a path relative to `root`. */
function firstExisting(root: string, dir: string, base: string, extensions: readonly string[]): string | undefined {
  return extensions.map((extension) => path.posix.join(dir, `${base}${extension}`)).find((file) => fs.existsSync(path.join(root, file)))
}

/** JSON with comments and trailing commas, the way Wrangler reads `wrangler.jsonc`. Undefined when it does not parse. */
export function parseJsonc(text: string): Record<string, unknown> | undefined {
  const withoutComments = scan(text, (source, i) => {
    if (source[i] === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      return { text: '', resume: end === -1 ? source.length : end }
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      return { text: '', resume: end === -1 ? source.length : end + 2 }
    }
    return undefined
  })
  const clean = scan(withoutComments, (source, i) => {
    if (source[i] !== ',') return undefined
    const next = /\S/.exec(source.slice(i + 1))
    const following = next === null ? undefined : source[i + 1 + next.index]
    return following === '}' || following === ']' ? { text: '', resume: i + 1 } : undefined
  })
  try {
    const value: unknown = JSON.parse(clean)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/**
 * Walks `text` outside of string literals. `replace` may answer a replacement and the index to carry on from; strings
 * and everything it leaves alone are copied as they are.
 */
function scan(text: string, replace: (source: string, index: number) => { text: string; resume: number } | undefined): string {
  let out = ''
  let inString = false
  let i = 0
  while (i < text.length) {
    const c = text[i] as string
    if (inString) {
      out += c
      if (c === '\\') out += text[i + 1] ?? ''
      else if (c === '"') inString = false
      i += c === '\\' ? 2 : 1
      continue
    }
    if (c === '"') inString = true
    const replacement = c === '"' ? undefined : replace(text, i)
    out += replacement?.text ?? c
    i = replacement?.resume ?? i + 1
  }
  return out
}

/** The environment names a handler reads from `env`. */
export function envNamesOf(source: string): string[] {
  const names = new Set<string>()
  for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1] as string)
  for (const match of source.matchAll(/\benv\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g)) names.add(match[1] as string)
  return [...names]
}

type Add = (level: Level, message: string, fix?: string) => void

/** What a glue file imports from `src/forms/contact`, and whether the specifier will resolve as an ES module. */
function checkImport(add: Add, file: string, source: string): void {
  const specifier = /from\s+['"]([^'"]*forms\/contact[^'"]*)['"]/.exec(source)?.[1]
  if (specifier === undefined) {
    add(
      'problem',
      `${file} does not import ${HANDLER_PATH}, so the request never reaches your handler.`,
      'Run `npx bearminion add form <service> --overwrite` (git keeps your version).',
    )
  } else if (specifier.endsWith('.js')) {
    add('ok', `${file} imports the handler with the ".js" an ES module needs.`)
  } else if (/\.[cm]?ts$/.test(specifier)) {
    add(
      'note',
      `${file} imports "${specifier}". The recipe uses ".js" (the file is contact.ts), which every host here ran; this has not been tried.`,
    )
  } else {
    add(
      'problem',
      `${file} imports "${specifier}" without an extension. The host runs it as an ES module, which does not guess extensions (ERR_MODULE_NOT_FOUND).`,
      `Write "${specifier}.js". The file is contact.ts; the ".js" is what the module resolver needs.`,
    )
  }
}

function checkVercel(root: string, add: Add): void {
  const file = firstExisting(root, 'api', 'contact', ['.ts', '.mts', '.js', '.mjs'])
  if (file === undefined) {
    add(
      'problem',
      'api/contact.ts is missing, so /api/contact has no function on Vercel.',
      'npx bearminion add form <service> --host vercel',
    )
    return
  }
  const source = read(root, file) ?? ''
  add('ok', `${file} exists.`)
  checkImport(add, file, source)
  if (/export\s+(const|function|async function)\s+POST\b|export\s+default\b/.test(source))
    add('ok', `${file} exports the function Vercel calls.`)
  else
    add(
      'problem',
      `${file} exports neither POST nor a default function, so Vercel has nothing to call.`,
      'export const POST = (request: Request) => form.fetch(request, process.env)',
    )
}

function checkNetlify(root: string, add: Add): void {
  const toml = read(root, 'netlify.toml')
  const configured = toml === undefined ? undefined : /\[functions\][^[]*?\bdirectory\s*=\s*"([^"]+)"/.exec(toml)?.[1]
  const dir = (configured ?? 'netlify/functions').replace(/^\.?\//, '').replace(/\/$/, '')
  const file = firstExisting(root, dir, 'contact', ['.mts', '.ts', '.mjs', '.js'])
  if (file === undefined) {
    const elsewhere = readDirs(root, 'netlify')
      .filter((other) => other !== dir)
      .map((other) => firstExisting(root, other, 'contact', ['.mts', '.ts', '.mjs', '.js']))
      .find((found) => found !== undefined)
    if (elsewhere !== undefined) {
      add(
        'problem',
        `The function is at ${elsewhere}, but Netlify reads ${dir}/. It is not deployed (the deploy log says "0 new function(s) to upload").`,
        `Move it to ${dir}/contact${path.extname(elsewhere)}.`,
      )
    } else {
      add(
        'problem',
        `${dir}/contact.mts is missing, so /api/contact has no function on Netlify.`,
        'npx bearminion add form <service> --host netlify',
      )
    }
    return
  }
  const source = read(root, file) ?? ''
  add('ok', `${file} exists in the folder Netlify reads.`)
  checkImport(add, file, source)
  if (/export\s+default\b/.test(source)) add('ok', `${file} has the default export Netlify calls.`)
  else
    add(
      'problem',
      `${file} has no default export, so Netlify has nothing to call.`,
      'export default (request: Request) => form.fetch(request, process.env)',
    )
  if (/\bpath\s*:\s*['"]\/api\/contact['"]/.test(source)) add('ok', `${file} answers at /api/contact.`)
  else {
    add(
      'problem',
      `${file} does not set path "/api/contact". Netlify then serves it at /.netlify/functions/contact, and the form posts to /api/contact (404).`,
      "export const config = { path: '/api/contact' }",
    )
  }
}

function readDirs(root: string, dir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.posix.join(dir, entry.name))
  } catch {
    return []
  }
}

function checkCloudflare(root: string, add: Add, plainNames: string[], secretNames: string[]): void {
  const configFile = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].find((name) => fs.existsSync(path.join(root, name)))
  if (configFile === undefined) {
    add(
      'problem',
      'There is no wrangler.jsonc, so there is nothing to deploy as a Worker.',
      'npx bearminion add form <service> --host cloudflare',
    )
    return
  }
  const text = read(root, configFile) ?? ''
  let main: string | undefined
  let name: string | undefined
  let binding: string | undefined
  let vars: Record<string, unknown> = {}
  let logs: boolean | undefined
  if (configFile.endsWith('.toml')) {
    main = /^\s*main\s*=\s*"([^"]+)"/m.exec(text)?.[1]
    name = /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1]
    binding = /^\s*binding\s*=\s*"([^"]+)"/m.exec(text)?.[1]
    vars = Object.fromEntries(
      plainNames
        .map((variable) => [variable, new RegExp(`^\\s*${variable}\\s*=\\s*"([^"]*)"`, 'm').exec(text)?.[1]])
        .filter(([, value]) => value !== undefined),
    )
    logs = /^\s*\[observability\]/m.test(text) ? /^\s*enabled\s*=\s*true/m.test(text) : undefined
  } else {
    const config = parseJsonc(text)
    if (config === undefined) {
      add('problem', `${configFile} does not parse as JSON with comments, so I cannot read it.`)
      return
    }
    main = typeof config.main === 'string' ? config.main : undefined
    name = typeof config.name === 'string' ? config.name : undefined
    const assets = config.assets as { binding?: unknown } | undefined
    binding = typeof assets?.binding === 'string' ? assets.binding : undefined
    vars = (config.vars as Record<string, unknown> | undefined) ?? {}
    const observability = config.observability as { enabled?: unknown; logs?: { enabled?: unknown } } | undefined
    logs = observability === undefined ? undefined : observability.enabled === true || observability.logs?.enabled === true
  }
  add('ok', `${configFile} exists.`)
  if (name === 'my-site') {
    add(
      'problem',
      `${configFile} still has the placeholder name "my-site". The deploy would create a Worker with that name.`,
      'Set "name" to the name of your Worker in Cloudflare.',
    )
  }
  if (main === undefined) {
    add('problem', `${configFile} has no "main", so no Worker runs and /api/contact is a 404.`, 'Set "main": "./worker.ts".')
  } else if (!fs.existsSync(path.join(root, main))) {
    add(
      'problem',
      `"main" is ${main}, which does not exist.`,
      'Point "main" at your Worker file, or run `npx bearminion add form <service> --host cloudflare`.',
    )
  } else {
    const source = read(root, main) ?? ''
    add('ok', `${main} is the Worker.`)
    checkImport(add, main, source)
    if (source.includes('/api/contact')) add('ok', `${main} routes /api/contact.`)
    else add('problem', `${main} does not mention /api/contact, so the form's request goes to the static files.`)
    if (/\benv\.ASSETS\b/.test(source) && binding !== 'ASSETS') {
      add(
        'problem',
        `${main} serves the site through env.ASSETS, but ${configFile} has no assets binding named "ASSETS".`,
        'Add "binding": "ASSETS" to "assets".',
      )
    }
  }
  for (const variable of plainNames) {
    const value = vars[variable]
    if (typeof value === 'string' && value.trim() !== '') add('ok', `${variable} is set under "vars".`)
    else {
      add(
        'problem',
        `${variable} is not set under "vars" in ${configFile}. A variable that exists only in the dashboard is replaced on the next deploy.`,
        `Put ${variable} under "vars" (plain values, so keep the repository private if they should not be public).`,
      )
    }
  }
  if (secretNames.length > 0)
    add('note', `Set ${secretNames.join(', ')} as Secrets in the Worker's Settings. I cannot read them from here.`)
  if (logs !== true)
    add('note', 'Logs are not turned on in the Wrangler config ("observability"), so a failing handler leaves no trace in the dashboard.')
}

/**
 * Looks at the files and environment that make the Contact form work and says what is missing. It reads the project and
 * writes nothing; the host's own settings (Vercel and Netlify environment variables, Cloudflare secrets) are out of
 * reach, and the result says so.
 */
export function checkForm(root: string, requestedHost?: string): FormCheck {
  const findings: Finding[] = []
  const add: Add = (level, message, fix) => findings.push({ level, message, ...(fix === undefined ? {} : { fix }) })

  const host = requestedHost ?? detectHost(root)
  const known = GLUE.some((glue) => glue.name === host)

  const handler = read(root, HANDLER_PATH)
  let names: string[] = []
  if (handler === undefined) {
    add(
      'problem',
      `${HANDLER_PATH} is missing. The Contact form posts to /api/contact and nothing answers.`,
      'npx bearminion add form resend --host <host>',
    )
  } else if (/\bdefineForm\b/.test(handler) && /export\s+default\b/.test(handler)) {
    add('ok', `${HANDLER_PATH} exports a defineForm handler.`)
    names = envNamesOf(handler)
  } else {
    add('problem', `${HANDLER_PATH} must \`export default defineForm(...)\` from 'bearminion/forms'.`)
    names = envNamesOf(handler)
  }
  const plainNames = names.filter((variable) => !SECRET_NAME.test(variable))
  const secretNames = names.filter((variable) => SECRET_NAME.test(variable))

  if (host === undefined) {
    add('note', `I cannot tell where this site runs. Name the host to check its glue: --host ${GLUE.map((glue) => glue.name).join(' | ')}.`)
  } else if (host === 'astro') {
    add(
      'note',
      'This site has an Astro adapter, so the endpoint is an Astro route. I only check the glue for the hosts the command writes.',
    )
  } else if (!known) {
    add('problem', `There is no host called "${host}". The hosts are: ${HOSTS_TEXT}.`)
  } else if (host === 'vercel') checkVercel(root, add)
  else if (host === 'netlify') checkNetlify(root, add)
  else if (host === 'cloudflare') checkCloudflare(root, add, plainNames, secretNames)

  if (host === 'vercel' || host === 'netlify') {
    if (names.length > 0)
      add(
        'note',
        `Set ${names.join(', ')} in ${host === 'vercel' ? "the project's Environment Variables" : "the site's Environment variables"} (Production and Preview). I cannot read them from here.`,
      )
  }

  const dotEnv = { ...readDotEnv(root) }
  const missingLocally = names.filter((variable) => dotEnv[variable] === undefined && process.env[variable] === undefined)
  if (missingLocally.length > 0) {
    add(
      'note',
      `Not in .env: ${missingLocally.join(', ')}. \`astro dev\` with BEARMINION_FORMS_LIVE=on needs them; without it the form is a dry run.`,
    )
  }
  const siteKey = dotEnv.PUBLIC_TURNSTILE_SITE_KEY ?? process.env.PUBLIC_TURNSTILE_SITE_KEY
  if (siteKey !== undefined && dotEnv.TURNSTILE_SECRET_KEY === undefined && process.env.TURNSTILE_SECRET_KEY === undefined) {
    add(
      'note',
      'PUBLIC_TURNSTILE_SITE_KEY shows the widget. The server checks the token only where TURNSTILE_SECRET_KEY is set, so set it on the host too.',
    )
  }
  return { host, findings }
}
