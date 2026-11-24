import { useEffect, useState } from 'preact/hooks'
import type { VersionCommit, VersionFile } from '../../api-types.js'
import { type ChangeEntry, describePageChanges, describeSiteChanges, groupChanges } from '../../changes.js'
import { foldDiff, lineDiff } from '../../line-diff.js'
import { relativeTime } from '../../shell.js'
import { getVersion, getVersionText, restoreVersion, versionFileUrl } from '../api-client.js'
import { ChangeRow } from '../dialogs/changes-dialog.js'
import { ConfirmDialog } from '../dialogs/dialog.js'
import { documentLabel, type CommitsState, useCommits } from '../history/shared.js'
import { Icon } from '../icons.js'
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
  | { kind: 'fields'; scope: 'page' | 'site'; entries: ChangeEntry[] }
  | { kind: 'lines'; before: string; after: string }

/** A content file as the fields it changed, or as lines when it is not a document the editor knows. */
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
        const site = file.key === 'site.json'
        const entries = site ? describeSiteChanges(parse(old), parse(next)) : describePageChanges(parse(old), parse(next), labels)
        if (entries.length > 0) {
          setDiff({ kind: 'fields', scope: site ? 'site' : 'page', entries })
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

function ContentDiff({ commit, file }: { commit: VersionCommit; file: VersionFile }) {
  const { doc } = useEditor()
  const diff = useFileDiff(commit, file, doc.catalog.value?.sectionLabels ?? {})
  if (diff.kind === 'loading') return <p class="bm-note">Loading…</p>
  if (diff.kind === 'failed') return <p class="bm-note">Could not read this file at that commit.</p>
  if (diff.kind === 'lines') return <LinesView before={diff.before} after={diff.after} />
  return (
    <>
      {groupChanges(diff.entries).map((area) => (
        <section key={area.area} aria-label={area.area}>
          <h4 class="bm-changes-area">{area.area}</h4>
          <ul>
            {area.entries.map((item) => (
              <ChangeRow key={`${item.field}:${item.kind}`} item={item} scope={diff.scope} />
            ))}
          </ul>
        </section>
      ))}
    </>
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

  return (
    <article class="bm-commit" aria-label={`Commit ${commit.short}`}>
      <header class="bm-commit-head">
        <div>
          <h2 class="bm-commit-title">{commit.message || commit.short}</h2>
          <p class="bm-commit-meta">
            <code>{commit.short}</code> · {commit.author} · {new Date(commit.at).toLocaleString()}
            {commit.branch && (
              <>
                {' '}
                · <span class="bm-badge">not published</span> on <code>{commit.branch}</code>
              </>
            )}
          </p>
        </div>
        {restorable.length > 0 && (
          <button type="button" class="bm-primary bm-listing-new" disabled={busy} onClick={() => setPending({ files: restorable })}>
            <Icon name="rotate-ccw" size={16} />
            Restore this version
          </button>
        )}
      </header>
      {files.length === 0 && <p class="bm-note">This commit changed no content or images.</p>}
      {files.map((file) => (
        <section key={file.path} class="bm-commit-file" aria-label={file.path}>
          <header class="bm-commit-file-head">
            <span class={`bm-file-status bm-file-${file.status}`}>{STATUS_LABEL[file.status]}</span>
            <span class="bm-commit-file-name">
              {file.asset ? file.path.slice(file.path.lastIndexOf('/') + 1) : documentLabel(file.key, file.path, pages)}
              <code class="bm-commit-file-path">{file.from ? `${file.from} → ${file.path}` : file.path}</code>
            </span>
            {restorable.includes(file) && files.length > 1 && (
              <button type="button" class="bm-restore" disabled={busy} onClick={() => setPending({ files: [file] })}>
                <Icon name="rotate-ccw" size={14} />
                Restore file
              </button>
            )}
          </header>
          <div class="bm-commit-file-body">
            {file.asset ? <AssetDiff commit={commit} file={file} /> : <ContentDiff commit={commit} file={file} />}
          </div>
        </section>
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
    <nav class="bm-commit-list" aria-label="Commits">
      <ul>
        {state.commits.map((commit) => (
          <li key={commit.sha}>
            <button
              type="button"
              class={commit.sha === selected ? 'bm-commit-item bm-commit-item-on' : 'bm-commit-item'}
              aria-current={commit.sha === selected ? 'true' : undefined}
              onClick={() => onSelect(commit.sha)}
            >
              <span class="bm-commit-item-message">{commit.message || commit.short}</span>
              <span class="bm-commit-item-meta">
                <code>{commit.short}</code> · {commit.author} · {relativeTime(commit.at)}
              </span>
              {commit.branch && <span class="bm-badge">not published</span>}
            </button>
          </li>
        ))}
      </ul>
      {state.more && (
        <button type="button" class="bm-tertiary bm-commit-more" onClick={onMore}>
          Load older commits
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
          <p class="bm-screen-file">
            Commits of the content and the images{state.status === 'ready' && state.branch ? ` on ${state.branch}` : ''}. Code changes are
            left out.
          </p>
        </div>
      </header>
      {state.status === 'loading' && <p class="bm-note">Loading the commits…</p>}
      {state.status === 'failed' && (
        <p class="bm-note">{state.missing ? 'There is no commit history here: the content is not in a git repository.' : state.message}</p>
      )}
      {state.status === 'ready' && state.commits.length === 0 && <p class="bm-note">No commits of the content yet.</p>}
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
