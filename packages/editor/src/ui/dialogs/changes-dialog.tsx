import { useRef } from 'preact/hooks'
import { type ChangeEntry, groupChanges } from '../../changes.js'
import { useDialogFocus, DialogClose } from './dialog.js'

const CHANGE_MARK: Record<ChangeEntry['kind'], string> = { added: '+', removed: '−', changed: '~' }

/** "Hero · #intro › heading": the area names the section, so only the Page, Sections and Site groups skip it. */
function changePath(item: ChangeEntry, scope: 'page' | 'site'): string {
  if (scope === 'page' && (item.area === 'Page' || item.area === 'Sections')) return item.field
  if (scope === 'site' && item.area === 'Site') return item.field
  return `${item.area} › ${item.field}`
}

/** One change: kind badge, field path, then the old value struck through over the new one. */
export function ChangeRow({ item, scope }: { item: ChangeEntry; scope: 'page' | 'site' }) {
  return (
    <li class={`bm-change bm-change-${item.kind}`}>
      <span class="bm-change-mark" aria-hidden="true">
        {CHANGE_MARK[item.kind]}
      </span>
      <div class="bm-change-body">
        <span class="bm-change-field">{changePath(item, scope)}</span>
        {(item.before !== undefined || item.after !== undefined) && (
          <span class="bm-change-values">
            {item.before !== undefined && (
              <del>
                <span>{item.before}</span>
              </del>
            )}
            {item.after !== undefined && (
              <ins>
                <span>{item.after}</span>
              </ins>
            )}
          </span>
        )}
      </div>
    </li>
  )
}

/** Everything that differs from the saved files, grouped by file: the page file, then the site file split by area. */
export function ChangesDialog({
  files,
  onSave,
  onDiscard,
  onClose,
}: {
  files: { file: string; scope: 'page' | 'site'; entries: ChangeEntry[] }[]
  onSave: () => void
  onDiscard: () => void
  onClose: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root)
  type Group = { title: string; file: string; scope: 'page' | 'site'; entries: ChangeEntry[] }
  const groups = files.flatMap(({ file, scope, entries }): Group[] =>
    scope === 'page'
      ? entries.length > 0
        ? [{ title: 'Page', file, scope, entries }]
        : []
      : groupChanges(entries).map((group) => ({ title: group.area, file, scope, entries: group.entries })),
  )
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  const fileCount = files.filter((item) => item.entries.length > 0).length
  return (
    <div
      class="bm-dialog bm-changes"
      role="dialog"
      aria-modal="true"
      aria-label="Unsaved changes"
      ref={root}
      style="top:12%;left:50%;transform:translateX(-50%);"
    >
      <div class="bm-dialog-head">
        <div class="bm-dialog-heading">
          <h2 class="bm-dialog-title">Unsaved changes</h2>
          {total > 0 && (
            <p class="bm-dialog-sub">
              {total} {total === 1 ? 'change' : 'changes'} in {fileCount} {fileCount === 1 ? 'file' : 'files'}.
            </p>
          )}
        </div>
        <DialogClose onClose={onClose} />
      </div>
      {groups.length === 0 ? (
        <p class="bm-note">The draft differs from the saved files, but no field-level change could be listed.</p>
      ) : (
        <div class="bm-changes-list">
          {groups.map((group) => (
            <section class="bm-changes-group" key={`${group.scope}:${group.title}`} aria-label={group.title}>
              <h3 class="bm-changes-area">
                {group.title}
                <span class="bm-changes-file">{group.file}</span>
                <span class="bm-changes-count">{group.entries.length}</span>
              </h3>
              <ul>
                {group.entries.map((item) => (
                  <ChangeRow key={`${item.field}:${item.kind}`} item={item} scope={group.scope} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div class="bm-dialog-foot">
        <p class="bm-hint">Nothing is written until you save.</p>
        <div class="bm-actions">
          <button type="button" class="bm-primary" aria-label="Save" onClick={onSave}>
            Save
            <kbd aria-hidden="true">⌘S</kbd>
          </button>
          <button type="button" class="bm-tertiary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" class="bm-tertiary bm-danger" style="margin-right:auto;" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
