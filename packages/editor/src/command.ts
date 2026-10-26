import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { applyPlan, SECTIONS_PATH } from './add/apply.js'
import { formatCommand, detectPackageManager, installCommand, runInstall, type Exec } from './add/packages.js'
import { readLock } from './add/lock.js'
import { isPresent, planAdd, writesFile, type FileAction, type Plan } from './add/plan.js'
import { statusOf, type FileState } from './add/status.js'
import { REGISTRY_SCHEMA_VERSION, type Registry, type RegistryItem } from './registry/types.js'
import { SectionsError, staleSectionsMessage, syncSections } from './sections-manifest.js'

const DEFAULT_SECTIONS_DIR = 'src/components/sections'

const HELP = `The bearminion command line.

Usage
  npx bearminion add <section...> [options]
  npx bearminion add --list
  npx bearminion status [--json]
  npx bearminion sync [options]

Commands
  add               Copy sections into this site, with the files they need
  status            Show which sections are in this site and whether their files match this release
  sync              Rewrite sections/definitions.gen.ts and components.gen.ts from the section directories

Options for add
  --list            List the sections that can be added
  --dry-run         Show what would be written, and write nothing
  -y, --yes         Do not ask before writing
  --overwrite       Replace files you changed (git keeps your version)
  --diff            Show how your changed files differ from this release
  --install         Install the npm packages the sections need
  --json            Print one JSON document instead of text (needs --yes or --dry-run)

Options for sync
  --check           Write nothing; exit 1 when the generated files are stale
  --sections <dir>  The sections folder (default: ${DEFAULT_SECTIONS_DIR})

Options for both
  --cwd <dir>       Run as if started in this folder
  -h, --help        Show this help
`

/** What the command line needs from its surroundings, so tests can stand in for them. */
export interface Io {
  log: (line: string) => void
  /** Asks a yes or no question. Absent when there is no terminal to ask on. */
  confirm?: (question: string) => Promise<boolean>
  /** The folder with `registry.json` and `files/`, next to the installed package. */
  registryDir?: string
  exec: Exec
}

/** Runs the command line and returns the exit code. */
export async function run(argv: readonly string[], io: Partial<Io> = {}): Promise<number> {
  const surroundings: Io = { log: console.log, exec: runInstall, ...io }
  const log = surroundings.log
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    log(error instanceof Error ? error.message : String(error))
    log('Run `npx bearminion --help` for the options.')
    return 2
  }
  const { values, positionals } = parsed
  const [command, ...rest] = positionals
  if (values.help || command === undefined) {
    log(HELP)
    return command === undefined && !values.help ? 2 : 0
  }
  const root = path.resolve(values.cwd ?? process.cwd())
  if (command === 'sync' && rest.length === 0) return runSync(root, values, log)
  if (command === 'add') return runAdd(root, rest, values, surroundings)
  if (command === 'status' && rest.length === 0) return runStatus(root, values, surroundings)
  log(`I do not know "${positionals.join(' ')}". Run \`npx bearminion --help\` for the commands.`)
  return 2
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      check: { type: 'boolean', default: false },
      sections: { type: 'string' },
      cwd: { type: 'string' },
      list: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      overwrite: { type: 'boolean', default: false },
      diff: { type: 'boolean', default: false },
      install: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
}

type Values = ReturnType<typeof parse>['values']

function runSync(root: string, values: Values, log: (line: string) => void): number {
  const sectionsDir = path.resolve(root, values.sections ?? DEFAULT_SECTIONS_DIR)
  try {
    const { changed, entries } = syncSections(sectionsDir, { check: values.check === true })
    if (values.check) {
      if (changed.length > 0) {
        log(staleSectionsMessage(changed))
        return 1
      }
      log(`${entries.length} sections, generated files up to date.`)
      return 0
    }
    log(
      changed.length > 0 ? `Wrote ${changed.join(' and ')} (${entries.length} sections).` : `Already in sync (${entries.length} sections).`,
    )
    return 0
  } catch (error) {
    if (!(error instanceof SectionsError)) throw error
    log(error.message)
    return 1
  }
}

function loadRegistry(registryDir: string | undefined): { registry: Registry; dir: string } {
  if (registryDir === undefined) throw new Error('This copy of bearminion has no registry. Reinstall the package.')
  const file = path.join(registryDir, 'registry.json')
  if (!fs.existsSync(file)) throw new Error(`No registry at ${registryDir}. Reinstall the package.`)
  const registry = JSON.parse(fs.readFileSync(file, 'utf8')) as Registry
  if (registry.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new Error(`The registry is version ${registry.schemaVersion}, and this command reads version ${REGISTRY_SCHEMA_VERSION}.`)
  }
  return { registry, dir: registryDir }
}

