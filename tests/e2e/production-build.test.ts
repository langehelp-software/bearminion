import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../templates/default')

describe('production build', () => {
  it('does not emit bearminion editor code', () => {
    execFileSync(process.execPath, [path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], {
      cwd: root,
      stdio: 'pipe',
      env: process.env,
    })
    const dist = path.join(root, 'dist')
    const hits: string[] = []
    walk(dist, (file) => {
      if (!/\.(html|js|mjs|css|json|txt|svg|xml)$/.test(file)) return
      const text = fs.readFileSync(file, 'utf8')
      if (
        text.includes('__bearminion') ||
        text.includes('bearminion-content-reload') ||
        text.includes('handleEditorRequest') ||
        text.includes('bearminion-editor-client') ||
        text.includes('virtual:bearminion-editor') ||
        text.includes('mountEditor') ||
        text.includes('bm-sidebar')
      ) {
        hits.push(path.relative(dist, file))
      }
    })
    expect(hits).toEqual([])
    // The theme workshops are dev-only routes.
    for (const page of ['style-guide', 'variants']) {
      expect(fs.existsSync(path.join(dist, page))).toBe(false)
      expect(fs.existsSync(path.join(dist, `${page}.html`))).toBe(false)
    }
  }, 180_000)
})

function walk(directory: string, visit: (file: string) => void): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full, visit)
    else if (entry.isFile()) visit(full)
  }
}
