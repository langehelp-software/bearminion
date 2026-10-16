import { useEffect, useRef } from 'preact/hooks'
import { IssueContext, LinksContext } from '../context.js'
import { Icon } from '../icons.js'
import { useEditor } from '../state/editor.js'
import type { Catalog, Tab } from '../types.js'
import { SidebarBrand } from './brand.js'
import { EditorControls } from './editor-controls.js'
import { DesignPanel, FooterPanel, NavigationPanel, PagesPanel, SaveIssues, SectionPanel, SitePanel } from './panels.js'
import { ResizeHandle } from './resize-handle.js'

const TAB_LABELS: readonly { id: Tab; label: string }[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'section', label: 'Section' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'footer', label: 'Footer' },
  { id: 'design', label: 'Design' },
  { id: 'site', label: 'Site' },
]

/** Left and right arrows move between tabs and select the one they land on. */
function onTabArrows(event: KeyboardEvent) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  const list = event.currentTarget
  if (!(list instanceof HTMLElement)) return
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  // Inside the overlay's shadow root, `document.activeElement` is the host, never the focused tab.
  const rootNode = list.getRootNode()
  const active = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement
  const index = active instanceof HTMLButtonElement ? tabs.indexOf(active) : -1
  if (index < 0) return
  event.preventDefault()
  const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length
  tabs[next]?.focus()
  tabs[next]?.click()
}

/**
 * Scroll to and focus the control a page action asked for (Settings on a section bar), once it has rendered.
 * The request is used up whether or not the control exists: it is set in the same batch as the state that renders
 * the control, so the first render after it either has the control or never will (the section was deleted, the tab
 * has no such field). Keeping it would pull focus to an unrelated control that later happens to match.
 */
function useFocusRequest(root: { current: HTMLElement | null }) {
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

function TabPanel({ catalog }: { catalog: Catalog }) {
  const { doc, ui } = useEditor()
  const tab = ui.tab.value
  const site = doc.site.value
  if (tab === 'section') return <SectionPanel catalog={catalog} />
  if (tab === 'pages') return <PagesPanel catalog={catalog} />
  if (!site) return null
  switch (tab) {
    case 'design':
      return <DesignPanel site={site} />
    case 'site':
      return <SitePanel site={site} catalog={catalog} />
    case 'navigation':
      return <NavigationPanel site={site} catalog={catalog} />
    case 'footer':
      return <FooterPanel site={site} catalog={catalog} />
  }
}

/** The document each tab edits, so a field shows only the save errors of its own file, whatever its path. */
const TAB_FILE: Record<Tab, 'page' | 'site'> = {
  pages: 'page',
  section: 'page',
  navigation: 'site',
  footer: 'site',
  design: 'site',
  site: 'site',
}

export function Sidebar({ catalog }: { catalog: Catalog }) {
  const { doc, ui, links } = useEditor()
  const root = useRef<HTMLElement>(null)
  useFocusRequest(root)
  const tab = ui.tab.value
  const status = ui.status.value
  return (
    <aside class="bm-sidebar" aria-label="BearMinion editor" style={`width:${ui.sidebarWidth.value}px`} ref={root}>
      <ResizeHandle />
      <div class="bm-head">
        <SidebarBrand />
        <EditorControls />
        <button
          type="button"
          class="bm-icon-btn bm-close"
          aria-label="Close sidebar"
          title="Close (Esc)"
          onClick={() => {
            ui.open.value = false
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      <div class="bm-tabs" role="tablist" aria-label="Editor sections" onKeyDown={onTabArrows}>
        {TAB_LABELS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`bm-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`bm-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => {
              ui.tab.value = item.id
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <IssueContext.Provider value={ui.issues.value.filter((issue) => issue.file === undefined || issue.file === TAB_FILE[tab])}>
        <LinksContext.Provider
          value={{ pages: doc.pages.value, currentSlug: doc.currentSlug.value, anchors: doc.anchors.value, editLink: links.open }}
        >
          <div class="bm-body" role="tabpanel" id={`bm-panel-${tab}`} aria-labelledby={`bm-tab-${tab}`}>
            <SaveIssues />
            <TabPanel catalog={catalog} />
          </div>
        </LinksContext.Provider>
      </IssueContext.Provider>
      <div class="bm-foot">
        <span>⌘S save · Esc close</span>
        <span aria-live="polite" title={status}>
          {status}
        </span>
      </div>
    </aside>
  )
}
