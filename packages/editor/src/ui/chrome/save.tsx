import { Icon } from '../icons.js'
import { POPOVER_TRIGGER } from '../shell/popover.js'

export type SaveStage = 'idle' | 'saving' | 'reloading'

const STAGE_LABEL: Record<SaveStage, string> = { idle: 'Save', saving: 'Saving…', reloading: 'Reloading…' }

/** Save, with ⌘S. Disabled while there is nothing to save, and while a save is written and the page reloads. */
export function SaveButton({ onSave, dirty, stage = 'idle' }: { onSave: () => void; dirty: boolean; stage?: SaveStage }) {
  const busy = stage !== 'idle'
  return (
    <button type="button" class="bm-save" aria-keyshortcuts="Control+S Meta+S" aria-busy={busy} disabled={busy || !dirty} onClick={onSave}>
      {/* All three faces share one grid cell, so the button is as wide as the widest and never jumps. */}
      <span class="bm-faces">
        <span class="bm-face" hidden-face={busy ? '' : undefined}>
          Save
          <kbd aria-hidden="true">⌘S</kbd>
        </span>
        {(['saving', 'reloading'] as const).map((name) => (
          <span key={name} class="bm-face" hidden-face={stage === name ? undefined : ''}>
            <span class="bm-spin" aria-hidden="true" />
            {STAGE_LABEL[name]}
          </span>
        ))}
      </span>
    </button>
  )
}

/** "Saved", or "Unsaved · N changes", which opens the list of them. */
export function SavePill({ dirty, changes, open, onReview }: { dirty: boolean; changes: number; open: boolean; onReview: () => void }) {
  const dot = <span class="bm-dot" aria-hidden="true" />
  if (!dirty) {
    return (
      <span class="bm-pill">
        {dot}
        Saved
      </span>
    )
  }
  const count = changes > 0 ? ` · ${changes} ${changes === 1 ? 'change' : 'changes'}` : ''
  return (
    <button
      type="button"
      class="bm-pill bm-pill-dirty bm-pill-btn"
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Review unsaved changes"
      onClick={onReview}
      {...{ [POPOVER_TRIGGER]: '' }}
    >
      {dot}
      Unsaved{count}
    </button>
  )
}

/** Commit what is saved but not committed, when the site runs with git. */
export function CommitButton({ files, onCommit }: { files: number; onCommit: () => void }) {
  return (
    <button
      type="button"
      class="bm-topbar-btn bm-topbar-commit"
      aria-label={`Commit changes (${files} ${files === 1 ? 'file' : 'files'})`}
      title="Commit changes…"
      disabled={files === 0}
      onClick={onCommit}
    >
      <Icon name="git-commit" size={18} />
      {files > 0 && <span class="bm-topbar-badge">{files}</span>}
    </button>
  )
}
