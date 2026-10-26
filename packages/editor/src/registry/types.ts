/** Bumped when the layout of `registry.json` or of the lock file changes in a way an older CLI cannot read. */
export const REGISTRY_SCHEMA_VERSION = 1

/** The lock file in a site's root. */
export const LOCK_FILE = 'bearminion.lock.json'

/** One file the registry can write into a site. */
export interface RegistryFile {
  /** Hash of the file in this release (see `hashContent`). */
  hash: string
  /** Hashes of every earlier release of it, so a file nobody edited is known even when the site has no lock. */
  history: string[]
}

/** A section type, with every file it needs: its own directory and what it imports from the rest of the template. */
export interface RegistryItem {
  /** The directory under `sections/`, in kebab-case. This is the name `bearminion add` takes. */
  dir: string
  /** The section `type` in content files: the directory name in camelCase. */
  type: string
  label: string
  description: string
  /** Paths from the site root, sorted. */
  files: string[]
  /** npm packages the files import, with the range the template asks for. */
  npm: Record<string, string>
}

/** `registry/<template>/registry.json`, built from `templates/<template>` when the package is built. */
export interface Registry {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION
  template: string
  version: string
  files: Record<string, RegistryFile>
  items: Record<string, RegistryItem>
}

/** `bearminion.lock.json`: which release each tracked file came from, and what it held then. */
export interface LockFile {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION
  template: string
  files: Record<string, { version: string; hash: string }>
}

/** `registry-history.json` in the repository: for each release, the hash of every file the registry holds. */
export type RegistryHistory = Record<string, Record<string, string>>
