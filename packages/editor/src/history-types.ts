import type { HistoryEntry } from './api-types.js'

/*
 * Undo history as the editor API sees it: ids and the port a store of old versions plugs into. Pure, so the API can
 * run where there is no file system. `history.ts` keeps the copies in `.editor/history/` on disk.
 */

export type HistoryScope = 'page' | 'site'

export type { HistoryEntry }

const ID = /^\d{8}T\d{9}Z$/

export function isHistoryId(value: string): boolean {
  return ID.test(value)
}

/** `2026-10-13T12:55:30.123Z` → `20261013T125530123Z`. */
export function historyId(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '')
}

/** Local copies of what was saved, so an earlier version can be loaded back into the draft. */
export interface HistoryPort {
  /** Newest first. */
  list(scope: HistoryScope, slug?: string): Promise<HistoryEntry[]>
  read(scope: HistoryScope, slug: string, id: string): Promise<unknown | null>
  /** Never throws: history must not block a save. */
  write(scope: HistoryScope, slug: string, value: unknown): Promise<void>
  /** Before the first save of a page or the site, keep the file as it was so even that first save can be undone. */
  ensureBaseline(scope: HistoryScope, slug: string, current: unknown): Promise<void>
}

/** The port of a context with none (a hosted editor, where the repository is the history): nothing is kept. */
export const NO_HISTORY: HistoryPort = {
  async list() {
    return []
  },
  async read() {
    return null
  },
  async write() {},
  async ensureBaseline() {},
}
