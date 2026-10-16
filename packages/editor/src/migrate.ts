/** Which kind of document a migration is upgrading. */
export type DocumentKind = 'page' | 'site'

/** Upgrades one document from version N to N + 1. Return the new document; do not mutate the input. */
export type ContentMigration = (document: Record<string, unknown>, kind: DocumentKind) => Record<string, unknown>

/** How a site versions its content files. */
export interface ContentVersioning {
  /**
   * The content format version this site's schemas describe. Default 1. Raise it when a schema change
   * would reject files written before it, and add the migration that upgrades them.
   */
  schemaVersion?: number
  /** `migrations[n]` upgrades a document from version `n` to `n + 1`. Needed for every `n` below `schemaVersion`. */
  migrations?: Readonly<Record<number, ContentMigration>>
}

/** The key that stores a document's version. It is stripped on read and stamped on write; schemas never see it. */
export const SCHEMA_VERSION_KEY = 'schemaVersion'

export type UpgradeResult = { ok: true; value: unknown } | { ok: false; message: string }

export interface ContentMigrator {
  /** The version this site writes. */
  readonly version: number
  /** Upgrade a parsed file to the current version and remove its version key. Non-objects pass through for the schema to reject. */
  upgrade(raw: unknown, kind: DocumentKind): UpgradeResult
  /** The document as written to disk: its version key plus the content. */
  stamp<T extends object>(document: T): T & { schemaVersion: number }
}

export function createMigrator(versioning: ContentVersioning = {}): ContentMigrator {
  const version = versioning.schemaVersion ?? 1
  const migrations = versioning.migrations ?? {}
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`schemaVersion must be a positive integer, got ${String(version)}.`)
  }
  for (let from = 1; from < version; from++) {
    if (typeof migrations[from] !== 'function') {
      throw new Error(`schemaVersion is ${version} but migrations[${from}] (version ${from} to ${from + 1}) is missing.`)
    }
  }
  for (const key of Object.keys(migrations)) {
    const from = Number(key)
    if (!Number.isInteger(from) || from < 1 || from >= version) {
      throw new Error(`migrations[${key}] is not a step below schemaVersion ${version}.`)
    }
  }

  return {
    version,
    upgrade(raw, kind) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: true, value: raw }
      let document = raw as Record<string, unknown>
      const stored = document[SCHEMA_VERSION_KEY]
      const from = stored === undefined ? 1 : stored
      if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) {
        return { ok: false, message: `${SCHEMA_VERSION_KEY} must be a positive integer.` }
      }
      if (from > version) {
        return {
          ok: false,
          message: `Written by a newer version of this site (${SCHEMA_VERSION_KEY} ${from}; this site supports up to ${version}).`,
        }
      }
      for (let step = from; step < version; step++) {
        try {
          document = (migrations[step] as ContentMigration)(document, kind)
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          return { ok: false, message: `Migration from version ${step} to ${step + 1} failed: ${reason}` }
        }
      }
      const { [SCHEMA_VERSION_KEY]: _version, ...content } = document
      return { ok: true, value: content }
    },
    stamp: (document) => ({ ...document, [SCHEMA_VERSION_KEY]: version }),
  }
}
