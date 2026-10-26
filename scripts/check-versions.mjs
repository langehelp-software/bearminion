// Fails when the sites and docs name a bearminion version the pull request does not release.
//
//   node scripts/check-versions.mjs
//
// `bearminion` and `create-bearminion` are one fixed changesets group, so there is one version. The hero badge on
// bearminion.com shows the version the pull request releases: the version in the repo plus the highest bump among the
// pending changesets (minor on 1.6.0 is "BearMinion 1.7"). A release pull request has no pending changesets and the new
// version in package.json, so the same rule holds there. Everywhere else, prose avoids version numbers ("latest").
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ORDER = ['patch', 'minor', 'major']
const PACKAGES = new Set(['bearminion', 'create-bearminion'])

/** The bump a changeset asks for the package group: `major`, `minor`, `patch`, or `null` when it names neither package. */
export function bumpOf(changeset) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(changeset)?.[1] ?? ''
  let found = null
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = /^\s*['"]?([^'":\s]+)['"]?\s*:\s*(major|minor|patch)\s*$/.exec(line)
    if (!match || !PACKAGES.has(match[1])) continue
    if (found === null || ORDER.indexOf(match[2]) > ORDER.indexOf(found)) found = match[2]
  }
  return found
}

/** The version a release with these bumps produces from `current` (`1.6.0` and `['minor', 'patch']` give `1.7.0`). */
export function nextVersion(current, bumps) {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(current)
  if (!parts) throw new Error(`"${current}" is not a version.`)
  let [major, minor, patch] = parts.slice(1).map(Number)
  const top = bumps.reduce((best, bump) => (ORDER.indexOf(bump) > ORDER.indexOf(best) ? bump : best), 'none')
  if (top === 'major') [major, minor, patch] = [major + 1, 0, 0]
  else if (top === 'minor') [minor, patch] = [minor + 1, 0]
  else if (top === 'patch') patch += 1
  return `${major}.${minor}.${patch}`
}

/** The badge shows major and minor only: "BearMinion 1.7". */
export const badgeFor = (version) => `BearMinion ${version.split('.').slice(0, 2).join('.')}`

/** The text of the badge in the home page's content, such as "BearMinion 1.7 · Available now", or `null`. */
export function badgeTag(indexJson) {
  const match = /"tag":\s*"(BearMinion v?\d+\.\d+[^"]*)"/.exec(indexJson)
  return match ? match[1] : null
}

/** A `BearMinion 1.7` that is not the badge, or `bearminion@1`, `create-bearminion@latest`-style pins with a number. */
const STALE = /BearMinion v?\d+\.\d+|(?:create-)?bearminion@v?\d/g

/** Version strings in `text`, other than `allowed`. */
export function staleStrings(text, allowed = []) {
  let rest = text
  for (const item of allowed) rest = rest.split(item).join('')
  return [...rest.matchAll(STALE)].map((match) => match[0])
}

function walk(dir, extensions, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) walk(file, extensions, out)
    else if (extensions.some((extension) => name.endsWith(extension))) out.push(file)
  }
  return out
}

/** Every problem found in the repository at `root`, as lines to print. Empty means the versions agree. */
export function check(root) {
  const read = (file) => readFileSync(path.join(root, file), 'utf8')
  const current = JSON.parse(read('packages/editor/package.json')).version
  const dir = path.join(root, '.changeset')
  const bumps = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => bumpOf(readFileSync(path.join(dir, name), 'utf8')))
        .filter((bump) => bump !== null)
    : []
  const next = nextVersion(current, bumps)
  const expected = badgeFor(next)
  const problems = []

  const indexFile = 'apps/web/content/pages/index.json'
  const tag = badgeTag(read(indexFile))
  if (tag === null) problems.push(`${indexFile}: no "BearMinion X.Y" badge found.`)
  else if (!tag.startsWith(expected) || /^\d/.test(tag.slice(expected.length))) {
    problems.push(
      `${indexFile}: the badge says "${tag}" but this pull request releases ${next} (repo ${current}${bumps.length ? `, pending ${[...new Set(bumps)].join(' + ')}` : ', nothing pending'}). Expected "${expected}".`,
    )
  }

  const files = [
    ...walk(path.join(root, 'docs'), ['.md']),
    ...walk(path.join(root, 'apps/docs/src'), ['.md', '.mdx', '.astro', '.ts', '.json']),
    ...walk(path.join(root, 'apps/web/content'), ['.json']),
    ...['README.md', 'CONTRIBUTING.md', 'apps/web/README.md', 'templates/default/README.md'].map((file) => path.join(root, file)),
    ...walk(path.join(root, 'packages'), ['README.md']).filter((file) => !file.includes(`${path.sep}template${path.sep}`)),
  ].filter((file) => existsSync(file))
  for (const file of files) {
    const found = staleStrings(readFileSync(file, 'utf8'), tag ? [tag] : [])
    for (const text of new Set(found)) {
      problems.push(
        `${path.relative(root, file)}: "${text}". Prose says "latest" instead of a version; only the home page badge carries one.`,
      )
    }
  }
  return problems
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const problems = check(root)
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('The badge and the docs agree with the version this pull request releases.')
}
