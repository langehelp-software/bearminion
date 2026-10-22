import { batch, signal } from '@preact/signals'
import { SIDEBAR_DEFAULT } from '../../sidebar.js'
import type { RichActive } from '../rich-editor.js'
import type { ConfirmAction, DraftOffer, GitState, HeadingBar, Issue, LinkEdit, Tab } from '../types.js'

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
  | { kind: 'leave'; href: string | null }
  | { kind: 'home'; title: string; previousSlug: string }

export function createUiState() {
  const open = signal(false)
  const tab = signal<Tab>('pages')
  const previewing = signal(false)
  const sidebarWidth = signal(SIDEBAR_DEFAULT)
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
  const draftOffer = signal<DraftOffer | null>(null)
  const tabNotice = signal<string | null>(null)
  const gitState = signal<GitState | null>(null)

  function selectSection(id: string) {
    batch(() => {
      selectedId.value = id
      hoverId.value = id
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

  /** Errors from a failed save, shown at the top of the sidebar. */
  function fail(message: string, problems: Issue[] = issues.peek()) {
    batch(() => {
      issues.value = problems
      status.value = message
      open.value = true
    })
  }

  return {
    open,
    tab,
    previewing,
    sidebarWidth,
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
    tabNotice,
    gitState,
    selectSection,
    closePopovers,
    dismissDialog,
    fail,
  }
}

export type UiState = ReturnType<typeof createUiState>
