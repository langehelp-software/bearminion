import fs from 'node:fs'
import path from 'node:path'
import { hashContent } from '../registry/hash.js'
import type { LockFile, Registry } from '../registry/types.js'
import { recordFiles } from './lock.js'
import { detectPackageManager, missingPackages, type PackageManager } from './packages.js'
import type { FileAction } from './plan.js'

/*
 * `bearminion add hosted`: sets a site up for the hosted editor, the second deployment that signs people in and edits
 * the repository. Three kinds of file. The starter's own files the editor depends on come from the registry, like a
 * section's. Two recipe files are the site's from then on: the editor module and the build config of the editor
 * deployment. And a `build:editor` script is added to `package.json`. The site's own `astro.config.ts` is never edited:
 * the editor build is a separate config that imports it, so the public build cannot load any editor code.
 */

export const EDITOR_PATH = 'src/editor.ts'
export const BUILD_SCRIPT = 'build:editor'
const SECTIONS_PREFIX = 'src/components/sections/'
const BASE_CONFIGS = ['astro.config.ts', 'astro.config.mts', 'astro.config.mjs', 'astro.config.js']

export interface HostRecipe {
  name: string
  description: string
  adapterPackage: string
  /** What the adapter's default export is called when it is imported and called. */
  adapterCall: string
  adapterImport: string
}

export const HOSTS: readonly HostRecipe[] = [
  {
    name: 'vercel',
    description: 'Vercel: a second project on the same repository',
    adapterPackage: '@astrojs/vercel',
    adapterImport: 'vercel',
    adapterCall: 'vercel()',
  },
]

export const EDITOR_SOURCE = `import { createHostedEditor } from 'bearminion/hosted'
import { overlaySource } from 'bearminion/hosted-overlay'
import { contentModel } from './lib/content-model'

const secret = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(\`Missing \${name}.\`)
  return value
}

// A function, so a host that hands over its secrets per request works the same way.
export default () =>
  createHostedEditor({
    ...contentModel,
    repo: secret('BEARMINION_REPO'), // 'owner/name'
    auth: {
      clientId: secret('GITHUB_CLIENT_ID'),
      clientSecret: secret('GITHUB_CLIENT_SECRET'),
      secret: secret('SESSION_SECRET'), // 32+ characters: openssl rand -base64 32
      // Only these GitHub logins may sign in, and they still need push access. Leave it out to allow everyone with push access.
      // allowedLogins: ['your-github-login'],
    },
    overlay: overlaySource,
  })
`

export interface BaseConfig {
  /** The site's own config, from the site root. */
  file: string
  /** How the editor config imports it. */
  importPath: string
  /** The editor config's own path. */
  editorConfig: string
  /** The site's config already adds the hosted editor itself (an environment-variable gate). */
  addsEditor: boolean
}

/** The site's Astro config and the name the editor build's config gets beside it. Undefined when the site has none. */
export function findBaseConfig(root: string): BaseConfig | undefined {
  for (const file of BASE_CONFIGS) {
    const target = path.join(root, file)
    if (!fs.existsSync(target)) continue
    const typed = file.endsWith('ts')
    const extension = file.endsWith('.mts') ? 'mts' : typed ? 'ts' : 'mjs'
    return {
      file,
      importPath: typed ? `./${file.replace(/\.m?ts$/, '')}` : `./${file}`,
      editorConfig: `astro.editor.config.${extension}`,
      addsEditor: fs.readFileSync(target, 'utf8').includes('bearminionHostedEditor'),
    }
  }
  return undefined
}

export function configSource(host: HostRecipe, base: BaseConfig): string {
  return `import ${host.adapterImport} from '${host.adapterPackage}'
import { mergeConfig } from 'astro/config'
import { bearminionHostedEditor } from 'bearminion/astro'
import site from '${base.importPath}'

// The build of the editor deployment: the site's own config plus a server adapter and the hosted editor.
// \`${BUILD_SCRIPT}\` in package.json runs it. The public site keeps building from ${base.file} and never loads any of this.
export default mergeConfig(site, {
  adapter: ${host.adapterCall},
  integrations: [bearminionHostedEditor({ module: './${EDITOR_PATH}' })],
})
`
}

