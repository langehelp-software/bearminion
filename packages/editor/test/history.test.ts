import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultTheme } from '../src/theme.js'
import { HISTORY_KEEP, ensureBaseline, historyId, isHistoryId, listHistory, readHistory, writeHistory } from '../src/history.js'
import type { EditorContext } from '../src/options.js'
import { createMigrator } from '../src/migrate.js'
import { createFileStore } from '../src/store.js'
import { siteDefinition } from './starter.js'

let root = ''
let context: EditorContext

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-history-'))
  context = {
    root,
    contentDir: root,
    uploadsDir: root,
    sections: {},
    site: siteDefinition,
    store: createFileStore({ root, contentDir: root, uploadsDir: root }),
    migrator: createMigrator(),
    theme: defaultTheme,
    git: false,
  }
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('history', () => {
  it('formats ids that sort by time', () => {
    const id = historyId(new Date('2026-10-13T12:55:30.123Z'))
    expect(id).toBe('20261013T125530123Z')
    expect(isHistoryId(id)).toBe(true)
    expect(isHistoryId('../etc')).toBe(false)
  })

  it('keeps a baseline once and skips an unchanged save', async () => {
    await ensureBaseline(context, 'page', 'index', { v: 0 })
    await ensureBaseline(context, 'page', 'index', { v: 99 })
    expect(await listHistory(context, 'page', 'index')).toHaveLength(1)
    expect(await writeHistory(context, 'page', 'index', { v: 0 })).toBeNull()
  })

  it('lists newest first and reads a version back', async () => {
    await ensureBaseline(context, 'site', '', { name: 'A' })
    const entry = await writeHistory(context, 'site', '', { name: 'B' })
    expect(entry).not.toBeNull()
    const list = await listHistory(context, 'site')
    expect(list[0]?.id).toBe(entry?.id)
    expect(await readHistory(context, 'site', '', list[0]?.id ?? '')).toEqual({ name: 'B' })
    expect(await readHistory(context, 'site', '', list[1]?.id ?? '')).toEqual({ name: 'A' })
  })

  it('keeps only the newest copies and refuses a bad id', async () => {
    for (let i = 0; i <= HISTORY_KEEP + 4; i += 1) await writeHistory(context, 'page', 'index', { v: i })
    const list = await listHistory(context, 'page', 'index')
    expect(list).toHaveLength(HISTORY_KEEP)
    expect(await readHistory(context, 'page', 'index', list[0]?.id ?? '')).toEqual({ v: HISTORY_KEEP + 4 })
    expect(await readHistory(context, 'page', 'index', '../site')).toBeNull()
  })
})
