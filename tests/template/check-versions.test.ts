import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { badgeFor, badgeTag, bumpOf, check, nextVersion, staleStrings } from '../../scripts/check-versions.mjs'

describe('bumpOf', () => {
  it('reads the bump for either package of the fixed group, and the highest one', () => {
    expect(bumpOf("---\n'bearminion': minor\n'create-bearminion': minor\n---\n\nText.")).toBe('minor')
    expect(bumpOf("---\n'create-bearminion': patch\n---\n")).toBe('patch')
    expect(bumpOf('---\nbearminion: patch\n"create-bearminion": major\n---\n')).toBe('major')
  })

  it('ignores other packages and text without frontmatter', () => {
    expect(bumpOf("---\n'@bearminion/web': minor\n---\n")).toBeNull()
    expect(bumpOf('No frontmatter: minor')).toBeNull()
  })
})

describe('nextVersion and badgeFor', () => {
  it('applies the highest bump', () => {
    expect(nextVersion('1.6.0', [])).toBe('1.6.0')
    expect(nextVersion('1.6.0', ['patch'])).toBe('1.6.1')
    expect(nextVersion('1.6.0', ['patch', 'minor', 'patch'])).toBe('1.7.0')
    expect(nextVersion('1.6.3', ['major', 'minor'])).toBe('2.0.0')
    expect(() => nextVersion('latest', [])).toThrow(/not a version/)
  })

  it('shows major and minor only', () => {
    expect(badgeFor('1.7.0')).toBe('BearMinion 1.7')
    expect(badgeFor('1.6.1')).toBe('BearMinion 1.6')
  })
})

describe('staleStrings', () => {
  it('finds version strings in prose and leaves the allowed badge alone', () => {
    const text = 'Install bearminion@1.4 or create-bearminion@2. BearMinion 1.5 added it. BearMinion 1.7 · Available now.'
    expect(staleStrings(text, ['BearMinion 1.7 · Available now'])).toEqual(['bearminion@1', 'create-bearminion@2', 'BearMinion 1.5'])
  })

  it('does not mind "latest", plain names, or dependency ranges', () => {
    expect(staleStrings('npm create bearminion@latest and "bearminion": "^1.6.0" and BearMinion is great')).toEqual([])
  })

  it('reads the badge from the home page content', () => {
    expect(badgeTag('{ "badge": { "tag": "BearMinion 1.7 · Available now", "text": "x" } }')).toBe('BearMinion 1.7 · Available now')
    expect(badgeTag('{}')).toBeNull()
  })
})

describe('check', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  function repo(options: { version?: string; badge?: string; changesets?: string[]; doc?: string }): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-versions-'))
    roots.push(root)
    const write = (file: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), text)
    }
    write('packages/editor/package.json', JSON.stringify({ version: options.version ?? '1.6.0' }))
    write('apps/web/content/pages/index.json', `{ "tag": "${options.badge ?? 'BearMinion 1.7 · Available now'}" }`)
    write('docs/forms.md', options.doc ?? 'Run `npm create bearminion@latest`.')
    write('README.md', 'BearMinion is a CMS.')
    write('.changeset/README.md', '# Changesets')
    for (const [index, text] of (options.changesets ?? ["---\n'bearminion': minor\n---\n\nA feature."]).entries()) {
      write(`.changeset/c${index}.md`, text)
    }
    return root
  }

  it('passes when the badge shows the version the pull request releases', () => {
    expect(check(repo({}))).toEqual([])
  })

  it('passes on a release pull request: the new version, nothing pending', () => {
    expect(check(repo({ version: '1.7.0', changesets: [] }))).toEqual([])
  })

  it('keeps the same badge for a patch release', () => {
    expect(check(repo({ badge: 'BearMinion 1.6', changesets: ["---\n'bearminion': patch\n---\n"] }))).toEqual([])
  })

  it('fails when the badge is the previous version', () => {
    const problems = check(repo({ badge: 'BearMinion 1.6 · Available now' }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Expected "BearMinion 1.7"')
    expect(problems[0]).toContain('pending minor')
  })

  it('does not take BearMinion 1.70 for 1.7', () => {
    expect(check(repo({ badge: 'BearMinion 1.70' }))).toHaveLength(1)
  })

  it('fails on a version number in prose', () => {
    const problems = check(repo({ doc: 'Needs bearminion@1.4 or newer.' }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('docs/forms.md')
    expect(problems[0]).toContain('bearminion@1')
  })
})