export const buildCommand = (base: BaseConfig): string => `astro build --config ${base.editorConfig}`

/** Adds one script to the text of a `package.json` without reformatting the rest. Undefined when it cannot be done safely. */
export function addScript(text: string, name: string, command: string): string | undefined {
  const match = /"scripts"\s*:\s*\{/.exec(text)
  if (!match) return undefined
  const after = match.index + match[0].length
  const rest = text.slice(after)
  const first = /^(\s*)(\S)/.exec(rest)
  if (!first) return undefined
  const entry = `${JSON.stringify(name)}: ${JSON.stringify(command)}`
  let result: string
  if (first[2] === '}') {
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    const indent = /^\s*/.exec(text.slice(lineStart))?.[0] ?? ''
    result = `${text.slice(0, after)}\n${indent}  ${entry}\n${indent}${rest.slice(rest.indexOf('}'))}`
  } else {
    result = `${text.slice(0, after)}${first[1]}${entry},${rest}`
  }
  try {
    const parsed = JSON.parse(result) as { scripts?: Record<string, string> }
    return parsed.scripts?.[name] === command ? result : undefined
  } catch {
    return undefined
  }
}

export type HostedAction = FileAction | 'keep'

export interface HostedFile {
  path: string
  action: HostedAction
  /** The text to write for a recipe file. Absent for a file copied from the registry. */
  source?: string
}

export type ScriptState = 'add' | 'same' | 'different' | 'unavailable' | 'skipped'

export interface HostedPlan {
  files: HostedFile[]
  script: ScriptState
  scriptCommand: string
  npm: Record<string, string>
  dirty: string[]
  notes: string[]
  base: BaseConfig
  packageManager: PackageManager
}

/** The section a file of the site belongs to, when it is a section's own file. */
const sectionOf = (file: string): string | undefined =>
  file.startsWith(SECTIONS_PREFIX) ? file.slice(SECTIONS_PREFIX.length).split('/')[0] : undefined

export function planHosted(root: string, registry: Registry, host: HostRecipe, lock: LockFile, overwrite: boolean): HostedPlan {
  const group = registry.groups?.hosted
  if (group === undefined) throw new Error('This copy of bearminion has no hosted files. Reinstall the package.')
  const base = findBaseConfig(root)
  if (base === undefined)
    throw new Error("No Astro config found (astro.config.ts, .mts, .mjs or .js). Run this in the site's folder, or pass --cwd.")
  const notes: string[] = []
  const files: HostedFile[] = []

  for (const file of group.files) {
    const section = sectionOf(file)
    if (section !== undefined && !fs.existsSync(path.join(root, SECTIONS_PREFIX, section, 'definition.ts'))) continue
    const entry = registry.files[file]
    if (entry === undefined) throw new Error(`The registry lists ${file} for the hosted editor but holds no copy of it.`)
    const target = path.join(root, file)
    let action: FileAction
    if (!fs.existsSync(target)) action = 'create'
    else {
      const hash = hashContent(file, fs.readFileSync(target))
      if (hash === entry.hash) action = 'same'
      else if (entry.history.includes(hash) || lock.files[file]?.hash === hash) action = 'update'
      else action = overwrite ? 'overwrite' : 'conflict'
    }
    files.push({ path: file, action })
  }

  // The two files below are the site's from the first write on: a different one is kept, not stopped on.
  const recipe = (file: string, source: string) => {
    const target = path.join(root, file)
    let action: HostedAction = 'create'
    if (fs.existsSync(target)) {
      action = hashContent(file, fs.readFileSync(target)) === hashContent(file, source) ? 'same' : overwrite ? 'overwrite' : 'keep'
    }
    files.push({ path: file, action, source })
    if (action === 'keep') notes.push(`${file} already exists and differs from the recipe, so it was left alone.`)
  }
  recipe(EDITOR_PATH, EDITOR_SOURCE)

  let script: ScriptState = 'skipped'
  const scriptCommand = buildCommand(base)
  if (base.addsEditor) {
    notes.push(
      `${base.file} already adds the hosted editor itself, so no ${base.editorConfig} was written and no ${BUILD_SCRIPT} script was added. Use one way or the other: with an environment-variable gate in ${base.file}, build the editor deployment with that variable set.`,
    )
  } else {
    recipe(base.editorConfig, configSource(host, base))
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const current = manifest.scripts?.[BUILD_SCRIPT]
    if (current === scriptCommand) script = 'same'
    else if (current !== undefined) {
      script = 'different'
      notes.push(`package.json already has a "${BUILD_SCRIPT}" script that differs from \`${scriptCommand}\`, so it was left alone.`)
    } else if (manifest.scripts === undefined) {
      script = 'unavailable'
      notes.push(`package.json has no "scripts" object. Build the editor deployment with: ${scriptCommand}`)
    } else script = 'add'
  }

  return {
    files,
    script,
    scriptCommand,
    npm: missingPackages(root, { [host.adapterPackage]: 'latest' }),
    dirty: [],
    notes,
    base,
    packageManager: detectPackageManager(root),
  }
}

export const writesHosted = (action: HostedAction): boolean => action === 'create' || action === 'update' || action === 'overwrite'

/** Writes what the plan says and notes the files in the lock. Returns the paths written. A plan with conflicts is never applied. */
export function applyHosted(
  root: string,
  registryDir: string,
  registry: Registry,
  plan: HostedPlan,
  lock: LockFile,
): { written: string[]; lock: LockFile } {
  if (plan.files.some((file) => file.action === 'conflict')) throw new Error('The plan has conflicts. Nothing was written.')
  const written: string[] = []
  const recipes: Record<string, { version: string; hash: string }> = {}
  for (const file of plan.files) {
    if (writesHosted(file.action)) {
      const target = path.join(root, file.path)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (file.source === undefined) fs.copyFileSync(path.join(registryDir, 'files', file.path), target)
      else fs.writeFileSync(target, file.source)
      written.push(file.path)
    }
    if (file.source !== undefined && (writesHosted(file.action) || file.action === 'same')) {
      recipes[file.path] = { version: registry.version, hash: hashContent(file.path, file.source) }
    }
  }
  if (plan.script === 'add') {
    const manifest = path.join(root, 'package.json')
    const patched = addScript(fs.readFileSync(manifest, 'utf8'), BUILD_SCRIPT, plan.scriptCommand)
    if (patched === undefined) {
      plan.script = 'unavailable'
      plan.notes.push(`Could not add the script to package.json safely. Add it by hand: "${BUILD_SCRIPT}": "${plan.scriptCommand}"`)
    } else {
      fs.writeFileSync(manifest, patched)
      written.push('package.json')
    }
  }
  const registryFiles = plan.files.filter((file) => file.source === undefined).map((file) => file.path)
  const recorded = recordFiles(lock, registry, registryFiles)
  const files = Object.fromEntries(Object.entries({ ...recorded.files, ...recipes }).sort(([a], [b]) => (a < b ? -1 : 1)))
  return { written, lock: { ...recorded, files } }
}

/** What is left to do outside the repository. */
export function checklist(manager: PackageManager, base: BaseConfig): string[] {
  return [
    'Next, outside this repository:',
    '',
    '1. A GitHub App (Settings > Developer settings > GitHub Apps > New GitHub App)',
    '   - Redirect URI: https://<address of the editor deployment>/__bearminion/auth/callback (add it once you have the address)',
    '   - Repository permissions: Contents and Pull requests read and write, Metadata read',
    '   - Expire user authorization tokens: on',
    '   - Install it on this repository only',
    '   - Visibility: a private App lets only its owner sign in. If anyone else edits, make it public and set allowedLogins in src/editor.ts.',
    '',
    '2. A second Vercel project from this same repository (the first stays the public site)',
    `   - Build Command: ${manager} run ${BUILD_SCRIPT}`,
    '   - Deployment Protection: off for this project (the editor has its own sign-in)',
    '   - Environment variables: BEARMINION_REPO (owner/name), GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET (openssl rand -base64 32)',
    '',
    `3. Open the new project's address and sign in. The public site's build, from ${base.file}, is unchanged.`,
  ]
}
