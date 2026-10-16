import { describe, expect, it } from 'vitest'
import {
  DRAFT_TTL_MS,
  assessStoredDraft,
  draftBannerText,
  hashText,
  pageDraftKey,
  pageSavedKey,
  projectId,
  isForeignSave,
  readDraftRecord,
  relativeDraftAge,
  removeDraft,
  savedNoticeFor,
  siteDraftKey,
  sweepExpiredDrafts,
  writeDraftRecord,
  writeSaveNotice,
  type DraftRecord,
  type KeyValueStorage,
} from '../src/draft-store.js'

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => {
      values.delete(key)
    },
    keys: () => [...values.keys()],
  }
}

const now = 1_700_000_000_000

function record(draft: unknown, base: string, savedAt = now): DraftRecord {
  return { draft, savedAt, baseHash: hashText(base) }
}

describe('project drafts', () => {
  it('namespaces keys by project root and site name', () => {
    const home = projectId('/work/bear', 'BearMinion')
    const otherRoot = projectId('/work/other', 'BearMinion')
    const otherName = projectId('/work/bear', 'Other')
    expect(home).not.toBe(otherRoot)
    expect(home).not.toBe(otherName)
    expect(projectId('/work/bear/', 'BearMinion')).toBe(home)
    expect(pageDraftKey(home, 'index')).toBe(`bearminion:draft:${home}:page:index`)
    expect(siteDraftKey(home)).toBe(`bearminion:draft:${home}:site`)
  })

  it('writes a draft with its base hash and reads it back', () => {
    const storage = memoryStorage()
    const key = pageDraftKey('p', 'index')
    const disk = JSON.stringify({ title: 'Saved' })
    const draft = { title: 'Edited' }
    expect(writeDraftRecord(storage, key, record(draft, disk))).toBe(true)
    expect(readDraftRecord(storage, key, now + 1000)).toEqual(record(draft, disk))
    expect(assessStoredDraft(record(draft, disk), disk)).toEqual({ offer: true, conflict: false })
  })

  it('flags a conflict when the on-disk JSON changed and skips an identical draft', () => {
    const disk = JSON.stringify({ title: 'Saved' })
    const edited = JSON.stringify({ title: 'From git' })
    const stored = record({ title: 'Edited' }, disk)
    expect(assessStoredDraft(stored, edited)).toEqual({ offer: true, conflict: true })
    expect(assessStoredDraft(record(JSON.parse(disk), disk), disk)).toEqual({ offer: false, conflict: false })
  })

  it('drops drafts older than 14 days and unreadable storage', () => {
    const storage = memoryStorage()
    const key = pageDraftKey('p', 'about')
    writeDraftRecord(storage, key, record({ title: 'Old' }, '{}', now - DRAFT_TTL_MS - 1))
    expect(readDraftRecord(storage, key, now)).toBeNull()
    expect(storage.getItem(key)).toBeNull()

    const denied: KeyValueStorage = {
      getItem: () => {
        throw new Error('disabled')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('disabled')
      },
      keys: () => {
        throw new Error('disabled')
      },
    }
    expect(readDraftRecord(denied, key, now)).toBeNull()
    expect(writeDraftRecord(denied, key, record({ title: 'Nope' }, '{}'))).toBe(false)
    expect(() => removeDraft(denied, key)).not.toThrow()
    expect(() => sweepExpiredDrafts(denied, now)).not.toThrow()
  })

  it('sweeps expired drafts and describes the banner age', () => {
    const storage = memoryStorage()
    const fresh = pageDraftKey('p', 'index')
    const stale = siteDraftKey('p')
    writeDraftRecord(storage, fresh, record({ title: 'New' }, '{}', now - 1000))
    writeDraftRecord(storage, stale, record({ name: 'Old' }, '{}', now - DRAFT_TTL_MS - 5))
    sweepExpiredDrafts(storage, now)
    expect(storage.getItem(fresh)).not.toBeNull()
    expect(storage.getItem(stale)).toBeNull()
    expect(relativeDraftAge(now, now)).toBe('just now')
    expect(relativeDraftAge(now - 60_000, now)).toBe('1 minute ago')
    expect(relativeDraftAge(now - 2 * 60 * 60_000, now)).toBe('2 hours ago')
    expect(draftBannerText(now - 3 * 24 * 60 * 60_000, now)).toBe('Unsaved changes from 3 days ago')
  })

  it('notices when another tab saved this page', () => {
    const id = projectId('/work/bear', 'BearMinion')
    const storage = memoryStorage()
    expect(writeSaveNotice(storage, pageSavedKey(id, 'index'), { savedAt: now, tabId: 'a' })).toBe(true)
    expect(isForeignSave(storage.getItem(pageSavedKey(id, 'index')), 'b', now + 1000)).toBe(true)
    expect(isForeignSave(storage.getItem(pageSavedKey(id, 'index')), 'a', now + 1000)).toBe(false)
    expect(savedNoticeFor(pageSavedKey(id, 'index'), id, 'index')).toBe('page')
    expect(savedNoticeFor(siteDraftKey(id), id, 'index')).toBeNull()
    expect(savedNoticeFor(`bearminion:draft:${id}:site:saved`, id, 'index')).toBe('site')
  })
})

describe('reloadDecision', () => {
  it('defers during a save, prompts when dirty, and reloads when clean', async () => {
    const { reloadDecision } = await import('../src/draft-store.js')
    expect(reloadDecision({ dirty: true, saveInFlight: true })).toBe('defer')
    expect(reloadDecision({ dirty: true, saveInFlight: false })).toBe('prompt')
    expect(reloadDecision({ dirty: false, saveInFlight: false })).toBe('reload')
  })
})
