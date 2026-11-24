import { useMemo, useRef, useState } from 'preact/hooks'
import { groupChanges } from '../../changes.js'
import { relativeTime } from '../../shell.js'
import { Segmented } from '../forms/segmented.js'
import { changeSummary, clock, type CommitsState, stepChanges, useCommits } from '../history/shared.js'
import { Icon } from '../icons.js'
import { Info } from '../info.js'
import { useEditor } from '../state/editor.js'
import { ChangeRow } from './changes-dialog.js'
import { DialogClose, useDialogFocus } from './dialog.js'

type Tab = 'session' | 'commits'

/** Ctrl+Z history of the open document in this tab, newest first. Picking a step goes there, as undo and redo would. */
function SessionTab() {
  const { undo, doc, ui } = useEditor()
  const { steps, current } = undo.steps.value
  const labels = doc.catalog.value?.sectionLabels ?? {}
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const changes = useMemo(
    () => steps.map((step, index) => (index === 0 ? [] : stepChanges(steps[index - 1] ?? step, step, labels))),
    // `labels` comes from the catalog, which does not change while the editor is open.
    [steps],
  )
  if (steps.length <= 1) {
    return <p class="bm-note">No edits yet. Every change you make here is a step you can go back to until you close this tab.</p>
  }
  const rows = steps.map((step, index) => ({ step, index })).reverse()
  return (
    <ul class="bm-versions">
      {rows.map(({ step, index }) => {
        const list = changes[index] ?? []
        const isOpen = openIndex === index
        const undone = index > current
        return (
          <li key={index} class={undone ? 'bm-version bm-version-undone' : 'bm-version'}>
            <div class="bm-version-row">
              {index === 0 ? (
                <span class="bm-icon-btn" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  class="bm-icon-btn"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Hide' : 'Show'} what step ${index} changed`}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                >
                  <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
                </button>
              )}
              <span class="bm-version-when">
                <span class="bm-version-line">
                  <span class="bm-version-rel">{index === 0 ? 'Start' : changeSummary(list.map((entry) => entry.item)) || 'Edit'}</span>
                  <span class="bm-version-abs">{step.at ? clock(step.at) : ''}</span>
                </span>
                {undone && <span class="bm-version-sum">Undone</span>}
              </span>
              {index === current ? (
                <span class="bm-badge bm-badge-on">now</span>
              ) : (
                <button
                  type="button"
                  class="bm-restore"
                  aria-label={index < current ? `Go back to step ${index}` : `Redo up to step ${index}`}
                  onClick={() => {
                    if (undo.goTo(index)) ui.status.value = index < current ? 'Went back.' : 'Redone.'
                  }}
                >
                  <Icon name={index < current ? 'undo' : 'redo'} size={14} />
                  {index < current ? 'Go back' : 'Redo'}
                </button>
              )}
            </div>
            {isOpen && (
              <div class="bm-version-diff">
                {list.length === 0 ? (
                  <p class="bm-note">Nothing that is shown as a field.</p>
                ) : (
                  (['page', 'site'] as const).map((scope) => {
                    const entries = list.filter((entry) => entry.scope === scope).map((entry) => entry.item)
                    return groupChanges(entries).map((area) => (
                      <section key={`${scope}:${area.area}`} aria-label={area.area}>
                        <h3 class="bm-changes-area">{scope === 'site' ? `Site › ${area.area}` : area.area}</h3>
                        <ul>
                          {area.entries.map((item) => (
                            <ChangeRow key={`${item.field}:${item.kind}`} item={item} scope={scope} />
                          ))}
                        </ul>
                      </section>
                    ))
                  })
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function commitsMessage(state: Extract<CommitsState, { status: 'failed' }>): string {
  return state.missing ? 'There is no commit history here: the content is not in a git repository.' : state.message
}

/** The newest commits; picking one opens it on the History screen. */
function CommitsTab({ onOpen }: { onOpen: (sha: string | null) => void }) {
  const { state } = useCommits()
  if (state.status === 'loading') return <p class="bm-note">Loading the commits…</p>
  if (state.status === 'failed') return <p class="bm-note">{commitsMessage(state)}</p>
  if (state.commits.length === 0) return <p class="bm-note">No commits of the content yet.</p>
  return (
    <>
      <ul class="bm-versions">
        {state.commits.slice(0, 12).map((commit) => (
          <li key={commit.sha} class="bm-version">
            <button type="button" class="bm-tertiary bm-version-when bm-commit-pick" onClick={() => onOpen(commit.sha)}>
              <span class="bm-version-line">
                <span class="bm-version-rel">{commit.message || commit.short}</span>
                <span class="bm-version-abs">{relativeTime(commit.at)}</span>
              </span>
              <span class="bm-version-sum">
                <code>{commit.short}</code> · {commit.author}
                {commit.branch && <span class="bm-badge">not published</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div class="bm-dialog-foot">
        <button type="button" class="bm-tertiary" onClick={() => onOpen(null)}>
          <Icon name="git-commit" size={14} />
          Open full history
        </button>
      </div>
    </>
  )
}

/**
 * History, from the top bar: this tab's undo steps of the open document (kept until the tab closes), and the commits
 * of the content and the uploads, which open on the full History screen to compare and restore.
 */
export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const { ui } = useEditor()
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root)
  const [tab, setTab] = useState<Tab>('session')

  function open(sha: string | null) {
    ui.historyCommit.value = sha
    ui.openView('history')
  }

  return (
    <div
      class="bm-dialog bm-changes"
      role="dialog"
      aria-modal="true"
      aria-label="History"
      ref={root}
      style="top:12%;left:50%;transform:translateX(-50%);"
    >
      <div class="bm-dialog-head">
        <div class="bm-dialog-heading">
          <h2 class="bm-dialog-title">
            History
            <Info
              label="Where history is kept"
              text={
                <>
                  <strong>This session</strong> is kept in this browser tab only and goes when you close it. <strong>Commits</strong> come
                  from the repository: they are shared, permanent, and restoring one adds a new commit.
                </>
              }
            />
          </h2>
          <p class="bm-dialog-sub">{tab === 'session' ? 'Steps of this page since this tab opened.' : 'Changes to content and images.'}</p>
        </div>
        <DialogClose onClose={onClose} />
      </div>
      <Segmented
        hideLabel
        label="History"
        value={tab}
        options={[
          { value: 'session', label: 'This session' },
          { value: 'commits', label: 'Commits' },
        ]}
        onChange={(value) => setTab(value === 'commits' ? 'commits' : 'session')}
      />
      <div class="bm-changes-list">{tab === 'session' ? <SessionTab /> : <CommitsTab onOpen={open} />}</div>
    </div>
  )
}
