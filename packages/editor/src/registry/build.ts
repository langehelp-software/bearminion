import fs from 'node:fs'
import path from 'node:path'
import { scanSections } from '../sections-manifest.js'
import { closureOf, filesUnder } from './closure.js'
import { hashContent } from './hash.js'
import { REGISTRY_SCHEMA_VERSION, type Registry, type RegistryHistory, type RegistryItem } from './types.js'

export const SECTIONS_DIR = 'src/components/sections'

/** The string a `defineSection({ … })` call gives `key`, read from the source: `label` and `description` are plain literals. */
export function literalProperty(source: string, key: string): string | undefined {
  const match = new RegExp(`^[ \\t]+${key}:\\s*(?:\\n\\s*)?(['"\`])((?:\\\\.|(?!\\1).)*)\\1`, 'm').exec(source)
  return match?.[2]?.replace(/\\(['"`\\])/g, '$1')
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

export interface BuildOptions {
  /** `templates/default`. */
  templateDir: string
  /** The release the template is part of. */
  version: string
  /** Hashes of earlier releases (`registry-history.json`). */
  history?: RegistryHistory
  template?: string
}

/** Everything the registry holds, worked out from the template and not yet written anywhere. */
export interface BuiltRegistry {
  registry: Registry
}

/** Reads the template and works out one item per section directory, with every file each one needs. */
export function readRegistry(options: BuildOptions): Registry {
  const { templateDir, version, history = {} } = options
  const packageJson = readJson<PackageJson>(path.join(templateDir, 'package.json'))
  const ranges = { ...packageJson.devDependencies, ...packageJson.dependencies }
  const items: Record<string, RegistryItem> = {}
  const tracked = new Set<string>()

  for (const entry of scanSections(path.join(templateDir, SECTIONS_DIR))) {
    const dir = `${SECTIONS_DIR}/${entry.dir}`
    const closure = closureOf(templateDir, filesUnder(templateDir, dir))
    const definition = fs.readFileSync(path.join(templateDir, dir, 'definition.ts'), 'utf8')
    const label = literalProperty(definition, 'label')
    const description = literalProperty(definition, 'description')
    if (!label || !description) throw new Error(`${dir}/definition.ts needs a plain string \`label\` and \`description\`.`)
    const npm: Record<string, string> = {}
    for (const name of closure.packages) {
      const range = ranges[name]
      if (range === undefined) throw new Error(`${dir} imports "${name}", which is not in the template's package.json.`)
      npm[name] = range
    }
    for (const file of closure.files) tracked.add(file)
    items[entry.dir] = { dir: entry.dir, type: entry.key, label, description, files: closure.files, npm }
  }

  const files: Registry['files'] = {}
  for (const file of [...tracked].sort()) {
    const hash = hashContent(file, fs.readFileSync(path.join(templateDir, file)))
    const earlier = Object.values(history)
      .map((release) => release[file])
      .filter((value): value is string => value !== undefined && value !== hash)
    files[file] = { hash, history: [...new Set(earlier)] }
  }
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, template: options.template ?? 'default', version, files, items }
}

/** Writes `registry.json` and a copy of every file it lists under `files/`, replacing what was there. */
export function writeRegistry(registry: Registry, templateDir: string, outDir: string): void {
  fs.rmSync(outDir, { recursive: true, force: true })
  for (const file of Object.keys(registry.files)) {
    const target = path.join(outDir, 'files', file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(templateDir, file), target)
  }
  fs.writeFileSync(path.join(outDir, 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`)
}

/** The hash of every file the registry holds: what `registry-history.json` records for a release. */
export function currentHashes(registry: Registry): Record<string, string> {
  return Object.fromEntries(Object.entries(registry.files).map(([file, { hash }]) => [file, hash]))
}
