import { useState } from 'preact/hooks'
import { commit as commitChanges } from '../api-client.js'
import type { GitState } from '../types.js'
import { DialogClose } from './dialog.js'

const GIT_MARK: Record<GitState['files'][number]['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
}

/** Commit saved content and upload files to the local git repository. Never pushes. */
export function CommitDialog({
  info,
  unsaved,
  onDone,
  onClose,
}: {
  info: GitState
  unsaved: boolean
  onDone: () => void
  onClose: () => void
}) {
  const [message, setMessage] = useState('')
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ commit: string; files: number } | null>(null)
  const paths = info.files.map((file) => file.path).filter((path) => !skipped.has(path))
  const ready = !busy && message.trim() !== '' && paths.length > 0 && done === null

  function toggle(path: string) {
    setSkipped((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function commit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    const result = await commitChanges({ message: message.trim(), paths })
    setBusy(false)
    if (!result.ok) {
      setError(result.status === 0 ? 'The commit failed.' : result.message)
      return
    }
    setDone(result.value)
    onDone()
  }

  return (
    <div
      class="bm-dialog bm-changes"
      role="dialog"
      aria-modal="true"
      aria-label="Commit changes"
      style="top:12%;left:50%;transform:translateX(-50%);"
    >
      <div class="bm-dialog-head">
        <h2 class="bm-dialog-title">Commit changes{info.branch ? ` · ${info.branch}` : ''}</h2>
        <DialogClose onClose={onClose} />
      </div>
      {done ? (
        <p class="bm-note" role="status">
          Committed {done.files} {done.files === 1 ? 'file' : 'files'} as {done.commit}. Nothing was pushed.
        </p>
      ) : (
        <>
          {info.files.length === 0 ? (
            <p class="bm-note">No saved changes under the content or uploads folders.</p>
          ) : (
            <ul class="bm-commit-files" aria-label="Files to commit">
              {info.files.map((file) => (
                <li key={file.path}>
                  <label>
                    <input type="checkbox" checked={!skipped.has(file.path)} onChange={() => toggle(file.path)} />
                    <span class="bm-commit-mark" aria-hidden="true">
                      {GIT_MARK[file.status]}
                    </span>
                    <span class="bm-change-field">{file.path}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <textarea
            class="bm-commit-msg"
            aria-label="Commit message"
            placeholder="Commit message"
            rows={3}
            maxLength={1000}
            value={message}
            onInput={(event) => setMessage(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void commit()
              }
            }}
          />
          {unsaved && <p class="bm-hint">You have unsaved edits. Only saved files are committed.</p>}
          {error && (
            <p class="bm-error" role="alert">
              {error}
            </p>
          )}
          <p class="bm-hint">Commits locally only. Nothing is pushed.</p>
        </>
      )}
      <div class="bm-actions">
        {done ? (
          <button type="button" class="bm-primary" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button type="button" class="bm-primary" disabled={!ready} onClick={() => void commit()}>
              {busy ? 'Committing…' : 'Commit'}
            </button>
            <button type="button" class="bm-tertiary" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
