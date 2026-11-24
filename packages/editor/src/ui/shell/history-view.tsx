import { useEffect, useState } from 'preact/hooks'
import type { VersionCommit, VersionFile } from '../../api-types.js'
import { type DiffRow, type DocumentDiff, describePageDiff, describeSiteDiff } from '../../changes.js'
import { foldDiff, lineDiff } from '../../line-diff.js'
import { getVersion, getVersionText, restoreVersion, versionFileUrl } from '../api-client.js'
import { ConfirmDialog } from '../dialogs/dialog.js'
import { type CommitsState, documentLabel, fullDate, timelineDate, useCommits } from '../history/shared.js'
import { ScrollLock } from '../scroll-lock.js'
import { useEditor } from '../state/editor.js'

const STATUS_LABEL: Record<VersionFile['status'], string> = {
  added: 'Added',
  modified: 'Changed',
  deleted: 'Deleted',
  renamed: 'Renamed',
}

function parse(text: string | undefined): unknown {
  if (text === undefined) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

type FileDiff =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'fields'; diff: DocumentDiff }
  | { kind: 'lines'; before: string; after: string }

/** A content file as the sections and values it changed, or as lines when it is not a document the editor knows. */
function useFileDiff(commit: VersionCommit, file: VersionFile, labels: Record<string, string>): FileDiff {
  const [diff, setDiff] = useState<FileDiff>({ kind: 'loading' })
  useEffect(() => {
    let live = true
    setDiff({ kind: 'loading' })
    const before = commit.parent ? getVersionText(commit.parent, file.from ?? file.path) : Promise.resolve(undefined)
    const after = file.status === 'deleted' ? Promise.resolve(undefined) : getVersionText(commit.sha, file.path)
    void Promise.all([before, after]).then(([old, next]) => {
      if (!live) return
      if (old === null || next === null) {
        setDiff({ kind: 'failed' })
        return
      }
      if (file.key?.endsWith('.json')) {
        const described =
          file.key === 'site.json' ? describeSiteDiff(parse(old), parse(next)) : describePageDiff(parse(old), parse(next), labels)
        if (described.summary !== '') {
          setDiff({ kind: 'fields', diff: described })
          return
        }
      }
      setDiff({ kind: 'lines', before: old ?? '', after: next ?? '' })
    })
    return () => {
      live = false
    }
  }, [commit.sha, file.path])
  return diff
}

