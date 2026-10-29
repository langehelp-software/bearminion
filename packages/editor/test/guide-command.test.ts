import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { run } from '../src/command.js'
import { loadContentModel, ModelError } from '../src/load-model.js'

const starter = path.resolve(import.meta.dirname, '../../../templates/default')

async function guide(...args: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = []
  const code = await run(['guide', ...args, '--cwd', starter], { log: (line) => lines.push(line) })
  return { code, out: lines.join('\n') }
}

describe('loadContentModel', () => {
  it("loads the starter's model from its TypeScript source", async () => {
    const model = await loadContentModel(starter)
    expect(Object.keys(model.sections)).toContain('hero')
    expect(model.site).toBeDefined()
  })

  it('says what is missing when there is no model file', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-model-'))
    await expect(loadContentModel(empty)).rejects.toThrow(ModelError)
    await expect(loadContentModel(empty)).rejects.toThrow('--model')
  })

  it('rejects a file that exports no model', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-model-'))
    fs.mkdirSync(path.join(dir, 'src/lib'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src/lib/content-model.ts'), 'export const contentModel = { sections: {} }\n')
    await expect(loadContentModel(dir)).rejects.toThrow('must export')
  })
})

describe('bearminion guide', () => {
  it('lists the sections of the site', async () => {
    const { code, out } = await guide()
    expect(code).toBe(0)
    expect(out).toContain('# Sections in this site')
    expect(out).toContain('`hero`')
  })

  it('prints one section', async () => {
    const { code, out } = await guide('hero')
    expect(code).toBe(0)
    expect(out).toContain('# Hero (`hero`)')
    expect(out).toContain('## Content')
  })

  it('names the sections the site has when the type is unknown', async () => {
    const { code, out } = await guide('nope')
    expect(code).toBe(1)
    expect(out).toContain('no section called "nope"')
    expect(out).toContain('hero')
  })
})
