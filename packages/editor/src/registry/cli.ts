#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { currentHashes, readRegistry, writeRegistry } from './build.js'
import { recordFiles } from '../add/lock.js'
import { hashesFromNpm, readHistory, recordRelease, releaseMatches } from './history.js'

/**
 * The maintainers' tool, not part of `bearminion`'s public surface. Run from the repository after a build:
 *
 *   node packages/editor/dist/registry-build.js build            (the package build does this)
 *   node packages/editor/dist/registry-build.js record           (release: add this release to registry-history.json)
 *   node packages/editor/dist/registry-build.js record --from-npm 1.8.0   (a release that was published without it)
 *   node packages/editor/dist/registry-build.js check            (publish: fails when the release is not recorded)
 *   node packages/editor/dist/registry-build.js lock --template <dir> --out <file>   (create-bearminion: the lock a new site starts with)
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { template: { type: 'string' }, out: { type: 'string' }, history: { type: 'string' }, 'from-npm': { type: 'string' } },
})
const templateDir = path.resolve(packageRoot, values.template ?? '../../templates/default')
const historyFile = path.resolve(packageRoot, values.history ?? 'registry-history.json')
const outDir = path.resolve(packageRoot, values.out ?? 'registry/default')
const { version } = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { version: string }
const registry = () => readRegistry({ templateDir, version, history: readHistory(historyFile) })

const command = positionals[0]
if (command === 'build') {
  const built = registry()
  writeRegistry(built, templateDir, outDir)
  console.log(`registry: ${Object.keys(built.items).length} sections, ${Object.keys(built.files).length} files`)
} else if (command === 'record') {
  const fromNpm = values['from-npm']
  const hashes = fromNpm ? hashesFromNpm(fromNpm, Object.keys(registry().files)) : currentHashes(registry())
  const target = fromNpm ?? version
  console.log(
    recordRelease(historyFile, target, hashes) ? `registry history: recorded ${target}` : `registry history: ${target} already recorded`,
  )
} else if (command === 'check') {
  if (!releaseMatches(historyFile, version, currentHashes(registry()))) {
    console.error(
      `registry-history.json has no entry for ${version} that matches the template. Run \`node packages/editor/dist/registry-build.js record\`.`,
    )
    process.exitCode = 1
  }
} else if (command === 'lock') {
  if (!values.out) throw new Error('lock needs --out <file>.')
  const built = registry()
  const lock = recordFiles({ schemaVersion: 1, template: built.template, files: {} }, built, Object.keys(built.files))
  const lockFile = path.resolve(values.out)
  fs.mkdirSync(path.dirname(lockFile), { recursive: true })
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`registry: lock for ${Object.keys(lock.files).length} files`)
} else {
  console.error('Usage: registry-build <build|record|check|lock> [--template dir] [--out dir] [--history file] [--from-npm version]')
  process.exitCode = 2
}
