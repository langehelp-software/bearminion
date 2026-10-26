import { parseArgs } from 'node:util'
import path from 'node:path'
import { SectionsError, staleSectionsMessage, syncSections } from './sections-manifest.js'

const DEFAULT_SECTIONS_DIR = 'src/components/sections'

const HELP = `The bearminion command line.

Usage
  npx bearminion sync [options]

Commands
  sync              Rewrite sections/definitions.gen.ts and components.gen.ts from the section directories

Options
  --check           Write nothing; exit 1 when the generated files are stale
  --sections <dir>  The sections folder (default: ${DEFAULT_SECTIONS_DIR})
  --cwd <dir>       Run as if started in this folder
  -h, --help        Show this help
`

/** Runs the command line and returns the exit code. */
export function run(argv: readonly string[], log: (line: string) => void = console.log): number {
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
  if (command !== 'sync' || rest.length > 0) {
    log(`I do not know "${positionals.join(' ')}". Run \`npx bearminion --help\` for the commands.`)
    return 2
  }
  const root = path.resolve(values.cwd ?? process.cwd())
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

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      check: { type: 'boolean', default: false },
      sections: { type: 'string' },
      cwd: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
}
