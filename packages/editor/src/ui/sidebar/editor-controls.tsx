import { SavePill, SaveSplit } from '../chrome/save.js'
import { Icon } from '../icons.js'
import { useEditor } from '../state/editor.js'
import type { SaveAction } from '../types.js'

/** The Save menu. More entries (publish) can join this list; the split button renders whatever it holds. */
function useSaveActions(): SaveAction[] {
  const editor = useEditor()
  const { doc, ui, undo } = editor
  const git = ui.gitState.value
  const openDialog = (kind: 'history' | 'commit' | 'discard') => () => {
    ui.dialog.value = { kind }
  }
  return [
    { id: 'undo', label: 'Undo', shortcut: '⌘Z', disabled: !undo.undoable.value, onSelect: editor.stepUndo },
    { id: 'redo', label: 'Redo', shortcut: '⇧⌘Z', disabled: !undo.redoable.value, onSelect: editor.stepRedo },
    { id: 'history', label: 'Version history…', separated: true, onSelect: openDialog('history') },
    ...(git?.enabled && git.repo
      ? [{ id: 'commit', label: 'Commit changes…', disabled: git.files.length === 0, onSelect: openDialog('commit') }]
      : []),
    { id: 'discard', label: 'Discard changes…', danger: true, disabled: !doc.dirty.value, onSelect: openDialog('discard') },
  ]
}

/** Preview, the unsaved-changes pill and Save. Same in the dock and the sidebar header, so opening never moves them. */
export function EditorControls() {
  const { doc, ui, session, chrome } = useEditor()
  const actions = useSaveActions()
  return (
    <>
      <button
        type="button"
        class="bm-icon-btn bm-close"
        aria-label="Preview"
        title="Preview without the editor"
        onClick={chrome.enterPreview}
      >
        <Icon name="eye" size={16} />
      </button>
      <SavePill
        dirty={doc.dirty.value}
        onReview={() => {
          ui.dialog.value = { kind: 'changes' }
        }}
      />
      <SaveSplit stage={ui.saveStage.value} onSave={() => void session.saveAndGo(null)} actions={actions} />
    </>
  )
}

/** The closed editor: the header controls and a button that opens the sidebar. */
export function Dock() {
  const { ui } = useEditor()
  return (
    // Same row as the sidebar header: the pill, Save and the open button sit where the pill, Save and Close sit,
    // so opening and closing the editor never moves the eye.
    <div class="bm-dock" role="group" aria-label="Editor">
      <EditorControls />
      <button
        type="button"
        class="bm-icon-btn bm-close bm-dock-open"
        aria-label="Editor"
        title="Open editor (Ctrl+E)"
        aria-expanded={false}
        aria-keyshortcuts="Control+E"
        onClick={() => {
          ui.open.value = true
        }}
      >
        <Icon name="panel-right" size={16} />
      </button>
    </div>
  )
}

/** All that shows in preview mode. */
export function ExitPreviewButton() {
  const { chrome } = useEditor()
  return (
    <button type="button" class="bm-exit-preview" onClick={chrome.exitPreview} title="Exit preview (Esc)">
      <Icon name="eye-off" size={16} />
      Exit preview
    </button>
  )
}
