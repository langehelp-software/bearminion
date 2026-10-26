import fs from 'node:fs'
import path from 'node:path'

/** Files that exist in every site and belong to it: a section may import them, but `add` never writes them. */
export const SITE_FILES: readonly string[] = [
  'src/components/sections/definitions.ts',
  'src/components/sections/definitions.gen.ts',
  'src/components/sections/components.gen.ts',
]

const PARSED = /\.(?:astro|ts|mts|js|mjs)$/
const RESOLVE_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs', '.astro', '.json']
const INDEX_FILES = ['index.ts', 'index.js', 'index.astro']

/**
 * What a file imports: `import … from`, `export … from`, a bare `import 'x'` and `import('x')`, taken from statements
 * that start a line, so comments and strings that merely mention one are not read. Works on `.ts` and on `.astro`
 * (its frontmatter and `<script>` blocks hold the same statements). A specifier that does not resolve fails the
 * build, which is how a wrong match would show.
 */
export function importsOf(text: string): string[] {
  const found = new Set<string>()
  const patterns = [
    /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"\n]+)['"]/gm,
    /^[ \t]*import\s*['"]([^'"\n]+)['"]/gm,
    /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) if (match[1] !== undefined) found.add(match[1])
  }
  return [...found]
}

/** The npm package a bare specifier names, or undefined for what is not an npm dependency. */
export function packageOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return undefined
  if (/^(?:node|astro|virtual):/.test(specifier)) return undefined
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  if (name === undefined || name === 'bearminion') return undefined
  return name
}

const toPosix = (file: string) => file.split(path.sep).join('/')

function resolveRelative(templateDir: string, from: string, specifier: string): string {
  const base = path.posix.join(path.posix.dirname(from), specifier.replace(/\?.*$/, ''))
  const candidates = [base, ...RESOLVE_EXTENSIONS.map((extension) => base + extension), ...INDEX_FILES.map((index) => `${base}/${index}`)]
  for (const candidate of candidates) {
    const absolute = path.join(templateDir, candidate)
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) return candidate
  }
  throw new Error(`${from} imports "${specifier}", which is not a file in the template.`)
}

/** Story files and Storybook's helpers: they are not part of a site unless it asks for Storybook. */
export const isStoryPath = (file: string) => file.endsWith('.stories.ts') || file.startsWith('src/stories/')

export interface Closure {
  /** Every file reached, the start files included, sorted. */
  files: string[]
  /** Bare npm package names imported anywhere in them. */
  packages: string[]
}

/** The files `start` need: themselves and, through imports, everything else in the template they reach. */
export function closureOf(templateDir: string, start: readonly string[]): Closure {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [...start]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (files.has(file)) continue
    files.add(file)
    if (!PARSED.test(file)) continue
    const text = fs.readFileSync(path.join(templateDir, file), 'utf8')
    for (const specifier of importsOf(text)) {
      const name = packageOf(specifier)
      if (name !== undefined) {
        packages.add(name)
        continue
      }
      if (!specifier.startsWith('.')) continue
      const resolved = resolveRelative(templateDir, file, specifier)
      if (SITE_FILES.includes(resolved)) continue
      if (isStoryPath(resolved)) throw new Error(`${file} imports ${resolved}, a story file. A site does not get those.`)
      queue.push(resolved)
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort() }
}

/** Every file under `dir` (a path from the template root), without story files, as paths from the template root. */
export function filesUnder(templateDir: string, dir: string): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(path.join(templateDir, current), { withFileTypes: true })) {
      const next = toPosix(path.join(current, entry.name))
      if (entry.isDirectory()) walk(next)
      else if (!isStoryPath(next)) out.push(next)
    }
  }
  walk(dir)
  return out.sort()
}
