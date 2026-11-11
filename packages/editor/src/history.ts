import { readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomic } from './atomic-write.js'
import type { EditorContext } from './editor-context.js'
import { type HistoryEntry, type HistoryPort, type HistoryScope, historyId, isHistoryId } from './history-types.js'
import { stableStringify } from './stable-json.js'

/**
 * Local copies of what was saved, in `<project>/.editor/history/`, so an earlier version of a page or of the
 * site can be loaded back into the draft. Dev-only and untracked: the folder belongs in `.gitignore`.
 */

export const HISTORY_DIR = '.editor/history'
export const HISTORY_KEEP = 50

export { historyId, isHistoryId }
export type { HistoryEntry, HistoryPort, HistoryScope }

function idToIso(id: string): string {
  return `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}.${id.slice(15, 18)}Z`
}

function directory(context: EditorContext, scope: HistoryScope, slug: string): string {
  return scope === 'site' ? path.join(context.root, HISTORY_DIR, 'site') : path.join(context.root, HISTORY_DIR, 'pages', slug)
}

async function ids(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((name) => name.endsWith('.json') && isHistoryId(name.slice(0, -5)))
      .map((name) => name.slice(0, -5))
      .sort()
  } catch {
    return []
  }
}

/** Newest first. */
export async function listHistory(context: EditorContext, scope: HistoryScope, slug = ''): Promise<HistoryEntry[]> {
  return (await ids(directory(context, scope, slug))).reverse().map((id) => ({ id, at: idToIso(id) }))
}

export async function readHistory(context: EditorContext, scope: HistoryScope, slug: string, id: string): Promise<unknown | null> {
  if (!isHistoryId(id)) return null
  try {
    return JSON.parse(await readFile(path.join(directory(context, scope, slug), `${id}.json`), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Keep a copy of `value`. A value equal to the newest copy is skipped, and only the newest {@link HISTORY_KEEP}
 * copies stay. Returns the new entry, or null when nothing was written. Never throws: history must not block a save.
 */
export async function writeHistory(
  context: EditorContext,
  scope: HistoryScope,
  slug: string,
  value: unknown,
  now: Date = new Date(),
): Promise<HistoryEntry | null> {
  try {
    const dir = directory(context, scope, slug)
    const existing = await ids(dir)
    const newest = existing[existing.length - 1]
    if (newest !== undefined) {
      const text = await readFile(path.join(dir, `${newest}.json`), 'utf8')
      if (text === stableStringify(value)) return null
    }
    let id = historyId(now)
    // Two saves in the same millisecond must not overwrite each other.
    while (existing.includes(id)) id = historyId(new Date(Date.parse(idToIso(id)) + 1))
    await writeJsonAtomic(path.join(dir, `${id}.json`), value)
    for (const old of [...existing, id].slice(0, -HISTORY_KEEP)) {
      await rm(path.join(dir, `${old}.json`), { force: true })
    }
    return { id, at: idToIso(id) }
  } catch {
    return null
  }
}

/** Before the first save of a page or the site, keep the file as it was so even that first save can be undone. */
export async function ensureBaseline(context: EditorContext, scope: HistoryScope, slug: string, current: unknown): Promise<void> {
  if ((await listHistory(context, scope, slug)).length > 0) return
  await writeHistory(context, scope, slug, current, new Date(Date.now() - 1))
}

/** The undo history of the local project, in `.editor/history/`. */
export function fileHistory(context: EditorContext): HistoryPort {
  return {
    list: (scope, slug) => listHistory(context, scope, slug),
    read: (scope, slug, id) => readHistory(context, scope, slug, id),
    async write(scope, slug, value) {
      await writeHistory(context, scope, slug, value)
    },
    ensureBaseline: (scope, slug, current) => ensureBaseline(context, scope, slug, current),
  }
}