function LinesView({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after)
  if (!lines) return <p class="bm-note">Too long to compare here.</p>
  const folded = foldDiff(lines)
  if (folded.every((line) => 'skipped' in line)) return <p class="bm-note">No difference in the text.</p>
  return (
    <pre class="bm-line-diff">
      {folded.map((line, index) =>
        'skipped' in line ? (
          <span key={index} class="bm-line bm-line-skip">
            ⋯ {line.skipped} unchanged {line.skipped === 1 ? 'line' : 'lines'}
          </span>
        ) : (
          <span key={index} class={`bm-line bm-line-${line.kind}`}>
            <span class="bm-line-mark" aria-hidden="true">
              {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
            </span>
            {line.kind !== 'same' && <span class="bm-visually-hidden">{line.kind === 'added' ? 'Added: ' : 'Removed: '}</span>}
            {line.text}
          </span>
        ),
      )}
    </pre>
  )
}

function ValueChange({ row }: { row: DiffRow }) {
  return (
    <div class="bm-diff-values">
      {row.before !== undefined && (
        <span class="bm-diff-chip bm-diff-old">
          <span class="bm-visually-hidden">Before: </span>
          {row.before}
        </span>
      )}
      {row.before !== undefined && row.after !== undefined && (
        <span class="bm-diff-arrow" aria-hidden="true">
          →
        </span>
      )}
      {row.after !== undefined && (
        <span class="bm-diff-chip bm-diff-new">
          <span class="bm-visually-hidden">{row.before === undefined ? 'Added: ' : 'After: '}</span>
          {row.after}
        </span>
      )}
    </div>
  )
}

/** The rows of one document: sections added and removed as badges, then each changed value, old → new. */
function DiffRows({ diff }: { diff: DocumentDiff }) {
  return (
    <ul class="bm-diff-rows">
      {diff.sectionsAdded.length > 0 && (
        <li class="bm-diff-row">
          <span class="bm-diff-label">Sections added</span>
          <div class="bm-diff-badges">
            {diff.sectionsAdded.map((name, index) => (
              <span key={index} class="bm-diff-badge bm-diff-new">
                + {name}
              </span>
            ))}
          </div>
        </li>
      )}
      {diff.sectionsRemoved.length > 0 && (
        <li class="bm-diff-row">
          <span class="bm-diff-label">Sections removed</span>
          <div class="bm-diff-badges">
            {diff.sectionsRemoved.map((name, index) => (
              <span key={index} class="bm-diff-badge bm-diff-old">
                {name}
              </span>
            ))}
          </div>
        </li>
      )}
      {diff.reordered && (
        <li class="bm-diff-row">
          <span class="bm-diff-label">Section order</span>
          <span class="bm-note">Changed</span>
        </li>
      )}
      {diff.rows.map((row, index) => (
        <li key={index} class="bm-diff-row">
          <div class="bm-diff-field">
            <span class="bm-diff-label">{row.label}</span>
            <span class="bm-diff-path">{row.path}</span>
          </div>
          <ValueChange row={row} />
        </li>
      ))}
    </ul>
  )
}

function ContentDiff({ diff }: { diff: FileDiff }) {
  if (diff.kind === 'loading') return <p class="bm-note bm-diff-pad">Loading…</p>
  if (diff.kind === 'failed') return <p class="bm-note bm-diff-pad">Could not read this file at that version.</p>
  if (diff.kind === 'lines') return <LinesView before={diff.before} after={diff.after} />
  return <DiffRows diff={diff.diff} />
}

/** One changed file as a card: its name and a summary, Restore, and what changed. */
function FileCard({
  commit,
  file,
  label,
  restoreLabel,
  busy,
  onRestore,
}: {
  commit: VersionCommit
  file: VersionFile
  label: string
  restoreLabel: string | null
  busy: boolean
  onRestore: () => void
}) {
  const { doc } = useEditor()
  const diff = useFileDiff(commit, file, doc.catalog.value?.sectionLabels ?? {})
  const summary = file.asset
    ? STATUS_LABEL[file.status]
    : diff.kind === 'fields'
      ? diff.diff.summary
      : file.status === 'modified'
        ? 'Text changed'
        : STATUS_LABEL[file.status]
  return (
    <section class="bm-commit-file" aria-label={label}>
      <header class="bm-commit-file-head">
        <div class="bm-commit-file-heading">
          <h3 class="bm-commit-file-name" title={file.from ? `${file.from} → ${file.path}` : file.path}>
            {label}
          </h3>
          <span class="bm-commit-file-sum">{summary}</span>
        </div>
        {restoreLabel && (
          <button type="button" class="bm-btn-soft" disabled={busy} onClick={onRestore}>
            {restoreLabel}
          </button>
        )}
      </header>
      {file.asset ? (
        <div class="bm-diff-pad">
          <AssetDiff commit={commit} file={file} />
        </div>
      ) : (
        <ContentDiff diff={diff} />
      )}
    </section>
  )
}

function AssetDiff({ commit, file }: { commit: VersionCommit; file: VersionFile }) {
  const image = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.path)
  if (!image) return <p class="bm-note">{STATUS_LABEL[file.status]} video.</p>
  const before = file.status !== 'added' && commit.parent ? versionFileUrl(commit.parent, file.from ?? file.path) : null
  const after = file.status !== 'deleted' ? versionFileUrl(commit.sha, file.path) : null
  return (
    <div class="bm-asset-diff">
      {before && (
        <figure class="bm-asset-side bm-asset-before">
          <img src={before} alt="Before" loading="lazy" />
          <figcaption>Before</figcaption>
        </figure>
      )}
      {after && (
        <figure class="bm-asset-side bm-asset-after">
          <img src={after} alt="After" loading="lazy" />
          <figcaption>{before ? 'After' : 'Added'}</figcaption>
        </figure>
      )}
      {!after && <p class="bm-note">Deleted in this commit.</p>}
    </div>
  )
}

