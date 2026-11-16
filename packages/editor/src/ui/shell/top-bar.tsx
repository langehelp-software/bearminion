import { useComputed } from '@preact/signals'
import { listingView } from '../../shell.js'
import { CommitButton, SaveButton, SavePill } from '../chrome/save.js'
import { unsavedFiles } from '../dialogs/editor-dialogs.js'
import { Icon, type IconName } from '../icons.js'
import { useEditor } from '../state/editor.js'
import { listedType, type NavGroup, viewTitle } from './nav-items.js'
import { POPOVER_TRIGGER } from './popover.js'

function IconButton({
  icon,
  label,
  title,
  disabled,
  pressed,
  popover,
  onClick,
}: {
  icon: IconName
  label: string
  title?: string
  disabled?: boolean
  pressed?: boolean
  /** Opens a top-bar popover: the press that opens it does not count as a press outside it. */
  popover?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      class={pressed ? 'bm-topbar-btn bm-topbar-btn-on' : 'bm-topbar-btn'}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      {...(popover ? { [POPOVER_TRIGGER]: '' } : {})}
    >
      <Icon name={icon} size={18} />
    </button>
  )
}

/** Type, title and address of the open document. The type opens its listing. */
function Breadcrumb() {
  const { doc, ui } = useEditor()
  const ref = doc.ref.value
  const type = listedType(ref)
  const typeLabel = type === 'pages' ? 'Pages' : (doc.types.value.find((item) => item.id === type)?.label ?? type)
  const title = doc.page.value?.title || doc.savedSlug.value
  const address = ref.kind === 'listing' ? location.pathname : (doc.href.value ?? location.pathname)
  return (
    <div class="bm-crumbs">
      <button type="button" class="bm-crumb-type" onClick={() => ui.openView(listingView(type))}>
        {typeLabel}
      </button>
      <span class="bm-crumb-sep" aria-hidden="true">
        /
      </span>
      <span class="bm-crumb-title" title={title}>
        {title}
      </span>
      <span class="bm-crumb-path" title={address}>
        {address}
      </span>
    </div>
  )
}

/** The bar over the canvas: where you are, undo and redo, history, the inspector, preview, the save state and Save. */
export function TopBar({ groups }: { groups: NavGroup[] }) {
  const editor = useEditor()
  const { doc, ui, undo, session, chrome } = editor
  const view = ui.view.value
  const dialog = ui.dialog.value?.kind
  const changes = useComputed(() => (doc.dirty.value ? unsavedFiles(doc).reduce((sum, file) => sum + file.entries.length, 0) : 0)).value
  const git = ui.gitState.value
  const toggle = (kind: 'history' | 'changes') => {
    ui.dialog.value = ui.dialog.peek()?.kind === kind ? null : { kind }
  }

  if (ui.previewing.value) {
    return (
      <header class="bm-topbar bm-topbar-preview bm-chrome">
        <div class="bm-topbar-left">
          <span class="bm-topbar-preview-note">Preview · how visitors see this page</span>
        </div>
        <div class="bm-topbar-right">
          <button type="button" class="bm-exit-preview" title="Exit preview (Esc)" onClick={chrome.exitPreview}>
            <Icon name="x" size={16} />
            Exit preview
          </button>
        </div>
      </header>
    )
  }

  const title = viewTitle(groups, view)
  const pageTitle = doc.page.value?.title || 'page'
  return (
    <header class="bm-topbar bm-chrome">
      <div class="bm-topbar-left">
        {view === 'canvas' ? (
          <>
            <Breadcrumb />
            <span class="bm-topbar-divider" aria-hidden="true" />
            <IconButton icon="undo" label="Undo" title="Undo (⌘Z)" disabled={!undo.undoable.value} onClick={editor.stepUndo} />
            <IconButton icon="redo" label="Redo" title="Redo (⇧⌘Z)" disabled={!undo.redoable.value} onClick={editor.stepRedo} />
          </>
        ) : (
          <>
            <button type="button" class="bm-back" onClick={() => ui.openView('canvas')}>
              <Icon name="chevron-left" size={16} />
              <span class="bm-back-text">Back to {pageTitle}</span>
            </button>
            <span class="bm-topbar-divider" aria-hidden="true" />
            <span class="bm-view-crumb">
              {title.group} / <strong>{title.label}</strong>
            </span>
          </>
        )}
      </div>
      <div class="bm-topbar-right">
        <IconButton
          icon="history"
          label="Version history"
          pressed={dialog === 'history'}
          popover
          disabled={!doc.page.value || !doc.site.value}
          onClick={() => toggle('history')}
        />
        {view === 'canvas' && (
          <IconButton
            icon="panel-right"
            label={ui.open.value ? 'Hide inspector' : 'Show inspector'}
            title={`${ui.open.value ? 'Hide' : 'Show'} inspector (⌘E)`}
            pressed={ui.open.value}
            onClick={() => {
              ui.open.value = !ui.open.peek()
            }}
          />
        )}
        {git?.enabled && git.repo && (
          <CommitButton
            files={git.files.length}
            onCommit={() => {
              ui.dialog.value = { kind: 'commit' }
            }}
          />
        )}
        <span class="bm-topbar-divider" aria-hidden="true" />
        <button type="button" class="bm-preview-btn" title="Preview without the editor" onClick={chrome.enterPreview}>
          <Icon name="eye" size={16} />
          <span class="bm-preview-text">Preview</span>
        </button>
        <SavePill dirty={doc.dirty.value} changes={changes} open={dialog === 'changes'} onReview={() => toggle('changes')} />
        <SaveButton dirty={doc.dirty.value} stage={ui.saveStage.value} onSave={() => void session.saveAndGo(null)} />
      </div>
    </header>
  )
}
