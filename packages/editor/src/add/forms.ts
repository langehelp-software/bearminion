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

export interface GlueRecipe {
  name: string
  description: string
  path: string
  /** An npm package the file imports types from. */
  needs?: string
  source: string
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
    path: 'api/contact.ts',
    source: `// The ".js" is needed: Vercel runs this as an ES module, which does not guess file extensions. The file is contact.ts.
import form from '../src/forms/contact.js'

export const POST = (request: Request) => form.fetch(request, process.env)
export const OPTIONS = POST
`,
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
  if (handler) add(HANDLER_PATH, handler.source)
  if (glue) add(glue.path, glue.source)
  return { files, env: handler?.env ?? [], needs: glue?.needs }
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
