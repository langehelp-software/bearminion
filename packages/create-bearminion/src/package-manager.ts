export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

export function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value)
}

/**
 * The package manager that ran `create`: `npm create`, `pnpm create`, `yarn create` and `bun create` each set
 * `npm_config_user_agent` (`pnpm/12.14.0 npm/? node/v22…`). npm when it is missing or unknown.
 */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split('/')[0]?.trim() ?? ''
  return isPackageManager(name) ? name : 'npm'
}

/** The command a person types to run a package script, as each package manager spells it. */
export function runCommand(pm: PackageManager, script: string): string {
  return pm === 'npm' || pm === 'bun' ? `${pm} run ${script}` : `${pm} ${script}`
}
