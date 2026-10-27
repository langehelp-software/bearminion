import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLock } from '../src/add/lock.js'
import { detectPackageManager, installCommand, missingPackages } from '../src/add/packages.js'
import { planAdd } from '../src/add/plan.js'
import { run } from '../src/command.js'
import { currentHashes, literalProperty, readRegistry, writeRegistry } from '../src/registry/build.js'
import { closureOf, importsOf, packageOf } from '../src/registry/closure.js'
import { hashContent } from '../src/registry/hash.js'
import { readHistory, recordRelease, releaseMatches } from '../src/registry/history.js'
import { LOCK_FILE } from '../src/registry/types.js'

const temporary: string[] = []
const folder = (label: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bearminion-${label}-`))
  temporary.push(dir)
  return dir
}
const write = (root: string, file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), content)
}
afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const SECTIONS = 'src/components/sections'

/** A template with two sections that share an atom, a lib file and a package. */
function makeTemplate(): string {
  const dir = folder('template')
  write(
    dir,
    'package.json',
    JSON.stringify({ dependencies: { astro: '^7.0.0', zod: '^4.0.0' }, devDependencies: { typescript: '~5.9.0' } }),
  )
  write(dir, `${SECTIONS}/definitions.ts`, "// the site's own\n")
  write(dir, `${SECTIONS}/definitions.gen.ts`, '// generated\n')
  write(dir, `${SECTIONS}/components.gen.ts`, '// generated\n')
  write(dir, `${SECTIONS}/shared.ts`, 'export const eyebrow = 1\n')
  write(dir, 'src/components/atoms/Atom.astro', "---\nimport { cn } from '../../lib/cn'\n---\n<p class={cn('a')}>atom</p>\n")
  write(dir, 'src/lib/cn.ts', "import { z } from 'zod'\nexport const cn = (x: string) => z.string().parse(x)\n")
  write(dir, 'src/stories/sample.ts', 'export const sample = 1\n')
  const sections = [
    { dir: 'alpha', type: 'alpha', component: 'Alpha', label: 'Alpha' },
    { dir: 'beta-two', type: 'betaTwo', component: 'BetaTwo', label: 'Beta two' },
  ]
  for (const section of sections) {
    const base = `${SECTIONS}/${section.dir}`
    write(
      dir,
      `${base}/definition.ts`,
      [
        "import { z } from 'zod'",
        "import { eyebrow } from '../shared'",
        `export const ${section.type} = defineSection({`,
        `  type: '${section.type}',`,
        `  label: '${section.label}',`,
        `  description: 'The ${section.label} section.',`,
        '})',
        '',
      ].join('\n'),
    )
    write(dir, `${base}/wireframe.ts`, 'export const wireframe = []\n')
    write(
      dir,
      `${base}/${section.component}.astro`,
      "---\nimport type { Section } from '../definitions'\nimport Atom from '../../atoms/Atom.astro'\nimport { thing } from 'astro/thing'\n---\n<Atom />\n",
    )
    write(dir, `${base}/${section.component}.stories.ts`, "import { sample } from '../../../stories/sample'\n")
  }
  return dir
}

/** A site that lists its sections the new way and holds none of the template's files yet. */
function makeSite(): string {
  const dir = folder('site')
  write(dir, 'package.json', JSON.stringify({ dependencies: { astro: '^7.0.0' } }))
  write(dir, `${SECTIONS}/definitions.ts`, "// the site's own, customised\n")
  write(dir, `${SECTIONS}/definitions.gen.ts`, '// stale\n')
  write(dir, `${SECTIONS}/components.gen.ts`, '// stale\n')
  return dir
}

function build(templateDir: string, history: Record<string, Record<string, string>> = {}) {
  const registry = readRegistry({ templateDir, version: '1.8.0', history })
  const registryDir = folder('registry')
  writeRegistry(registry, templateDir, registryDir)
  return { registry, registryDir }
}

async function exec(argv: string[], registryDir: string, extra: Record<string, unknown> = {}) {
  const out: string[] = []
  const code = await run(argv, { log: (line) => out.push(line), registryDir, ...extra })
  return { code, text: out.join('\n') }
}

describe('what a file imports', () => {
  it('reads import and export statements that start a line, in .ts and .astro', () => {
    const text = [
      '---',
      "import A from '../a.astro'",
      "import type { T } from '../t'",
      'import {',
      '  b,',
      '  c,',
      "} from './bc'",
      "export { d } from './d'",
      "import './side'",
      "const lazy = import('./lazy')",
      "// import nope from './comment'",
      " * import nope2 from './block'",
      '---',
    ].join('\n')
    expect(importsOf(text).sort()).toEqual(['../a.astro', '../t', './bc', './d', './lazy', './side'])
  })

  it('names the package a bare specifier belongs to, and skips what is not one', () => {
    expect(packageOf('zod')).toBe('zod')
    expect(packageOf('@astrojs/sitemap/x')).toBe('@astrojs/sitemap')
    expect(packageOf('class-variance-authority')).toBe('class-variance-authority')
    expect(packageOf('bearminion')).toBeUndefined()
    expect(packageOf('bearminion/forms')).toBeUndefined()
    expect(packageOf('node:fs')).toBeUndefined()
    expect(packageOf('astro:assets')).toBeUndefined()
    expect(packageOf('./local')).toBeUndefined()
  })
})

describe('closureOf', () => {
  it('follows imports, keeps the site files out and lists the packages', () => {
    const template = makeTemplate()
    const closure = closureOf(template, [`${SECTIONS}/alpha/Alpha.astro`, `${SECTIONS}/alpha/definition.ts`])
    expect(closure.files).toEqual([
      'src/components/atoms/Atom.astro',
      `${SECTIONS}/alpha/Alpha.astro`,
      `${SECTIONS}/alpha/definition.ts`,
      `${SECTIONS}/shared.ts`,
      'src/lib/cn.ts',
    ])
    expect(closure.packages).toEqual(['astro', 'zod'])
  })

  it('fails on an import that does not resolve, and on a story', () => {
    const template = makeTemplate()
    write(template, 'src/lib/bad.ts', "import x from './missing'\n")
    expect(() => closureOf(template, ['src/lib/bad.ts'])).toThrow(/imports "\.\/missing", which is not a file/)
    write(template, 'src/lib/story.ts', "import { sample } from '../stories/sample'\n")
    expect(() => closureOf(template, ['src/lib/story.ts'])).toThrow(/a story file/)
  })
})

describe('the registry', () => {
  it('has an item per section directory with what each needs', () => {
    const { registry } = build(makeTemplate())
    expect(Object.keys(registry.items)).toEqual(['alpha', 'beta-two'])
    expect(registry.items['beta-two']).toMatchObject({
      dir: 'beta-two',
      type: 'betaTwo',
      label: 'Beta two',
      description: 'The Beta two section.',
    })
    expect(registry.items.alpha?.files).toContain('src/components/atoms/Atom.astro')
    expect(registry.items.alpha?.files.some((file) => file.endsWith('.stories.ts'))).toBe(false)
    expect(registry.items.alpha?.npm).toEqual({ astro: '^7.0.0', zod: '^4.0.0' })
    expect(Object.keys(registry.files)).not.toContain(`${SECTIONS}/definitions.ts`)
  })

  it('copies every file it lists, and nothing else', () => {
    const { registry, registryDir } = build(makeTemplate())
    for (const file of Object.keys(registry.files)) expect(fs.existsSync(path.join(registryDir, 'files', file))).toBe(true)
    expect(fs.existsSync(path.join(registryDir, 'files', 'src/stories/sample.ts'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(registryDir, 'registry.json'), 'utf8')).version).toBe('1.8.0')
  })

  it('needs every imported package to be in the template package.json', () => {
    const template = makeTemplate()
    write(template, 'src/lib/cn.ts', "import { x } from 'left-pad'\n")
    expect(() => build(template)).toThrow(/imports "left-pad", which is not in the template's package.json/)
  })

  it('reads the label and description a section declares', () => {
    expect(literalProperty("  label: 'Gallery',\n  description: 'Pictures. \\'Click\\' one.',", 'description')).toBe(
      "Pictures. 'Click' one.",
    )
    expect(literalProperty('  label: "Hero",', 'label')).toBe('Hero')
    expect(literalProperty('  other: 1', 'label')).toBeUndefined()
  })

  it('lists the hashes of earlier releases but not the current one', () => {
    const template = makeTemplate()
    const current = build(template).registry.files['src/components/atoms/Atom.astro']?.hash as string
    const history = {
      '1.7.0': { 'src/components/atoms/Atom.astro': 'aaaa' },
      '1.6.0': { 'src/components/atoms/Atom.astro': current },
    }
    expect(build(template, history).registry.files['src/components/atoms/Atom.astro']?.history).toEqual(['aaaa'])
  })

  it('hashes a Windows checkout and a Unix one alike', () => {
    expect(hashContent('a.ts', 'one\r\ntwo\r\n')).toBe(hashContent('a.ts', 'one\ntwo\n'))
    expect(hashContent('a.png', Buffer.from([13, 10]))).not.toBe(hashContent('a.png', Buffer.from([10])))
  })
})

describe('the release history', () => {
  it('records a release once, and says whether it still matches the template', () => {
    const file = path.join(folder('history'), 'registry-history.json')
    const hashes = currentHashes(build(makeTemplate()).registry)
    expect(recordRelease(file, '1.8.0', hashes)).toBe(true)
    expect(recordRelease(file, '1.8.0', hashes)).toBe(false)
    expect(releaseMatches(file, '1.8.0', hashes)).toBe(true)
    expect(releaseMatches(file, '1.9.0', hashes)).toBe(false)
    expect(releaseMatches(file, '1.8.0', { ...hashes, 'src/lib/cn.ts': 'changed' })).toBe(false)
    expect(Object.keys(readHistory(file))).toEqual(['1.8.0'])
    expect(readHistory(path.join(folder('none'), 'missing.json'))).toEqual({})
  })
})

describe('planAdd', () => {
  it('tells create, same, update and conflict apart', () => {
    const template = makeTemplate()
    const atom = fs.readFileSync(path.join(template, 'src/components/atoms/Atom.astro'), 'utf8')
    const earlier = `${atom}<!-- earlier -->\n`
    const { registry } = build(template, { '1.7.0': { 'src/components/atoms/Atom.astro': hashContent('x.astro', earlier) } })
    const site = makeSite()
    write(site, 'src/components/atoms/Atom.astro', earlier)
    write(site, 'src/lib/cn.ts', 'edited by the owner\n')
    write(site, `${SECTIONS}/shared.ts`, fs.readFileSync(path.join(template, `${SECTIONS}/shared.ts`), 'utf8'))
    const alpha = registry.items.alpha
    if (alpha === undefined) throw new Error('no alpha')
    const plan = planAdd(site, registry, [alpha])
    const actions = Object.fromEntries(plan.files.map((file) => [file.path, file.action]))
    expect(actions['src/components/atoms/Atom.astro']).toBe('update')
    expect(actions['src/lib/cn.ts']).toBe('conflict')
    expect(actions[`${SECTIONS}/shared.ts`]).toBe('same')
    expect(actions[`${SECTIONS}/alpha/Alpha.astro`]).toBe('create')
    expect(planAdd(site, registry, [alpha], { overwrite: true }).files.find((file) => file.path === 'src/lib/cn.ts')?.action).toBe(
      'overwrite',
    )
    expect(plan.npm).toEqual({ zod: '^4.0.0' })
  })
})

describe('packages', () => {
  it('finds the package manager by its lock file, and the command that installs', () => {
    const site = makeSite()
    expect(detectPackageManager(site)).toBe('npm')
    write(site, 'pnpm-lock.yaml', '')
    expect(detectPackageManager(site)).toBe('pnpm')
    expect(installCommand('pnpm', { zod: '^4.0.0' })).toEqual({ command: 'pnpm', args: ['add', 'zod@^4.0.0'] })
    expect(installCommand('npm', { zod: '^4.0.0' })).toEqual({ command: 'npm', args: ['install', 'zod@^4.0.0'] })
  })

  it('lists what package.json lacks', () => {
    expect(missingPackages(makeSite(), { astro: '^7', zod: '^4' })).toEqual({ zod: '^4' })
  })
})

describe('bearminion add', () => {
  it('lists the sections and marks the ones the site has', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    write(site, `${SECTIONS}/alpha/definition.ts`, '')
    const { code, text } = await exec(['add', '--list', '--cwd', site], registryDir)
    expect(code).toBe(0)
    expect(text).toMatch(/\* alpha {5}The Alpha section\./)
    expect(text).toMatch(/ {2}beta-two {2}The Beta two section\./)
  })

  it('copies a section and what it needs, lists it in the generated files and records the lock', async () => {
    const template = makeTemplate()
    const { registry, registryDir } = build(template)
    const site = makeSite()
    const { code, text } = await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    expect(code).toBe(0)
    expect(text).toContain('create    src/components/sections/alpha/Alpha.astro')
    expect(fs.readFileSync(path.join(site, `${SECTIONS}/alpha/Alpha.astro`), 'utf8')).toBe(
      fs.readFileSync(path.join(template, `${SECTIONS}/alpha/Alpha.astro`), 'utf8'),
    )
    expect(fs.readFileSync(path.join(site, `${SECTIONS}/definitions.gen.ts`), 'utf8')).toContain(
      "import { alpha } from './alpha/definition'",
    )
    expect(fs.readFileSync(path.join(site, `${SECTIONS}/definitions.ts`), 'utf8')).toContain('customised')
    const lock = readLock(site, 'default')
    expect(lock.files['src/lib/cn.ts']).toEqual({ version: '1.8.0', hash: registry.files['src/lib/cn.ts']?.hash })
    expect(Object.keys(lock.files)).toEqual([...Object.keys(lock.files)].sort())
    expect(text).toContain('Install them: npm install zod@^4.0.0')
  })

  it('writes nothing with --dry-run', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const { code, text } = await exec(['add', 'alpha', '--dry-run', '--cwd', site], registryDir)
    expect(code).toBe(0)
    expect(text).toContain('Dry run: nothing was written.')
    expect(fs.existsSync(path.join(site, `${SECTIONS}/alpha`))).toBe(false)
    expect(fs.existsSync(path.join(site, LOCK_FILE))).toBe(false)
  })

  it('takes the directory name or the section type, and several sections at once', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    expect((await exec(['add', 'alpha', 'betaTwo', '--yes', '--cwd', site], registryDir)).code).toBe(0)
    expect(fs.existsSync(path.join(site, `${SECTIONS}/beta-two/BetaTwo.astro`))).toBe(true)
    expect(fs.readFileSync(path.join(site, `${SECTIONS}/components.gen.ts`), 'utf8')).toContain('betaTwo: BetaTwo')
  })

  it('says a section is already there when every file matches', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    const { code, text } = await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    expect(code).toBe(0)
    expect(text).toContain('already in this site, and every file matches this release')
  })

  it('stops on a file the owner changed, writes nothing, and shows the difference with --diff', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    write(site, 'src/lib/cn.ts', 'my own cn\n')
    const stopped = await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    expect(stopped.code).toBe(1)
    expect(stopped.text).toContain('conflict  src/lib/cn.ts  (you changed it)')
    expect(stopped.text).toContain('Nothing was written.')
    expect(fs.existsSync(path.join(site, `${SECTIONS}/alpha`))).toBe(false)
    expect(fs.readFileSync(path.join(site, 'src/lib/cn.ts'), 'utf8')).toBe('my own cn\n')
    const diff = await exec(['add', 'alpha', '--diff', '--cwd', site], registryDir)
    expect(diff.text).toContain('my own cn')
  })

  it('replaces changed files with --overwrite', async () => {
    const template = makeTemplate()
    const { registryDir } = build(template)
    const site = makeSite()
    write(site, 'src/lib/cn.ts', 'my own cn\n')
    expect((await exec(['add', 'alpha', '--yes', '--overwrite', '--cwd', site], registryDir)).code).toBe(0)
    expect(fs.readFileSync(path.join(site, 'src/lib/cn.ts'), 'utf8')).toBe(fs.readFileSync(path.join(template, 'src/lib/cn.ts'), 'utf8'))
  })

  it('replaces a shared file of an earlier release that nobody changed', async () => {
    const template = makeTemplate()
    const earlier = "---\nimport { cn } from '../../lib/cn'\n---\n<p>older atom</p>\n"
    const { registryDir } = build(template, { '1.7.0': { 'src/components/atoms/Atom.astro': hashContent('a.astro', earlier) } })
    const site = makeSite()
    write(site, 'src/components/atoms/Atom.astro', earlier)
    const { code, text } = await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    expect(code).toBe(0)
    expect(text).toContain('update    src/components/atoms/Atom.astro  (an earlier release that you did not change)')
    expect(text).toContain('Shared files that you did not change are replaced')
    expect(fs.readFileSync(path.join(site, 'src/components/atoms/Atom.astro'), 'utf8')).toContain("cn('a')")
  })

  it('asks before writing, and writes nothing when the answer is no', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const no = vi.fn(async () => false)
    expect((await exec(['add', 'alpha', '--cwd', site], registryDir, { confirm: no })).code).toBe(1)
    expect(no).toHaveBeenCalledWith(expect.stringMatching(/^Write \d+ files\?$/))
    expect(fs.existsSync(path.join(site, `${SECTIONS}/alpha`))).toBe(false)
    const yes = vi.fn(async () => true)
    expect((await exec(['add', 'alpha', '--cwd', site], registryDir, { confirm: yes })).code).toBe(0)
    expect(fs.existsSync(path.join(site, `${SECTIONS}/alpha/Alpha.astro`))).toBe(true)
  })

  it('does not write without --yes when there is nobody to ask', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const { code, text } = await exec(['add', 'alpha', '--cwd', site], registryDir)
    expect(code).toBe(1)
    expect(text).toContain('pass --yes to write, or --dry-run to look first')
    expect(fs.existsSync(path.join(site, `${SECTIONS}/alpha`))).toBe(false)
  })

  it('prints one JSON document with --json', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const { code, text } = await exec(['add', 'alpha', '--json', '--yes', '--cwd', site], registryDir)
    expect(code).toBe(0)
    const result = JSON.parse(text)
    expect(result).toMatchObject({ ok: true, version: '1.8.0', sections: ['alpha'], npm: { zod: '^4.0.0' }, installed: null })
    expect(result.written).toContain(`${SECTIONS}/alpha/Alpha.astro`)
    expect(result.files.find((file: { path: string }) => file.path === 'src/lib/cn.ts')).toEqual({
      path: 'src/lib/cn.ts',
      action: 'create',
    })
    const refused = await exec(['add', 'beta-two', '--json', '--cwd', site], registryDir)
    expect(refused.code).toBe(1)
    expect(JSON.parse(refused.text)).toMatchObject({ ok: false })
  })

  it('installs the missing packages with --install, and fails when the install does', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    write(site, 'pnpm-lock.yaml', '')
    const calls: string[][] = []
    const fake = (command: string, args: string[]) => {
      calls.push([command, ...args])
      return 0
    }
    expect((await exec(['add', 'alpha', '--yes', '--install', '--cwd', site], registryDir, { exec: fake })).code).toBe(0)
    expect(calls).toEqual([['pnpm', 'add', 'zod@^4.0.0']])

    const other = makeSite()
    const failing = await exec(['add', 'alpha', '--yes', '--install', '--cwd', other], registryDir, { exec: () => 1 })
    expect(failing.code).toBe(1)
    expect(failing.text).toContain('Installing failed. Run it yourself: npm install zod@^4.0.0')
  })

  it('refuses an unknown section, no names, and a site that lists its sections by hand', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const unknown = await exec(['add', 'nope', '--yes', '--cwd', site], registryDir)
    expect(unknown.code).toBe(1)
    expect(unknown.text).toContain('There is no section called "nope". The sections are: alpha, beta-two.')
    expect((await exec(['add', '--cwd', site], registryDir)).code).toBe(2)
    fs.rmSync(path.join(site, `${SECTIONS}/definitions.gen.ts`))
    const legacy = await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    expect(legacy.code).toBe(1)
    expect(legacy.text).toContain('lists its sections by hand')
  })

  it('says so when the package has no registry', async () => {
    const out: string[] = []
    expect(await run(['add', 'alpha', '--cwd', makeSite()], { log: (line) => out.push(line) })).toBe(1)
    expect(out.join('\n')).toContain('has no registry')
  })
})

describe('uncommitted changes', () => {
  it('names the files it would replace that git shows as changed, and not the ones it creates', async () => {
    const template = makeTemplate()
    const earlier = "---\nimport { cn } from '../../lib/cn'\n---\n<p>older atom</p>\n"
    const { registryDir } = build(template, { '1.7.0': { 'src/components/atoms/Atom.astro': hashContent('a.astro', earlier) } })
    const site = makeSite()
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: site, stdio: 'ignore' })
    git('init', '-q')
    git('add', '.')
    git('commit', '-q', '-m', 'start')
    write(site, 'src/components/atoms/Atom.astro', earlier)
    const { text } = await exec(['add', 'alpha', '--dry-run', '--cwd', site], registryDir)
    expect(text).toContain('Uncommitted changes in src/components/atoms/Atom.astro will be overwritten.')
  })

  it('says nothing about files it creates', async () => {
    const { registryDir } = build(makeTemplate())
    const site = makeSite()
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: site, stdio: 'ignore' })
    git('init', '-q')
    git('add', '.')
    git('commit', '-q', '-m', 'start')
    const { text } = await exec(['add', 'alpha', '--dry-run', '--cwd', site], registryDir)
    expect(text).not.toContain('Uncommitted changes')
  })
})

describe('bearminion status', () => {
  const atom = 'src/components/atoms/Atom.astro'

  it('tells current, outdated, edited and conflict apart, and says what to run', async () => {
    const template = makeTemplate()
    const current = fs.readFileSync(path.join(template, atom), 'utf8')
    const earlier = `${current}<!-- earlier -->\n`
    const { registry, registryDir } = build(template, { '1.7.0': { [atom]: hashContent('x.astro', earlier) } })
    const site = makeSite()
    await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    // the owner edits cn.ts, which the release has not changed since: "edited"
    write(site, 'src/lib/cn.ts', 'mine\n')
    // an earlier release's atom, untouched: "outdated"
    write(site, atom, earlier)
    const { code, text } = await exec(['status', '--cwd', site], registryDir)
    expect(code).toBe(0)
    expect(text).toMatch(/\* alpha {2}.*1 outdated.*1 edited/)
    expect(text).toMatch(/ {2}beta-two {2}not in this site/)
    expect(text).toContain('Bring up to date: npx bearminion add alpha')
    const json = JSON.parse((await exec(['status', '--json', '--cwd', site], registryDir)).text)
    const states = Object.fromEntries(json.files.map((file: { path: string; state: string }) => [file.path, file.state]))
    expect(states[atom]).toBe('outdated')
    expect(states['src/lib/cn.ts']).toBe('edited')
    expect(json.updatable).toEqual(['alpha'])
    // writes nothing
    expect(fs.readFileSync(path.join(site, 'src/lib/cn.ts'), 'utf8')).toBe('mine\n')
    expect(registry.version).toBe('1.8.0')
  })

  it('reports a conflict, and offers no update for it', async () => {
    const template = makeTemplate()
    const { registryDir } = build(template)
    const site = makeSite()
    await exec(['add', 'alpha', '--yes', '--cwd', site], registryDir)
    write(site, atom, 'mine\n')
    // the release moves on: a new registry whose atom differs from the lock
    write(template, atom, `${fs.readFileSync(path.join(template, atom), 'utf8')}<!-- next -->\n`)
    const next = build(template)
    const { text } = await exec(['status', '--cwd', site], next.registryDir)
    expect(text).toContain(`${atom}: conflict`)
    expect(text).toContain('Nothing to update.')
  })

  it('uses the lock to update a file that no recorded release has', async () => {
    const template = makeTemplate()
    const first = build(template)
    const site = makeSite()
    await exec(['add', 'alpha', '--yes', '--cwd', site], first.registryDir)
    write(template, atom, `${fs.readFileSync(path.join(template, atom), 'utf8')}<!-- next -->\n`)
    const next = build(template)
    expect((await exec(['status', '--cwd', site], next.registryDir)).text).toContain('Bring up to date: npx bearminion add alpha')
    const added = await exec(['add', 'alpha', '--yes', '--cwd', site], next.registryDir)
    expect(added.code).toBe(0)
    expect(added.text).toContain(`update    ${atom}`)
    expect(fs.readFileSync(path.join(site, atom), 'utf8')).toContain('<!-- next -->')
  })
})

describe('bearminion add form', () => {
  const siteWith = (files: Record<string, string> = {}) => {
    const site = makeSite()
    for (const [file, content] of Object.entries(files)) write(site, file, content)
    return site
  }

  it('lists the service, and the hosts with which ones have not been tried on a real deploy', async () => {
    const { registryDir } = build(makeTemplate())
    const { code, text } = await exec(['add', 'form', '--list'], registryDir)
    expect(code).toBe(0)
    expect(text).toContain('resend')
    expect(text).toContain('vercel')
    expect(text).toMatch(/cloudflare .*, worker\.ts \+ wrangler\.jsonc(\n|$)/)
    expect(text).toMatch(/vercel .*, api\/contact.ts\n/)
    expect(text).toMatch(/netlify .*, netlify\/functions\/contact.mts\n/)
    for (const untried of ['formspree', 'web3forms', 'postmark', 'slack']) expect(text).not.toContain(untried)
  })

  it('writes the handler and the glue, names the three environment variables, and records both in the lock', async () => {
    const { registryDir } = build(makeTemplate())
    const site = siteWith()
    const { code, text } = await exec(['add', 'form', 'resend', '--host', 'vercel', '--yes', '--cwd', site], registryDir)
    expect(code).toBe(0)
    expect(fs.readFileSync(path.join(site, 'src/forms/contact.ts'), 'utf8')).toContain("from 'bearminion/forms'")
    expect(fs.readFileSync(path.join(site, 'api/contact.ts'), 'utf8')).toContain("from '../src/forms/contact.js'")
    expect(Object.keys(readLock(site, 'default').files)).toEqual(['api/contact.ts', 'src/forms/contact.ts'])
    expect(text).toContain('RESEND_API_KEY')
    expect(text).toContain('CONTACT_FROM')
    expect(text).toContain('CONTACT_TO')
    const again = await exec(['add', 'form', 'resend', '--host', 'vercel', '--yes', '--cwd', site], registryDir)
    expect(again.code).toBe(0)
    expect(again.text).toContain('every file matches the recipe')
  })

  it('finds the host from the project, says when its glue has not been tried, and writes only the handler for a host it has no glue for', async () => {
    const { registryDir } = build(makeTemplate())
    const vercel = siteWith({ 'vercel.json': '{}' })
    await exec(['add', 'form', 'resend', '--yes', '--cwd', vercel], registryDir)
    expect(fs.existsSync(path.join(vercel, 'api/contact.ts'))).toBe(true)
    const netlify = siteWith({ 'netlify.toml': '' })
    const { text } = await exec(['add', 'form', 'resend', '--yes', '--cwd', netlify], registryDir)
    expect(fs.existsSync(path.join(netlify, 'src/forms/contact.ts'))).toBe(true)
    expect(fs.readFileSync(path.join(netlify, 'netlify/functions/contact.mts'), 'utf8')).toContain("from '../../src/forms/contact.js'")
    expect(text).not.toContain('netlify glue has not been tried')
    const cloudflare = siteWith({ 'wrangler.toml': '' })
    const cloudflareRun = await exec(['add', 'form', 'resend', '--yes', '--cwd', cloudflare], registryDir)
    expect(fs.readFileSync(path.join(cloudflare, 'worker.ts'), 'utf8')).toContain("from './src/forms/contact.js'")
    expect(fs.readFileSync(path.join(cloudflare, 'wrangler.toml'), 'utf8')).toBe('')
    expect(fs.existsSync(path.join(cloudflare, 'wrangler.jsonc'))).toBe(false)
    expect(cloudflareRun.text).toContain('already has a Wrangler config')
    const fresh = siteWith()
    await exec(['add', 'form', 'resend', '--host', 'cloudflare', '--yes', '--cwd', fresh], registryDir)
    expect(fs.readFileSync(path.join(fresh, 'wrangler.jsonc'), 'utf8')).toContain('"main": "./worker.ts"')
    const astro = siteWith({ 'package.json': JSON.stringify({ dependencies: { '@astrojs/node': '9.0.0' } }) })
    const astroRun = await exec(['add', 'form', 'resend', '--yes', '--cwd', astro], registryDir)
    expect(fs.existsSync(path.join(astro, 'src/forms/contact.ts'))).toBe(true)
    expect(astroRun.text).toContain('deploys to astro')
    const bare = siteWith()
    expect((await exec(['add', 'form', 'resend', '--yes', '--cwd', bare], registryDir)).text).toContain('No host found')
    const two = siteWith({ 'netlify.toml': '', 'vercel.json': '{}' })
    await exec(['add', 'form', 'resend', '--yes', '--cwd', two], registryDir)
    expect(fs.existsSync(path.join(two, 'api'))).toBe(false)
    expect(fs.existsSync(path.join(two, 'netlify'))).toBe(false)
  })

  it('stops on a handler the owner wrote, and replaces it only with --overwrite', async () => {
    const { registryDir } = build(makeTemplate())
    const site = siteWith({ 'src/forms/contact.ts': 'mine\n' })
    const stopped = await exec(['add', 'form', 'resend', '--host', 'vercel', '--yes', '--cwd', site], registryDir)
    expect(stopped.code).toBe(1)
    expect(fs.readFileSync(path.join(site, 'src/forms/contact.ts'), 'utf8')).toBe('mine\n')
    expect(fs.existsSync(path.join(site, 'api/contact.ts'))).toBe(false)
    const replaced = await exec(['add', 'form', 'resend', '--host', 'vercel', '--overwrite', '--yes', '--cwd', site], registryDir)
    expect(replaced.code).toBe(0)
    expect(fs.readFileSync(path.join(site, 'src/forms/contact.ts'), 'utf8')).toContain('RESEND_API_KEY')
  })

  it('refuses an unknown service or host, and a call that names neither', async () => {
    const { registryDir } = build(makeTemplate())
    const site = siteWith()
    expect((await exec(['add', 'form', 'slack', '--cwd', site], registryDir)).code).toBe(1)
    expect((await exec(['add', 'form', 'resend', '--host', 'render', '--cwd', site], registryDir)).code).toBe(1)
    expect((await exec(['add', 'form', '--cwd', site], registryDir)).code).toBe(2)
  })

  it('writes nothing with --dry-run and reports JSON', async () => {
    const { registryDir } = build(makeTemplate())
    const site = siteWith()
    const { code, text } = await exec(['add', 'form', 'resend', '--host', 'vercel', '--dry-run', '--json', '--cwd', site], registryDir)
    expect(code).toBe(0)
    const report = JSON.parse(text)
    expect(report.files).toEqual([
      { path: 'src/forms/contact.ts', action: 'create' },
      { path: 'api/contact.ts', action: 'create' },
    ])
    expect(report.env).toEqual(['RESEND_API_KEY', 'CONTACT_FROM', 'CONTACT_TO'])
    expect(fs.existsSync(path.join(site, 'src/forms'))).toBe(false)
  })
})
