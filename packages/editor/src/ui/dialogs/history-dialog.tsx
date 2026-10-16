import { useRef, useState, useEffect } from 'preact/hooks'
import { type ChangeEntry, describePageChanges, describeSiteChanges, groupChanges } from '../../changes.js'
import type { PageDraft } from '../../draft.js'
import { getHistoryVersion, listHistory } from '../api-client.js'
import { Segmented } from '../forms/segmented.js'
import { Icon } from '../icons.js'
import { Info } from '../info.js'
import type { VersionEntry } from '../types.js'
import { ChangeRow } from './changes-dialog.js'
import { useDialogFocus, DialogClose } from './dialog.js'

function formatVersionTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const VERSION_CAP = 50

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Today / Yesterday / "12 Mar" (with the year when it is not this one). */
function versionDay(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

function versionClock(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** "just now", "2 min ago", "3 h ago"; older than a day shows only the clock time. */
function versionAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.max(0, Math.round((now - then) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : versionClock(iso)
}

/** "title, hero › heading +2": the first changed fields of one save, for the collapsed row. */
function versionSummary(list: ChangeEntry[] | undefined): string {
  if (!list || list.length === 0) return ''
  const names = [...new Set(list.map((item) => item.field))]
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

/**
 * Saved versions of this page and of the site, newest first and grouped by day. A version shows what that save changed,
 * and Restore loads it into the draft. Nothing is written until the next save, and the restore can be undone from here.
 */
export function HistoryDialog({
  slug,
  labels,
  page,
  onRestore,
  onUndo,
  onClose,
}: {
  slug: string
  labels: Record<string, string>
  page: PageDraft
  onRestore: (scope: 'page' | 'site', data: unknown, when: string) => void
  onUndo: () => void
  onClose: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root)
  const [scope, setScope] = useState<'page' | 'site'>('page')
  const [entries, setEntries] = useState<VersionEntry[] | null>(null)
  const [diffs, setDiffs] = useState<Record<string, ChangeEntry[]>>({})
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [restored, setRestored] = useState<string | null>(null)
  const base = `${scope}:${slug}`

  useEffect(() => {
    let live = true
    setEntries(null)
    setDiffs({})
    setOpenId(null)
    setRestored(null)
    setFailed(false)
    const load = async () => {
      const listed = await listHistory(scope, slug)
      if (!listed.ok) throw new Error(listed.message)
      const body = listed.value
      if (!live) return
      setEntries(body.entries)
      // Each version is shown as what that save changed: the save before it against it.
      const data = await Promise.all(
        body.entries.map(async (entry) => {
          const version = await getHistoryVersion(scope, slug, entry.id)
          return version.ok ? version.value : null
        }),
      )
      if (!live) return
      const next: Record<string, ChangeEntry[]> = {}
      body.entries.forEach((entry, index) => {
        const after = data[index]
        const before = data[index + 1]
        if (after === null || before === null || before === undefined) return
        next[entry.id] = scope === 'page' ? describePageChanges(before, after, labels) : describeSiteChanges(before, after)
      })
      setDiffs(next)
    }
    load().catch(() => live && setFailed(true))
    return () => {
      live = false
    }
    // `labels` is a stable catalog lookup; refetching on its identity would reload the list needlessly.
  }, [base])

  async function restore(entry: VersionEntry) {
    const version = await getHistoryVersion(scope, slug, entry.id)
    if (!version.ok) {
      setFailed(true)
      return
    }
    const when = formatVersionTime(entry.at)
    onRestore(scope, version.value, when)
    setRestored(when)
  }

  const days: { day: string; items: { entry: VersionEntry; index: number }[] }[] = []
  entries?.forEach((entry, index) => {
    const day = versionDay(entry.at)
    const last = days[days.length - 1]
    if (last && last.day === day) last.items.push({ entry, index })
    else days.push({ day, items: [{ entry, index }] })
  })

  return (
    <div
      class="bm-dialog bm-changes"
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      ref={root}
      style="top:12%;left:50%;transform:translateX(-50%);"
    >
      <div class="bm-dialog-head">
        <div class="bm-dialog-heading">
          <h2 class="bm-dialog-title">
            Version history
            <Info
              label="Where versions are kept"
              text={
                <>
                  Versions are kept only on this computer, in <code>.editor/history</code>. They are not in git and not on the published
                  site. The newest {VERSION_CAP} stay. To clear them, stop the dev server and delete the <code>.editor</code> folder in your
                  project root.
                </>
              }
            />
          </h2>
          <p class="bm-dialog-sub">Every save is kept. Restore loads a version into the draft; nothing is written until you save.</p>
        </div>
        <DialogClose onClose={onClose} />
      </div>
      <Segmented
        hideLabel
        label="Scope"
        value={scope}
        options={[
          { value: 'page', label: `Page "${page.title}"` },
          { value: 'site', label: 'Site' },
        ]}
        onChange={(value) => setScope(value === 'site' ? 'site' : 'page')}
      />
      {restored !== null && (
        <div class="bm-restored" role="status">
          <span>Restored the version from {restored} into the draft.</span>
          <button
            type="button"
            class="bm-tertiary"
            onClick={() => {
              onUndo()
              setRestored(null)
            }}
          >
            Undo
          </button>
        </div>
      )}
      <div class="bm-changes-list">
        {failed && <p class="bm-error">Could not load the saved versions.</p>}
        {!failed && entries === null && <p class="bm-note">Loading…</p>}
        {entries !== null && entries.length === 0 && <p class="bm-note">Nothing saved yet. Every save keeps a copy here, newest first.</p>}
        {days.map((group) => (
          <section class="bm-day" key={group.day} aria-label={group.day}>
            <h3 class="bm-changes-area">{group.day}</h3>
            <ul class="bm-versions">
              {group.items.map(({ entry, index }) => {
                const isOpen = openId === entry.id
                const list = diffs[entry.id]
                const stamp = formatVersionTime(entry.at)
                const earliest = index === (entries?.length ?? 0) - 1
                return (
                  <li key={entry.id} class="bm-version">
                    <div class="bm-version-row">
                      <button
                        type="button"
                        class="bm-icon-btn"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} what changed in the version from ${stamp}`}
                        onClick={() => setOpenId(isOpen ? null : entry.id)}
                      >
                        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
                      </button>
                      <button type="button" class="bm-tertiary bm-version-when" onClick={() => setOpenId(isOpen ? null : entry.id)}>
                        <span class="bm-version-line">
                          <span class="bm-version-rel">{versionAgo(entry.at) || stamp}</span>
                          <span class="bm-version-abs">{versionClock(entry.at)}</span>
                        </span>
                        {versionSummary(list) && <span class="bm-version-sum">{versionSummary(list)}</span>}
                      </button>
                      {index === 0 ? (
                        <span class="bm-badge bm-badge-on">current</span>
                      ) : (
                        <button
                          type="button"
                          class="bm-restore"
                          aria-label={`Restore the version from ${stamp}`}
                          onClick={() => void restore(entry)}
                        >
                          <Icon name="rotate-ccw" size={14} />
                          Restore
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <div class="bm-version-diff">
                        {!list || list.length === 0 ? (
                          <p class="bm-note">
                            {earliest
                              ? 'The earliest kept version, so there is nothing older to compare with.'
                              : list
                                ? 'No difference from the save before it.'
                                : 'Loading…'}
                          </p>
                        ) : (
                          groupChanges(list).map((area) => (
                            <section key={area.area} aria-label={area.area}>
                              <h3 class="bm-changes-area">{area.area}</h3>
                              <ul>
                                {area.entries.map((item) => (
                                  <ChangeRow key={`${item.field}:${item.kind}`} item={item} scope={scope} />
                                ))}
                              </ul>
                            </section>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      {entries !== null && entries.length > 0 && (
        <div class="bm-dialog-foot">
          <p class="bm-hint">
            {entries.length} of {VERSION_CAP} kept on this computer. Older versions drop off.
          </p>
        </div>
      )}
    </div>
  )
}