type Pending = { files: VersionFile[] } | null

/** One commit: what it changed, file by file, with Restore for all of it or one file. */
function CommitDetail({ sha, restoreCommits, onRestored }: { sha: string; restoreCommits: boolean; onRestored: () => void }) {
  const { doc, ui, session } = useEditor()
  const [detail, setDetail] = useState<{ commit: VersionCommit; files: VersionFile[] } | null | 'failed'>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setDetail(null)
    void getVersion(sha).then((result) => {
      if (live) setDetail(result.ok ? result.value : 'failed')
    })
    return () => {
      live = false
    }
  }, [sha])

  if (detail === null) return <p class="bm-note">Loading the commit…</p>
  if (detail === 'failed') return <p class="bm-note">Could not load this commit.</p>
  const { commit, files } = detail
  const pages = doc.pages.value
  const restorable = files.filter((file) => !(file.status === 'deleted' && file.asset))

  /** The open document or the site settings, which the editor holds a draft of. */
  const touchesDraft = (list: readonly VersionFile[]) => list.some((file) => file.key === 'site.json' || file.key === doc.pageFile.value)

  async function restore(list: VersionFile[]) {
    setBusy(true)
    const result = await restoreVersion(commit.sha, list.length === files.length ? undefined : list.map((file) => file.path))
    setBusy(false)
    setPending(null)
    if (!result.ok) {
      ui.toasts.error('Could not restore.', { key: 'restore', lines: [result.message] })
      return
    }
    const count = result.value.written.length + result.value.removed.length
    ui.toasts.info(
      result.value.commit
        ? `Restored ${count} ${count === 1 ? 'file' : 'files'} from ${commit.short} in commit ${result.value.commit}.`
        : `Restored ${count} ${count === 1 ? 'file' : 'files'} from ${commit.short}. Commit them when you are ready.`,
      { key: 'restore' },
    )
    // The editor holds this document and the site as drafts: load what was restored instead.
    if (touchesDraft(list)) session.discardAndGo(null)
    else onRestored()
  }

  const dirtyNote = (list: readonly VersionFile[]) =>
    doc.dirty.value && touchesDraft(list) ? ' Your unsaved changes to this page and the site settings are discarded.' : ''

  const restoreLabel = (file: VersionFile): string | null => {
    if (!restorable.includes(file) || files.length < 2) return null
    if (file.asset) return 'Restore image'
    if (file.key === 'site.json') return 'Restore settings'
    return file.key?.endsWith('.json') ? 'Restore page' : 'Restore file'
  }

  return (
    <article class="bm-commit" aria-label={`Version ${commit.short}`}>
      <header class="bm-commit-head">
        <div class="bm-commit-heading">
          <h2 class="bm-commit-title">{commit.message || commit.short}</h2>
          <p class="bm-commit-meta">
            {commit.author} · {fullDate(commit.at)} · <code>{commit.short}</code>
            {commit.branch && (
              <>
                {' '}
                · <span class="bm-badge">not published</span>
              </>
            )}
          </p>
        </div>
        {restorable.length > 0 && (
          <button type="button" class="bm-btn-primary" disabled={busy} onClick={() => setPending({ files: restorable })}>
            Restore this version
          </button>
        )}
      </header>
      {files.length === 0 && <p class="bm-note">This save only changed code.</p>}
      {files.map((file) => (
        <FileCard
          key={file.path}
          commit={commit}
          file={file}
          label={file.asset ? file.path.slice(file.path.lastIndexOf('/') + 1) : documentLabel(file.key, file.path, pages)}
          restoreLabel={restoreLabel(file)}
          busy={busy}
          onRestore={() => setPending({ files: [file] })}
        />
      ))}
      {pending && (
        <>
          <ScrollLock />
          <ConfirmDialog
            label="Restore this version"
            tone="warn"
            icon="rotate-ccw"
            body={
              <>
                Put{' '}
                <strong>
                  {pending.files.length === 1
                    ? documentLabel(pending.files[0]?.key, pending.files[0]?.path ?? '', pages)
                    : `${pending.files.length} files`}
                </strong>{' '}
                back as they were in <code>{commit.short}</code>, with any images they use that were deleted since.
              </>
            }
            note={`${
              restoreCommits
                ? 'This adds a new commit on top; nothing in the history is rewritten.'
                : 'The files are written to the project; commit them yourself.'
            }${dirtyNote(pending.files)}`}
            confirmLabel={busy ? 'Restoring…' : 'Restore'}
            onConfirm={() => void restore(pending.files)}
            onCancel={() => setPending(null)}
          />
        </>
      )}
    </article>
  )
}

