/** Where the section toolbar sits. Pure so scroll behavior can be tested without a browser. */

export interface SectionToolbarPlaceInput {
  sectionTop: number
  sectionBottom: number
  sectionLeft: number
  toolbarWidth: number
  toolbarHeight: number
  /** Y of the pin line. A sticky site header uses its bottom; otherwise 0. */
  pinTop: number
  viewportHeight: number
  /** Right edge of the page content. An open sidebar pulls this in. */
  contentRight: number
  /** Default true: pin under `pinTop` while the section's top edge is scrolled past. False lets the bar scroll away with its section. */
  sticky?: boolean
  /** Gap in px between the section's top-left corner and the bar. Default 0. */
  inset?: number
}

export interface SectionToolbarPlace {
  visible: boolean
  top: number
  left: number
}

function hiddenToolbar(): SectionToolbarPlace {
  return { visible: false, top: 0, left: 0 }
}

/**
 * Glue the toolbar to the section's top edge. Once that edge scrolls above
 * `pinTop`, pin the toolbar there until the section can no longer hold it,
 * then hide it so it does not cover the header or the next section's toolbar.
 */
export function placeSectionToolbar(input: SectionToolbarPlaceInput): SectionToolbarPlace {
  const { sectionTop, sectionBottom, sectionLeft, toolbarWidth, toolbarHeight, pinTop, viewportHeight, contentRight } = input
  const sticky = input.sticky ?? true
  const inset = input.inset ?? 0
  if (
    !(toolbarHeight > 0) ||
    !(toolbarWidth > 0) ||
    !(sectionBottom > sectionTop) ||
    sectionBottom <= pinTop ||
    sectionTop >= viewportHeight
  ) {
    return hiddenToolbar()
  }

  if (!sticky) {
    const top = sectionTop + inset
    if (top + toolbarHeight > sectionBottom || top + toolbarHeight <= pinTop || top >= viewportHeight) {
      return hiddenToolbar()
    }
    let left = sectionLeft + inset
    const overflow = left + toolbarWidth - contentRight
    if (overflow > 0) left -= overflow
    return { visible: true, top, left: Math.max(left, 0) }
  }

  const top = sectionTop >= pinTop ? sectionTop : pinTop
  // While stuck, the toolbar stays inside this section. Hiding it as the
  // section ends keeps it off the next section's top edge.
  if (sectionTop < pinTop && top + toolbarHeight > sectionBottom) return hiddenToolbar()

  let left = sectionLeft
  const overflow = left + toolbarWidth - contentRight
  if (overflow > 0) left -= overflow
  if (left < 0) left = 0
  return { visible: true, top, left }
}

/** Shift a popover so its box stays inside the viewport. */
export function fitPopover(input: {
  top: number
  left: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}): { top: number; left: number } {
  const margin = input.margin ?? 8
  const maxTop = Math.max(margin, input.viewportHeight - input.height - margin)
  const maxLeft = Math.max(margin, input.viewportWidth - input.width - margin)
  return {
    top: Math.min(Math.max(input.top, margin), maxTop),
    left: Math.min(Math.max(input.left, margin), maxLeft),
  }
}

/** Pin offset for a sticky or fixed header that is currently at the viewport top. */
export function stickyHeaderPin(header: { position: string; top: number; bottom: number } | null): number {
  if (!header) return 0
  if (header.position !== 'sticky' && header.position !== 'fixed') return 0
  if (header.top > 1 || header.bottom <= 0) return 0
  return header.bottom
}