/** The item for a name given on the command line: the directory (`logo-strip`) or the section type (`logoStrip`). */
function findItem(registry: Registry, name: string): RegistryItem | undefined {
  return registry.items[name] ?? Object.values(registry.items).find((item) => item.type === name)
}

const LABELS: Record<FileAction, string> = {
  create: 'create',
  same: 'same',
  update: 'update',
  conflict: 'conflict',
  overwrite: 'overwrite',
}

const NOTES: Partial<Record<FileAction, string>> = {
  update: 'an earlier release that you did not change',
  conflict: 'you changed it',
  overwrite: 'you changed it',
}

function diffAgainstRelease(root: string, registryDir: string, file: string): string {
  const result = spawnSync(
    'git',
    ['diff', '--no-index', '--no-color', '--', path.join(root, file), path.join(registryDir, 'files', file)],
    { encoding: 'utf8' },
  )
  return result.error ? '(git is not available to show the difference)' : result.stdout.trimEnd()
}

async function runAdd(root: string, names: string[], values: Values, io: Io): Promise<number> {
  const { log } = io
  const json = values.json === true
  const fail = (message: string, code = 1, extra: Record<string, unknown> = {}) => {
    log(json ? JSON.stringify({ ok: false, error: message, ...extra }, null, 2) : message)
    return code
  }
  let loaded: ReturnType<typeof loadRegistry>
  try {
    loaded = loadRegistry(io.registryDir)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  const { registry, dir: registryDir } = loaded
  const sectionsDir = path.join(root, SECTIONS_PATH)

  if (values.list) {
    const rows = Object.values(registry.items).map((item) => ({
      name: item.dir,
      type: item.type,
      label: item.label,
      description: item.description,
      added: fs.existsSync(path.join(sectionsDir, item.dir, 'definition.ts')),
    }))
    if (json) log(JSON.stringify({ ok: true, version: registry.version, sections: rows }, null, 2))
    else {
      const width = Math.max(...rows.map((row) => row.name.length))
      for (const row of rows) log(`${row.added ? '*' : ' '} ${row.name.padEnd(width)}  ${row.description}`)
      log('')
      log('* is already in this site. Add one with `npx bearminion add <name>`.')
    }
    return 0
  }
  if (names.length === 0)
    return fail('Name the sections to add, or use --list to see them. For example: npx bearminion add gallery text', 2)

  if (!fs.existsSync(path.join(sectionsDir, 'definitions.gen.ts'))) {
    return fail(
      `This site has no ${SECTIONS_PATH}/definitions.gen.ts, so it lists its sections by hand and \`add\` cannot register a new one. ` +
        'Sites made with bearminion 1.8 and later have it. To move this site over, see "Add a section type" in the template README.',
    )
  }
  const items: RegistryItem[] = []
  for (const name of names) {
    const item = findItem(registry, name)
    if (item === undefined) {
      return fail(`There is no section called "${name}". The sections are: ${Object.keys(registry.items).join(', ')}.`, 1, {
        available: Object.keys(registry.items),
      })
    }
    if (!items.includes(item)) items.push(item)
  }

  let plan: Plan
  try {
    plan = planAdd(root, registry, items, { overwrite: values.overwrite, lock: readLock(root, registry.template) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  const conflicts = plan.files.filter((file) => file.action === 'conflict')
  const changes = plan.files.filter((file) => file.action !== 'same')
  const installPlan = Object.keys(plan.npm).length > 0 ? installCommand(detectPackageManager(root), plan.npm) : undefined
  const report = (extra: Record<string, unknown>) =>
    JSON.stringify(
      {
        ok: conflicts.length === 0,
        version: registry.version,
        sections: plan.sections.map((section) => section.dir),
        files: plan.files.map(({ path: file, action }) => ({ path: file, action })),
        npm: plan.npm,
        dirty: plan.dirty,
        ...extra,
      },
      null,
      2,
    )

  if (!json) {
    log(
      `${values['dry-run'] ? 'Would add' : 'Adding'} ${plan.sections.map((section) => section.dir).join(', ')} (bearminion ${registry.version})`,
    )
    log('')
    for (const file of changes) {
      const note = NOTES[file.action]
      log(`  ${LABELS[file.action].padEnd(9)} ${file.path}${note ? `  (${note})` : ''}`)
    }
    const same = plan.files.length - changes.length
    if (same > 0) log(`  ${same} file${same === 1 ? '' : 's'} already match this release.`)
    log('')
  }

  if (isPresent(plan)) {
    log(
      json
        ? report({ written: [] })
        : `${plan.sections.map((section) => section.dir).join(', ')} already in this site, and every file matches this release.`,
    )
    return 0
  }

  if (conflicts.length > 0) {
    if (values.diff && !json) {
      for (const file of conflicts) {
        log(diffAgainstRelease(root, registryDir, file.path))
        log('')
      }
    }
    if (json) log(report({ error: 'Some files differ from this release and were changed by you.', written: [] }))
    else {
      log(
        `${conflicts.length} file${conflicts.length === 1 ? '' : 's'} differ${conflicts.length === 1 ? 's' : ''} from this release because you changed ${conflicts.length === 1 ? 'it' : 'them'}. Nothing was written.`,
      )
      log('Use --diff to see how, or --overwrite to replace them with this release. Commit first: git keeps your version.')
    }
    return 1
  }

  if (!json && plan.files.some((file) => file.action === 'update')) {
    log('Shared files that you did not change are replaced by this release. Other sections use them: read the diff and run your build.')
  }
  if (!json && plan.dirty.length > 0) log(`Uncommitted changes in ${plan.dirty.join(', ')} will be overwritten.`)

  if (values['dry-run']) {
    log(json ? report({ dryRun: true, written: [] }) : 'Dry run: nothing was written.')
    return 0
  }

  if (!values.yes) {
    if (json || io.confirm === undefined) {
      return fail('Not asking in here: pass --yes to write, or --dry-run to look first.', 1, { files: plan.files })
    }
    const count = plan.files.filter((file) => writesFile(file.action)).length
    if (!(await io.confirm(`Write ${count} file${count === 1 ? '' : 's'}?`))) {
      log('Nothing was written.')
      return 1
    }
  }

  let written: string[]
  try {
    written = applyPlan(root, registryDir, registry, plan)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  let installed: 'done' | 'failed' | undefined
  if (installPlan && values.install) installed = io.exec(installPlan.command, installPlan.args, root) === 0 ? 'done' : 'failed'

  if (json) log(report({ written, installed: installed ?? null }))
  else {
    log(
      `Wrote ${written.length} file${written.length === 1 ? '' : 's'}, listed them in definitions.gen.ts and components.gen.ts, and noted them in bearminion.lock.json.`,
    )
    if (installPlan && installed === undefined)
      log(`The sections import packages this site does not list. Install them: ${formatCommand(installPlan)}`)
    if (installed === 'failed') log(`Installing failed. Run it yourself: ${formatCommand(installPlan as NonNullable<typeof installPlan>)}`)
  }
  return installed === 'failed' ? 1 : 0
}

const STATE_TEXT: Record<FileState, string> = {
  current: 'current',
  outdated: 'outdated (you did not change it; `add` replaces it)',
  edited: 'edited by you (nothing to do)',
  conflict: 'conflict (you and the release both changed it; `add` stops)',
  differs: "differs (not this release's, and no lock says why; `add` stops)",
  missing: 'missing',
}

function runStatus(root: string, values: Values, io: Io): number {
  const { log } = io
  const json = values.json === true
  const fail = (message: string) => {
    log(json ? JSON.stringify({ ok: false, error: message }, null, 2) : message)
    return 1
  }
  let loaded: ReturnType<typeof loadRegistry>
  try {
    loaded = loadRegistry(io.registryDir)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  const { registry } = loaded
  let status: ReturnType<typeof statusOf>
  try {
    status = statusOf(root, registry, readLock(root, registry.template), SECTIONS_PATH)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  if (json) {
    log(JSON.stringify({ ok: true, ...status }, null, 2))
    return 0
  }
  log(`This release has ${status.sections.length} sections.`)
  const width = Math.max(...status.sections.map((section) => section.dir.length))
  for (const section of status.sections) {
    const detail = section.added
      ? Object.entries(section.counts)
          .filter(([state]) => state !== 'current')
          .map(([state, count]) => `${count} ${state}`)
          .join(', ') || 'current'
      : 'not in this site'
    log(`${section.added ? '*' : ' '} ${section.dir.padEnd(width)}  ${detail}`)
  }
  if (status.files.length > 0) {
    log('')
    for (const file of status.files) log(`${file.path}: ${STATE_TEXT[file.state]} (${file.sections.join(', ')})`)
  }
  log('')
  if (status.updatable.length > 0) log(`Bring up to date: npx bearminion add ${status.updatable.join(' ')}`)
  else log('Nothing to update.')
  return 0
}
