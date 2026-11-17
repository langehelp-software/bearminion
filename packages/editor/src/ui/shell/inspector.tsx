import { useEffect, useRef } from 'preact/hooks'
import { INSPECTOR_DEFAULT, INSPECTOR_KEY_STEP, INSPECTOR_MAX, INSPECTOR_MIN } from '../../shell.js'
import { IssueContext, LinksContext } from '../context.js'
import { useEditor } from '../state/editor.js'
import type { Catalog, InspectorTab } from '../types.js'
import { PagePanel, SectionPanel } from './panels.js'

const TABS: readonly { id: InspectorTab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'section', label: 'Section' },
]

/**
 * Scroll to and focus the control a page action asked for (Settings on a section bar), once it has rendered.
 * The request is used up whether or not the control exists: it is set in the same batch as the state that renders
 * the control, so the first render after it either has the control or never will (the section was deleted, the tab
 * has no such field). Keeping it would pull focus to an unrelated control that later happens to match.
 */
export function useFocusRequest(root: { current: HTMLElement | null }) {
  const { ui } = useEditor()
  const request = ui.focusField.value
  useEffect(() => {
    if (!request) return
    const node = root.current?.querySelector(`[data-editor-field="${CSS.escape(request)}"]`)
    ui.focusField.value = null
    if (!(node instanceof HTMLElement)) return
    node.scrollIntoView({ block: 'center' })
    node.focus()
  })
}

/** While a sidebar's edge is dragged the page must not take the pointer, or the drag stops over it. */
export function setResizing(dragging: boolean) {
  document.documentElement.toggleAttribute('data-bearminion-resizing', dragging)
}

/**
 * The left edge of the right-hand sidebar (the inspector or a settings sidebar): drag, arrow keys, Home and End
 * resize it; a double click resets it. Both sidebars share one width.
 */
export function SidebarResize({ label = 'Resize inspector' }: { label?: string }) {
  const onDrag = setResizing
  const { ui, chrome } = useEditor()
  const width = ui.inspectorWidth.value
  return (
    <div
      class="bm-inspector-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={INSPECTOR_MIN}
      aria-valuemax={INSPECTOR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onDblClick={() => chrome.resizeInspector(INSPECTOR_DEFAULT)}
      onKeyDown={(event) => {
        // The inspector is on the right, so ArrowLeft widens it.
        const next =
          event.key === 'ArrowLeft'
            ? width + INSPECTOR_KEY_STEP
            : event.key === 'ArrowRight'
              ? width - INSPECTOR_KEY_STEP
              : event.key === 'Home'
                ? INSPECTOR_MIN
                : event.key === 'End'
                  ? INSPECTOR_MAX
                  : null
        if (next === null) return
        event.preventDefault()
        chrome.resizeInspector(next)
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const startX = event.clientX
        const startWidth = width
        const handle = event.currentTarget
        handle.setPointerCapture(event.pointerId)
        onDrag(true)
        const move = (pointer: PointerEvent) => chrome.resizeInspector(startWidth + (startX - pointer.clientX))
        const up = () => {
          onDrag(false)
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', up)
          handle.removeEventListener('pointercancel', up)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', up)
        handle.addEventListener('pointercancel', up)
      }}
    >
      <span class="bm-inspector-grip" aria-hidden="true" />
    </div>
  )
}

/** Left and right arrows move between the tabs and select the one they land on. */
function onTabArrows(event: KeyboardEvent, select: (tab: InspectorTab) => void, current: InspectorTab) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  const index = TABS.findIndex((tab) => tab.id === current)
  const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
  if (!next) return
  select(next.id)
  const list = event.currentTarget
  if (list instanceof HTMLElement) list.querySelector<HTMLElement>(`#bm-tab-${next.id}`)?.focus()
}

/** The right-hand panel beside the canvas: the open document (Page) and the selected section (Section). */
export function Inspector({ catalog }: { catalog: Catalog }) {
  const { doc, ui, links } = useEditor()
  const root = useRef<HTMLElement>(null)
  useFocusRequest(root)
  const tab = ui.inspectorTab.value
  const select = (next: InspectorTab) => {
    ui.inspectorTab.value = next
  }
  return (
    <aside class="bm-inspector bm-panel bm-chrome" aria-label="Inspector" style={`width:${ui.inspectorWidth.value}px`} ref={root}>
      <SidebarResize />
      <div class="bm-tabs" role="tablist" aria-label="Inspector" onKeyDown={(event) => onTabArrows(event, select, tab)}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`bm-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`bm-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => select(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <IssueContext.Provider value={ui.issues.value.filter((issue) => issue.file === undefined || issue.file === 'page')}>
        <LinksContext.Provider
          value={{ pages: doc.pages.value, currentSlug: doc.linkKey.value, anchors: doc.anchors.value, editLink: links.open }}
        >
          <div class="bm-body" role="tabpanel" id={`bm-panel-${tab}`} aria-labelledby={`bm-tab-${tab}`}>
            {tab === 'page' ? <PagePanel catalog={catalog} /> : <SectionPanel catalog={catalog} />}
          </div>
        </LinksContext.Provider>
      </IssueContext.Provider>
    </aside>
  )
}
