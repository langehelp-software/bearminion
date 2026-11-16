import { NAV_OPEN_WIDTH, NAV_RAIL_WIDTH } from '../../shell.js'
import { useEditor } from '../state/editor.js'
import type { Catalog } from '../types.js'
import { Inspector } from './inspector.js'
import { navGroups } from './nav-items.js'
import { NavSidebar } from './nav-sidebar.js'
import { TopBar } from './top-bar.js'
import { FullView } from './views.js'

/**
 * The editor around the page: navigation on the left, the top bar, the inspector on the right, and the full-screen
 * views that cover the canvas. The page itself is the canvas (see `page-frame.ts`), so nothing here draws it.
 */
export function Shell({ catalog }: { catalog: Catalog | null }) {
  const { doc, ui } = useEditor()
  const previewing = ui.previewing.value
  const view = ui.view.value
  const groups = navGroups(doc.types.value, doc.pages.value, true)
  const navWidth = previewing ? 0 : ui.navOpen.value ? NAV_OPEN_WIDTH : NAV_RAIL_WIDTH
  return (
    <div class="bm-shell" style={`--bm-nav-w:${navWidth}px;`}>
      {!previewing && <NavSidebar groups={groups} />}
      <TopBar groups={groups} />
      {catalog && !previewing && view === 'canvas' && ui.viewport.value === 'desktop' && ui.open.value && <Inspector catalog={catalog} />}
      {catalog && !previewing && view !== 'canvas' && <FullView view={view} catalog={catalog} />}
    </div>
  )
}
