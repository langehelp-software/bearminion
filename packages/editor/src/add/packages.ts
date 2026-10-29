import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

const LOCKFILES: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

/** The package manager the site uses, by its lock file. npm when there is none. */
export function detectPackageManager(root: string): PackageManager {
  for (const [file, manager] of LOCKFILES) if (fs.existsSync(path.join(root, file))) return manager
  return 'npm'
}

const DEV_FLAG: Record<PackageManager, string> = { npm: '-D', pnpm: '-D', yarn: '-D', bun: '-d' }

/** The command that installs `packages` (name to range), as dev dependencies when `dev` is set. */
export function installCommand(
  manager: PackageManager,
  packages: Record<string, string>,
  options: { dev?: boolean } = {},
): { command: string; args: string[] } {
  const specs = Object.entries(packages).map(([name, range]) => `${name}@${range}`)
  const verb = manager === 'npm' ? 'install' : 'add'
  return { command: manager, args: [verb, ...(options.dev ? [DEV_FLAG[manager]] : []), ...specs] }
}

export const formatCommand = ({ command, args }: { command: string; args: string[] }) => [command, ...args].join(' ')

/** The packages `wanted` that the site's `package.json` lists in neither `dependencies` nor `devDependencies`. */
export function missingPackages(root: string, wanted: Record<string, string>): Record<string, string> {
  const file = path.join(root, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const have = { ...pkg.devDependencies, ...pkg.dependencies }
  return Object.fromEntries(Object.entries(wanted).filter(([name]) => have[name] === undefined))
}

export type Exec = (command: string, args: string[], cwd: string) => number

export const runInstall: Exec = (command, args, cwd) => spawnSync(command, args, { cwd, stdio: 'inherit' }).status ?? 1
