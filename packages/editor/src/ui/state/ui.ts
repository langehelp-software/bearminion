import { batch, signal } from '@preact/signals'
import { INSPECTOR_DEFAULT, type View, type Viewport } from '../../shell.js'
import type { RichActive } from '../rich-editor.js'
import { createToasts } from './toasts.js'
import type { ConfirmAction, DraftOffer, GitState, HeadingBar, InspectorTab, Issue, LinkEdit } from '../types.js'

/** Key of the toast a failed save shows. A later failure replaces it; a successful save removes it. */
export const SAVE_TOAST = 'save'

const FILE_LABELS = { page: 'Page', site: 'Site settings' } as const

function issueLine(issue: Issue): string {
  return `${issue.file ? `${FILE_LABELS[issue.file]} › ` : ''}${issue.path}: ${issue.message}`
}

export type InsertWhere = 'above' | 'below'

export interface SectionPicker {
  /** The section the new one goes next to. */
  id: string
  where: InsertWhere
  /** Fixed position. Without it the picker hangs under the section's toolbar. */
  at?: { top: number; left: number }
  /** Opened from the seam between sections, so the seam stays drawn while it is up. */
  fromGap?: boolean
}

/** Modal dialogs. Only one is ever up; opening another replaces it. */
export type EditorDialog =
  | { kind: 'changes' }
  | { kind: 'discard' }
  | { kind: 'history' }
  | { kind: 'commit' }
  | { kind: 'seo' }
  | { kind: 'consent' }
  | { kind: 'leave'; href: string | null }

export function createUiState() {
  /** Whether the inspector (Page and Section tabs) is open beside the canvas. */
  const open = signal(true)
  const inspectorTab = signal<InspectorTab>('page')
  const inspectorWidth = signal(INSPECTOR_DEFAULT)
  /** The left navigation: open with labels, or an icon rail. */
  const navOpen = signal(true)
  /** What covers the canvas: nothing, a content listing, Media or a settings screen. */
  const view = signal<View>('canvas')
  /** Desktop edits the page itself; tablet and mobile show it in a device frame. */
  const viewport = signal<Viewport>('desktop')
  const previewing = signal(false)
  const status = signal('Loading the page.')
  /** Where a save is: writing the files, then waiting for the page to reload with them. */
  const saveStage = signal<'idle' | 'saving' | 'reloading'>('idle')
  const issues = signal<Issue[]>([])

  const selectedId = signal<string | null>(null)
  const hoverId = signal<string | null>(null)
  /** `data-editor-field` of the sidebar control to scroll to and focus. */
  const focusField = signal<string | null>(null)

  // Transient UI over the page. Escape closes all of them.
  const picker = signal<SectionPicker | null>(null)
  const addMenu = signal<string | null>(null)
  const confirm = signal<ConfirmAction | null>(null)
  const linkEdit = signal<LinkEdit | null>(null)
  const headingBar = signal<HeadingBar | null>(null)
  /** Where the rich-text bar sits, under the rich field being edited. */
  const rich = signal<{ top: number; left: number } | null>(null)
  /** Which rich-text bar buttons are on at the caret or selection. */
  const richActive = signal<RichActive | null>(null)
  const linkUrl = signal('https://')
  /** Object path of the image whose picker is open over the page. */
  const pagePick = signal<string | null>(null)

  const dialog = signal<EditorDialog | null>(null)
  /** The commit the History screen shows, or null for the newest. */
  const historyCommit = signal<string | null>(null)
  const draftOffer = signal<DraftOffer | null>(null)
  const gitState = signal<GitState | null>(null)
  /** Errors and warnings over the editor. They stay until dismissed, on every screen. */
  const toasts = createToasts()

  function selectSection(id: string) {
    batch(() => {
      selectedId.value = id
      hoverId.value = id
    })
  }

  /** Back to the page with the Section tab of `id` open in the inspector. */
  function showSection(id: string) {
    batch(() => {
      selectSection(id)
      inspectorTab.value = 'section'
      open.value = true
      view.value = 'canvas'
    })
  }

  /** Cover the canvas with a listing, Media or a settings screen; `canvas` goes back to the page. */
  function openView(next: View) {
    batch(() => {
      view.value = next
      closePopovers()
      if (dialog.peek()?.kind === 'history' || dialog.peek()?.kind === 'changes') dialog.value = null
    })
  }

  /** Close the link editor, the format bar, the add menu, the picker and the confirm. False when none was open. */
  function closePopovers(): boolean {
    if (!linkEdit.peek() && !headingBar.peek() && !addMenu.peek() && !picker.peek() && !confirm.peek()) return false
    batch(() => {
      linkEdit.value = null
      headingBar.value = null
      addMenu.value = null
      picker.value = null
      confirm.value = null
    })
    return true
  }

  /** Escape closes the top dialog first, then the section confirm. */
  function dismissDialog(): boolean {
    if (dialog.peek()) {
      dialog.value = null
      return true
    }
    if (confirm.peek()) {
      confirm.value = null
      return true
    }
    return false
  }

  /**
   * A failed save: one toast that lists every issue (it replaces the previous save's), and the issues kept for the
   * fields they name, which mark themselves inline.
   */
  function fail(message: string, problems: Issue[] = issues.peek()) {
    batch(() => {
      issues.value = problems
      status.value = message
      toasts.error(problems.length > 0 ? `${message} Nothing was written.` : message, {
        key: SAVE_TOAST,
        lines: problems.map(issueLine),
      })
      open.value = true
      if (view.peek() === 'canvas') inspectorTab.value = 'page'
    })
  }

  return {
    open,
    inspectorTab,
    inspectorWidth,
    navOpen,
    view,
    historyCommit,
    viewport,
    previewing,
    status,
    saveStage,
    issues,
    selectedId,
    hoverId,
    focusField,
    picker,
    addMenu,
    confirm,
    linkEdit,
    headingBar,
    rich,
    richActive,
    linkUrl,
    pagePick,
    dialog,
    draftOffer,
    toasts,
    gitState,
    selectSection,
    showSection,
    openView,
    closePopovers,
    dismissDialog,
    fail,
  }
}

export type UiState = ReturnType<typeof createUiState>
