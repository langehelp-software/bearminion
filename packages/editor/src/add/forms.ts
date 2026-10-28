import fs from 'node:fs'
import path from 'node:path'
import { hashContent } from '../registry/hash.js'
import type { LockFile } from '../registry/types.js'
import type { FileAction } from './plan.js'

/** Where the handler goes: the Contact form posts to `/api/contact`, and this file answers there. */
export const HANDLER_PATH = 'src/forms/contact.ts'

export interface HandlerRecipe {
  name: string
  description: string
  /** Names to set in the host's settings (and in `.env` for `astro dev`). */
  env: string[]
  source: string
}

export interface GlueFile {
  path: string
  source: string
  /** The host's own config. When the site already has one of these, the file is not written and the plan says what to add. */
  skipWhenAny?: string[]
  /** What to tell the person when the file was skipped. */
  skipNote?: string
}

export interface GlueRecipe {
  name: string
  description: string
  files: GlueFile[]
  /** An npm package the file imports types from. */
  needs?: string
  /** True once the glue has handled a real message on the real host. Until then the command says so. */
  verified: boolean
}

const ONE_LINE = `const oneLine = (text: string) => text.replace(/\\s+/g, ' ').trim()
`

export const HANDLERS: readonly HandlerRecipe[] = [
  {
    name: 'resend',
    description: 'Send the message as an email with Resend',
    env: ['RESEND_API_KEY', 'CONTACT_FROM', 'CONTACT_TO'],
    source: `import { defineForm } from 'bearminion/forms'

${ONE_LINE}
export default defineForm(async (submission, { env }) => {
  // Both addresses live in the environment, so they are not in the repository. CONTACT_FROM has to be on a domain you
  // verified with Resend; CONTACT_TO is where the messages arrive.
  if (!env.CONTACT_FROM || !env.CONTACT_TO) throw new Error('Set CONTACT_FROM and CONTACT_TO in the environment.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: \`Bearer \${env.RESEND_API_KEY}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO,
      reply_to: submission.email,
      subject: \`New message from \${oneLine(submission.name ?? '')}\`,
      text: \`\${submission.message}\\n\\nFrom: \${submission.name} <\${submission.email}>\\nTopic: \${submission.topic ?? '-'}\\nPage: \${submission.page}\`,
    }),
  })
  if (!response.ok) throw new Error(\`Resend answered \${response.status}\`)
})
`,
  },
]

export const GLUE: readonly GlueRecipe[] = [
  {
    name: 'vercel',
    description: 'A Vercel Function',
    verified: true,
    files: [
      {
        path: 'api/contact.ts',
        source: `// The ".js" is needed: Vercel runs this as an ES module, which does not guess file extensions. The file is contact.ts.
import form from '../src/forms/contact.js'

export const POST = (request: Request) => form.fetch(request, process.env)
export const OPTIONS = POST
`,
      },
    ],
  },
  {
    name: 'netlify',
    description: 'A Netlify Function',
    verified: true,
    files: [
      {
        path: 'netlify/functions/contact.mts',
        source: `import form from '../../src/forms/contact.js'

export default (request: Request) => form.fetch(request, process.env)

export const config = { path: '/api/contact' }
`,
      },
    ],
  },
  {
    name: 'cloudflare',
    description: 'A Cloudflare Worker that serves the site and answers /api/contact',
    verified: true,
    files: [
      {
        path: 'worker.ts',
        source: `import form from './src/forms/contact.js'

type Env = Record<string, string> & { ASSETS: { fetch: (request: Request) => Promise<Response> } }

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/api/contact') return form.fetch(request, env)
    return env.ASSETS.fetch(request)
  },
}
`,
      },
      {
        path: 'wrangler.jsonc',
        skipWhenAny: ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'],
        skipNote:
          'This site already has a Wrangler config, so it was left alone. It needs "main": "./worker.ts", "assets" with "binding": "ASSETS" and "run_worker_first": ["/api/*"], and CONTACT_FROM and CONTACT_TO under "vars". See the Forms guide.',
        source: `// "name" has to be the name of your Worker in Cloudflare.
// RESEND_API_KEY is a secret: set it in the Worker's Settings, not here. CONTACT_FROM and CONTACT_TO are plain values and
// live under "vars", because a deploy replaces variables that exist only in the dashboard. Fill them in, and keep this
// repository private if the addresses should not be public.
{
  "name": "my-site",
  "compatibility_date": "2026-10-27",
  "main": "./worker.ts",
  "assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": ["/api/*"] },
  "observability": { "logs": { "enabled": true, "invocation_logs": true, "persist": true } },
  "vars": { "CONTACT_FROM": "", "CONTACT_TO": "" }
}
`,
      },
    ],
  },
]

