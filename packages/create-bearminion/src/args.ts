import { parseArgs } from 'node:util'
import { isPackageManager, PACKAGE_MANAGERS, type PackageManager } from './package-manager.js'

export interface CliOptions {
  directory?: string
  name?: string
  url?: string
  packageManager?: PackageManager
  install: boolean
  git: boolean
  storybook: boolean
  yes: boolean
  help: boolean
  version: boolean
}

export class UsageError extends Error {}

export const HELP = `Create a BearMinion site: an Astro website you edit by clicking on it.

Usage
  npm create bearminion@latest [directory] -- [options]

Options
  --name <name>     Site name (default: from the directory)
  --url <address>   Public address, such as https://example.com (you can set it later in the editor)
  --storybook       Include Storybook, a workshop for the theme's components
  --pm <manager>    Package manager to install with: ${PACKAGE_MANAGERS.join(', ')} (default: the one you ran)
  --no-install      Do not install dependencies
  --no-git          Do not create a git repository
  -y, --yes         Ask nothing; use the defaults for anything not given
  -h, --help        Show this help
  -v, --version     Show the version
`

/** Parses the arguments after the command. Unknown options and a bad `--pm` throw `UsageError`. */
export function parseCliArgs(argv: string[]): CliOptions {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
  const { values, positionals } = parsed
  if (positionals.length > 1) throw new UsageError(`Expected one directory, got ${positionals.length}: ${positionals.join(' ')}`)
  const pm = values.pm
  if (pm !== undefined && !isPackageManager(pm)) {
    throw new UsageError(`Unknown package manager "${pm}". Use one of: ${PACKAGE_MANAGERS.join(', ')}.`)
  }
  return {
    ...(positionals[0] !== undefined ? { directory: positionals[0] } : {}),
    ...(values.name !== undefined ? { name: values.name } : {}),
    ...(values.url !== undefined ? { url: values.url } : {}),
    ...(pm !== undefined ? { packageManager: pm } : {}),
    install: values.install,
    git: values.git,
    storybook: values.storybook,
    yes: values.yes,
    help: values.help,
    version: values.version,
  }
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    strict: true,
    options: {
      name: { type: 'string' },
      url: { type: 'string' },
      pm: { type: 'string' },
      install: { type: 'boolean', default: true },
      git: { type: 'boolean', default: true },
      storybook: { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })
}
