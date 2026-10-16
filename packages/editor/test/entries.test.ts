import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const src = path.resolve(import.meta.dirname, '../src')

/** Runtime imports (not `import type`) reachable from `entry`, following relative imports, that leave the module graph. */
function externalImports(entry: string): string[] {
  const seen = new Set<string>()
  const found: string[] = []
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/^(?:import|export)\s+(type\s+)?[^'"]*?from\s+'([^']+)'/gm)) {
      const spec = match[2] ?? ''
      if (match[1] || spec === '') continue
      if (spec.startsWith('.')) {
        const base = path.resolve(path.dirname(file), spec).replace(/\.js$/, '')
        const next = ['.ts', '.tsx'].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate))
        if (next) visit(next)
      } else {
        found.push(`${path.relative(src, file)} -> ${spec}`)
      }
    }
  }
  visit(path.join(src, entry))
  return found
}

describe('package entry points', () => {
  it.each(['index.ts', 'rich-text.ts', 'marks.ts'])('%s runs anywhere: no Node, Astro or Vite imports', (entry) => {
    const external = externalImports(entry).filter((line) => /-> (?:node:|astro|vite)/.test(line))
    expect(external).toEqual([])
  })
})