/**
 * Which host a site deploys to, from the files that name one. A site with config for two hosts, or for none, answers
 * undefined and the person says it with `--host`. An Astro adapter in `package.json` means the site already runs a
 * server build, so the Astro endpoint is the glue.
 */
export function detectHost(root: string): string | undefined {
  const has = (file: string) => fs.existsSync(path.join(root, file))
  const found = [
    has('vercel.json') || has('.vercel') ? 'vercel' : undefined,
    has('netlify.toml') ? 'netlify' : undefined,
    has('wrangler.toml') || has('wrangler.json') || has('wrangler.jsonc') ? 'cloudflare' : undefined,
  ].filter((host): host is string => host !== undefined)
  if (found.length > 1) return undefined
  if (found[0] !== undefined) return found[0]
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    if (names.some((name) => /^@astrojs\/(node|vercel|netlify|cloudflare)$/.test(name))) return 'astro'
  } catch {
    // no package.json: nothing to detect
  }
  return undefined
}

export interface FormFile {
  path: string
  action: FileAction
}

export interface FormPlan {
  files: Array<FormFile & { source: string }>
  env: string[]
  needs?: string
  /** Things the person should know about files the command left alone. */
  notes: string[]
}

/**
 * What writing the handler and the glue would do. These files have no earlier releases to compare with, so a file
 * either does not exist (`create`), is already the recipe (`same`), or is the owner's (`conflict`, or `overwrite` when
 * they asked for it).
 */
export function planForm(root: string, handler: HandlerRecipe | undefined, glue: GlueRecipe | undefined, overwrite: boolean): FormPlan {
  const files: FormPlan['files'] = []
  const add = (file: string, source: string) => {
    const target = path.join(root, file)
    let action: FileAction = 'create'
    if (fs.existsSync(target)) {
      if (hashContent(file, fs.readFileSync(target)) === hashContent(file, source)) action = 'same'
      else action = overwrite ? 'overwrite' : 'conflict'
    }
    files.push({ path: file, action, source })
  }
  const notes: string[] = []
  if (handler) add(HANDLER_PATH, handler.source)
  for (const file of glue?.files ?? []) {
    if (file.skipWhenAny?.some((existing) => fs.existsSync(path.join(root, existing)))) {
      if (file.skipNote) notes.push(file.skipNote)
      continue
    }
    add(file.path, file.source)
  }
  return { files, env: handler?.env ?? [], needs: glue?.needs, notes }
}

/** Writes the files that need writing and records every file of the plan in the lock. Returns the paths written. */
export function applyForm(root: string, plan: FormPlan, version: string, lock: LockFile): { written: string[]; lock: LockFile } {
  const written: string[] = []
  const files = { ...lock.files }
  for (const file of plan.files) {
    if (file.action === 'conflict') throw new Error('The plan has conflicts. Nothing was written.')
    if (file.action === 'create' || file.action === 'overwrite') {
      const target = path.join(root, file.path)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, file.source)
      written.push(file.path)
    }
    files[file.path] = { version, hash: hashContent(file.path, file.source) }
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)))
  return { written, lock: { ...lock, files: sorted } }
}
