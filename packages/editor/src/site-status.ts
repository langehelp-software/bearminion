import type { SectionRegistry } from './model.js'
import type { Registry } from './registry/types.js'

/*
 * Site status, for the developer: the bearminion version, the sections the site has and how they compare with this
 * release, and the ones that can be added. Pure, so a hosted editor can answer it too; the local editor adds the
 * file-by-file comparison `bearminion status` makes (`site-status-local.ts`).
 */

/**
 * - `current`: the section's files are this release's.
 * - `update`: files you never changed are older than this release. `add` brings them up to date.
 * - `edited`: you changed files, and the release has not changed them since. Nothing to do.
 * - `conflict`: you changed files the release changed too, or a file is not this release's. `add` stops on it.
 * - `custom`: a section the site defines that is not in the release.
 */
export type SectionState = 'current' | 'update' | 'edited' | 'conflict' | 'custom'

export interface StatusSection {
  /** The name `bearminion add` takes, such as `logo-strip`. */
  dir: string
  /** The section `type` in content files. */
  type: string
  label: string
  description: string
  installed: boolean
  /** How an installed section compares with this release. Absent where it cannot be told (a hosted editor). */
  state?: SectionState
}

export interface SiteStatus {
  /** The installed bearminion. */
  version: string
  /** `local` compares the site's files with the release; `hosted` only knows which sections are registered. */
  mode: 'local' | 'hosted'
  /** Installed sections first, then the release's sections the site does not have (local only). */
  sections: StatusSection[]
}

/** Per section, the states of its files as `bearminion status` counts them. */
export type FileCounts = Partial<Record<'current' | 'outdated' | 'edited' | 'conflict' | 'differs' | 'missing', number>>

export function sectionState(counts: FileCounts): SectionState {
  if ((counts.conflict ?? 0) > 0 || (counts.differs ?? 0) > 0) return 'conflict'
  if ((counts.outdated ?? 0) > 0 || (counts.missing ?? 0) > 0) return 'update'
  if ((counts.edited ?? 0) > 0) return 'edited'
  return 'current'
}

/** `logoStrip` → `logo-strip`. */
const kebab = (type: string): string => type.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/**
 * The status from the sections the site registers, enriched with the release's catalog when there is one: what each
 * installed section's files look like (`files`, by section directory) and what else can be added.
 */
export function buildSiteStatus(input: {
  version: string
  mode: 'local' | 'hosted'
  sections: SectionRegistry
  catalog?: Registry
  files?: Record<string, FileCounts>
}): SiteStatus {
  const items = Object.values(input.catalog?.items ?? {})
  const installed: StatusSection[] = Object.values(input.sections)
    .map((definition) => {
      const item = items.find((candidate) => candidate.type === definition.type)
      const counts = item ? input.files?.[item.dir] : undefined
      const state: SectionState | undefined = !input.catalog ? undefined : !item ? 'custom' : counts ? sectionState(counts) : undefined
      return {
        dir: item?.dir ?? kebab(definition.type),
        type: definition.type,
        label: definition.label,
        description: definition.description,
        installed: true,
        ...(state ? { state } : {}),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
  const have = new Set(installed.map((section) => section.type))
  const available: StatusSection[] = items
    .filter((item) => !have.has(item.type))
    .map((item) => ({ dir: item.dir, type: item.type, label: item.label, description: item.description, installed: false }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return { version: input.version, mode: input.mode, sections: [...installed, ...available] }
}

/** Whether `candidate` is a later release than `current` (`1.26.0` > `1.25.3`). Pre-releases count as older. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) => {
    const [core = '', pre] = value.split('-', 2)
    return { parts: core.split('.').map((part) => Number.parseInt(part, 10) || 0), pre: pre !== undefined }
  }
  const a = parse(candidate)
  const b = parse(current)
  for (let index = 0; index < 3; index += 1) {
    const diff = (a.parts[index] ?? 0) - (b.parts[index] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return !a.pre && b.pre
}
