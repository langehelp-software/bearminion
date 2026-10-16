import {
  assessStoredDraft,
  type DraftRecord,
  hashText,
  isForeignSave,
  type KeyValueStorage,
  localDraftStorage,
  pageDraftKey,
  pageSavedKey,
  readDraftRecord,
  removeDraft,
  siteDraftKey,
  siteSavedKey,
  sweepExpiredDrafts,
  writeDraftRecord,
  writeSaveNotice,
} from '../../draft-store.js'
import type { DraftOffer } from '../types.js'
import type { DocumentStore } from './document.js'
import type { UiState } from './ui.js'

export type DraftScope = 'page' | 'site'

const TAB_ID_KEY = 'bearminion:tab'

/** A random id for this browser tab, kept for the tab's session. Tells this tab's save notices from other tabs'. */
export function tabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY)
    if (existing) return existing
    const next = Math.random().toString(36).slice(2)
    sessionStorage.setItem(TAB_ID_KEY, next)
    return next
  } catch {
    return 'local'
  }
}

function keptDraft(
  storage: KeyValueStorage,
  key: string,
  record: DraftRecord | null,
  diskJson: string,
): (DraftRecord & { conflict: boolean }) | null {
  if (!record || !diskJson) return null
  const assessed = assessStoredDraft(record, diskJson)
  if (!assessed.offer) {
    if (key) removeDraft(storage, key)
    return null
  }
  return { ...record, conflict: assessed.conflict }
}

/**
 * Unsaved drafts kept in localStorage, so a crash or an unexpected reload loses nothing, and the notices that tell
 * other tabs a save happened. Storage that is blocked or full turns all of this off; editing and saving still work.
 */
export function createLocalDrafts(doc: DocumentStore, ui: UiState) {
  function context(): { id: string; storage: KeyValueStorage } | null {
    const id = doc.projectId.peek()
    const storage = localDraftStorage()
    return id && storage ? { id, storage } : null
  }

  function draftKey(id: string, scope: DraftScope): string {
    return scope === 'page' ? pageDraftKey(id, doc.savedSlug.peek()) : siteDraftKey(id)
  }

  function noticeKey(id: string, scope: DraftScope): string {
    return scope === 'page' ? pageSavedKey(id, doc.savedSlug.peek()) : siteSavedKey(id)
  }

  /** Write each dirty draft, and clear the stored copy of a clean one. An offer that is still up keeps its drafts. */
  function persist() {
    const ctx = context()
    if (!ctx) return
    const offerUp = ui.draftOffer.peek() !== null
    if (offerUp && !doc.dirty.peek()) return
    const now = Date.now()
    const entries = [
      { scope: 'page', draft: doc.page.peek(), dirty: doc.pageDirty.peek(), saved: doc.savedPageJson.peek() },
      { scope: 'site', draft: doc.site.peek(), dirty: doc.siteDirty.peek(), saved: doc.savedSiteJson.peek() },
    ] as const
    try {
      for (const { scope, draft, dirty, saved } of entries) {
        const key = draftKey(ctx.id, scope)
        if (draft && dirty) writeDraftRecord(ctx.storage, key, { draft, savedAt: now, baseHash: hashText(saved) })
        else if (!offerUp) removeDraft(ctx.storage, key)
      }
    } catch {
      // Quota or disabled storage. Editing and saving to disk still work.
    }
  }

  /** Drafts left from an earlier visit that still apply to what is on disk, or null. Stale ones are removed. */
  function readOffer(slug: string, savedPageJson: string, savedSiteJson: string): DraftOffer | null {
    const ctx = context()
    if (!ctx) return null
    const { id, storage } = ctx
    const now = Date.now()
    sweepExpiredDrafts(storage, now)
    const pageRecord = savedPageJson ? readDraftRecord(storage, pageDraftKey(id, slug), now) : null
    const siteRecord = savedSiteJson ? readDraftRecord(storage, siteDraftKey(id), now) : null
    const pageOffer = keptDraft(storage, pageRecord ? pageDraftKey(id, slug) : '', pageRecord, savedPageJson)
    const siteOffer = keptDraft(storage, siteRecord ? siteDraftKey(id) : '', siteRecord, savedSiteJson)
    if (!pageOffer && !siteOffer) return null
    return {
      savedAt: Math.max(pageOffer?.savedAt ?? 0, siteOffer?.savedAt ?? 0),
      page: pageOffer?.draft ?? null,
      site: siteOffer?.draft ?? null,
      conflict: pageOffer?.conflict === true || siteOffer?.conflict === true,
    }
  }

  /** Another tab saved this page or the site within the last minute. */
  function foreignSave(slug: string): boolean {
    const ctx = context()
    if (!ctx) return false
    const now = Date.now()
    const mine = tabId()
    try {
      return (
        isForeignSave(ctx.storage.getItem(pageSavedKey(ctx.id, slug)), mine, now) ||
        isForeignSave(ctx.storage.getItem(siteSavedKey(ctx.id)), mine, now)
      )
    } catch {
      return false
    }
  }

  /** The draft is on disk: drop the stored copy and tell other tabs. */
  function publishSaved(scope: DraftScope) {
    const ctx = context()
    if (!ctx) return
    removeDraft(ctx.storage, draftKey(ctx.id, scope))
    writeSaveNotice(ctx.storage, noticeKey(ctx.id, scope), { savedAt: Date.now(), tabId: tabId() })
  }

  /** The save that `publishSaved` announced failed. */
  function retractSaved(scope: DraftScope) {
    const ctx = context()
    if (!ctx) return
    removeDraft(ctx.storage, noticeKey(ctx.id, scope))
  }

  function dropStored() {
    const ctx = context()
    if (!ctx) return
    removeDraft(ctx.storage, draftKey(ctx.id, 'page'))
    removeDraft(ctx.storage, draftKey(ctx.id, 'site'))
  }

  return { persist, readOffer, foreignSave, publishSaved, retractSaved, dropStored }
}

export type LocalDrafts = ReturnType<typeof createLocalDrafts>
