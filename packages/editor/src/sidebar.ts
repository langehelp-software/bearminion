/** Sidebar width and open state. The panel overlays the page; it does not push it. */

export const SIDEBAR_DEFAULT = 440
export const SIDEBAR_MIN = 380
export const SIDEBAR_WIDTH_KEY = 'bearminion:sidebar-width'
/** Holds the active tab id while the sidebar is open, so a reload brings it back on that tab. Removed on close. */
export const SIDEBAR_OPEN_KEY = 'bearminion:sidebar-open'
const SIDEBAR_MAX_RATIO = 0.4

export function sidebarBounds(viewport: number): { min: number; max: number } {
  const width = Number.isFinite(viewport) && viewport > 0 ? viewport : 1280
  const max = Math.max(1, Math.floor(width * SIDEBAR_MAX_RATIO))
  const min = Math.min(SIDEBAR_MIN, max)
  return { min, max }
}

export function clampSidebarWidth(width: number, viewport: number): number {
  const { min, max } = sidebarBounds(viewport)
  const value = Number.isFinite(width) ? Math.round(width) : SIDEBAR_DEFAULT
  return Math.min(max, Math.max(min, value))
}