function CommitList({
  state,
  selected,
  onSelect,
  onMore,
}: {
  state: Extract<CommitsState, { status: 'ready' }>
  selected: string | null
  onSelect: (sha: string) => void
  onMore: () => void
}) {
  return (
    <nav class="bm-timeline" aria-label="Versions">
      <ul>
        {state.commits.map((commit) => {
          const on = commit.sha === selected
          return (
            <li key={commit.sha}>
              <button
                type="button"
                class={on ? 'bm-timeline-item bm-timeline-on' : 'bm-timeline-item'}
                aria-current={on ? 'true' : undefined}
                onClick={() => onSelect(commit.sha)}
              >
                <span class="bm-timeline-dot" aria-hidden="true" />
                <span class="bm-timeline-text">
                  <span class="bm-timeline-date">{timelineDate(commit.at)}</span>
                  <span class="bm-timeline-title">{commit.message || commit.short}</span>
                  <span class="bm-timeline-author">
                    {commit.author}
                    {commit.branch && <span class="bm-badge">not published</span>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {state.more && (
        <button type="button" class="bm-tertiary bm-commit-more" onClick={onMore}>
          Load older versions
        </button>
      )}
    </nav>
  )
}

/** The History screen: every commit of the content and the images, and what each changed, with Restore. */
export function HistoryView() {
  const { ui } = useEditor()
  const { state, loadMore, reload } = useCommits()
  const wanted = ui.historyCommit.value
  const selected = state.status === 'ready' ? (wanted ?? state.commits[0]?.sha ?? null) : null

  return (
    <div class="bm-listing bm-history">
      <header class="bm-listing-head">
        <div class="bm-listing-heading">
          <div class="bm-listing-title-row">
            <h1 class="bm-screen-title">History</h1>
          </div>
          <p class="bm-history-sub">
            Saved versions of your content and images
            {state.status === 'ready' && state.branch ? (
              <>
                {' '}
                on <code>{state.branch}</code>
              </>
            ) : null}
            .
          </p>
        </div>
      </header>
      {state.status === 'loading' && <p class="bm-note">Loading the versions…</p>}
      {state.status === 'failed' && (
        <p class="bm-note">{state.missing ? 'There is no commit history here: the content is not in a git repository.' : state.message}</p>
      )}
      {state.status === 'ready' && state.commits.length === 0 && <p class="bm-note">No saved versions of the content yet.</p>}
      {state.status === 'ready' && state.commits.length > 0 && (
        <div class="bm-history-body">
          <CommitList
            state={state}
            selected={selected}
            onSelect={(sha) => {
              ui.historyCommit.value = sha
            }}
            onMore={loadMore}
          />
          {selected && (
            <CommitDetail
              key={selected}
              sha={selected}
              restoreCommits={state.restoreCommits}
              onRestored={() => {
                ui.historyCommit.value = null
                reload()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
