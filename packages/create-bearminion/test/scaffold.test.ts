import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  blockingEntries,
  isStorybookPath,
  scaffold,
  stripStorybookBlocks,
  transformPackageJson,
  transformSiteJson,
} from '../src/scaffold.js'
import { assertTemplateRange, copyTemplate } from '../src/template.js'

const source = path.resolve(import.meta.dirname, '../../../templates/default')
const editorVersion = (
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../editor/package.json'), 'utf8')) as { version: string }
).version
let work: string
let template: string

beforeAll(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'create-bearminion-'))
  template = path.join(work, 'template')
  copyTemplate(source, template)
})

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')]
  })
}

describe('copyTemplate', () => {
  it('stores .gitignore as _gitignore and leaves out installs, builds and editor history', () => {
    const files = walk(template)
    expect(files).toContain('_gitignore')
    expect(files).not.toContain('.gitignore')
    expect(files.some((file) => /(^|\/)(node_modules|dist|\.astro|\.editor|storybook-static)\//.test(file))).toBe(false)
    expect(files).toContain('content/site.json')
  })

  it('asks for the bearminion version being released', () => {
    expect(() => assertTemplateRange(template, editorVersion)).not.toThrow()
    expect(() => assertTemplateRange(template, '9.9.9')).toThrow(/Expected "\^9\.9\.9"/)
  })
})

describe('transforms', () => {
  it('names the package, resets its version and drops Storybook unless asked for', () => {
    const pkg = {
      name: 'bearminion-site',
      version: '1.2.3',
      scripts: { dev: 'astro dev', storybook: 'storybook dev', 'build-storybook': 'storybook build' },
      devDependencies: { storybook: '^10', '@storybook/builder-vite': '^10', '@storybook-astro/framework': '^1', typescript: '~5' },
    }
    expect(transformPackageJson(pkg, { name: 'acme', storybook: false })).toEqual({
      name: 'acme',
      version: '0.0.0',
      private: true,
      scripts: { dev: 'astro dev' },
      devDependencies: { typescript: '~5' },
    })
    expect(transformPackageJson(pkg, { name: 'acme', storybook: true }).devDependencies).toEqual(pkg.devDependencies)
  })

  it('renames the site, drops the BearMinion wordmark styling and logo, and sets the address', () => {
    const site = {
      name: 'BearMinion',
      nameMarks: [{ start: 4, end: 10, italic: true }],
      brandLogo: { src: 'src/assets/uploads/logo.png', alt: 'BearMinion' },
      url: 'https://example.com',
      seo: { titleTemplate: '%s · BearMinion', description: 'x' },
    }
    expect(transformSiteJson(site, { name: 'Acme', url: 'https://acme.com' })).toEqual({
      name: 'Acme',
      url: 'https://acme.com',
      seo: { titleTemplate: '%s · Acme', description: 'x' },
    })
    expect(transformSiteJson(site, { name: 'Acme' }).url).toBe('https://example.com')
  })

  it('removes marked Storybook blocks from markdown', () => {
    const readme = 'Intro\n\n<!-- storybook:start -->\n## Storybook\n\nRun it.\n<!-- storybook:end -->\n\n## After\n'
    expect(stripStorybookBlocks(readme)).toBe('Intro\n\n## After\n')
  })

  it('recognizes Storybook files', () => {
    expect(isStorybookPath('.storybook/main.ts')).toBe(true)
    expect(isStorybookPath('src/stories/args.ts')).toBe(true)
    expect(isStorybookPath('src/components/atoms/Button.stories.ts')).toBe(true)
    expect(isStorybookPath('src/components/atoms/Button.astro')).toBe(false)
  })
})

describe('blockingEntries', () => {
  it('accepts a missing folder or one with only git metadata, and lists anything else', async () => {
    const dir = path.join(work, 'target-check')
    expect(await blockingEntries(dir)).toEqual([])
    mkdirSync(path.join(dir, '.git'), { recursive: true })
    writeFileSync(path.join(dir, '.DS_Store'), '')
    expect(await blockingEntries(dir)).toEqual([])
    writeFileSync(path.join(dir, 'notes.txt'), 'x')
    expect(await blockingEntries(dir)).toEqual(['notes.txt'])
  })
})

describe('scaffold', () => {
  it('creates a site without Storybook', async () => {
    const target = path.join(work, 'plain')
    await scaffold({
      templateDir: template,
      targetDir: target,
      packageName: 'plain',
      siteName: 'Plain Site',
      url: 'https://plain.dev',
      storybook: false,
    })
    const files = walk(target)
    expect(files).toContain('.gitignore')
    expect(files).not.toContain('_gitignore')
    // The example is kept in git (the template's .gitignore excepts it) and every line in it is a comment.
    expect(files).toContain('.env.example')
    expect(
      readFileSync(path.join(target, '.env.example'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('#')),
    ).toEqual([])
    expect(readFileSync(path.join(target, '.gitignore'), 'utf8')).toContain('!.env.example')
    // The assistant's instructions travel with the site, and lead with the rules that keep secrets out of the chat and git.
    expect(files).toContain('AGENTS.md')
    expect(readFileSync(path.join(target, 'CLAUDE.md'), 'utf8').trim()).toBe('@AGENTS.md')
    const agents = readFileSync(path.join(target, 'AGENTS.md'), 'utf8')
    expect(agents.indexOf('## Secrets')).toBeLessThan(agents.indexOf('## Setting up the Contact form'))
    expect(agents).toContain('Never ask the person to paste a key')
    expect(agents).toContain('Do not open `.env`')
    expect(agents).toContain('npx bearminion check form')
    expect(files.filter(isStorybookPath)).toEqual([])
    const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(pkg).toMatchObject({ name: 'plain', version: '0.0.0', private: true })
    expect(JSON.stringify(pkg)).not.toMatch(/storybook/i)
    expect((pkg.dependencies as Record<string, string>).bearminion).toBe(`^${editorVersion}`)
    const siteText = readFileSync(path.join(target, 'content/site.json'), 'utf8')
    const site = JSON.parse(siteText) as Record<string, unknown>
    expect(site).toMatchObject({ name: 'Plain Site', url: 'https://plain.dev', seo: { titleTemplate: '%s · Plain Site' } })
    expect(site).not.toHaveProperty('brandLogo')
    expect(site).not.toHaveProperty('nameMarks')
    expect(siteText.endsWith('}\n')).toBe(true)
    const readme = readFileSync(path.join(target, 'README.md'), 'utf8')
    expect(readme).not.toMatch(/storybook:start|## Storybook|npm run storybook/)
  })

  it('keeps Storybook with --storybook', async () => {
    const target = path.join(work, 'with-storybook')
    await scaffold({ templateDir: template, targetDir: target, packageName: 'sb', siteName: 'SB', storybook: true })
    expect(existsSync(path.join(target, '.storybook/main.ts'))).toBe(true)
    expect(walk(target).some((file) => file.endsWith('.stories.ts'))).toBe(true)
    const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts.storybook).toBeDefined()
    expect(readFileSync(path.join(target, 'README.md'), 'utf8')).toMatch(/## Storybook/)
  })
})
