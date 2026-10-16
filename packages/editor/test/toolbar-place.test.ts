import { describe, expect, it } from 'vitest'
import { fitPopover, placeSectionToolbar, stickyHeaderPin, type SectionToolbarPlaceInput } from '../src/toolbar-place.js'

const base: SectionToolbarPlaceInput = {
  sectionTop: 200,
  sectionBottom: 900,
  sectionLeft: 32,
  toolbarWidth: 300,
  toolbarHeight: 40,
  pinTop: 72,
  viewportHeight: 900,
  contentRight: 1280,
}

describe('placeSectionToolbar', () => {
  it('glues the toolbar to the section top while that edge is below the pin', () => {
    expect(placeSectionToolbar(base)).toEqual({ visible: true, top: 200, left: 32 })
  })

  it('pins under the header once the section top scrolls past', () => {
    const place = placeSectionToolbar({ ...base, sectionTop: -180, sectionBottom: 520 })
    expect(place).toEqual({ visible: true, top: 72, left: 32 })
    expect(place.top + base.toolbarHeight).toBeLessThanOrEqual(520)
  })

  it('hides when a stuck toolbar would cross into the next section', () => {
    const place = placeSectionToolbar({ ...base, sectionTop: -400, sectionBottom: 100 })
    expect(place.visible).toBe(false)
    expect(72 + base.toolbarHeight).toBeGreaterThan(100)
  })

  it('hides when the section has left the viewport', () => {
    expect(placeSectionToolbar({ ...base, sectionTop: -800, sectionBottom: 72 }).visible).toBe(false)
    expect(placeSectionToolbar({ ...base, sectionTop: 900, sectionBottom: 1400 }).visible).toBe(false)
  })

  it('stays visible on a short section that is still below the pin', () => {
    const place = placeSectionToolbar({ ...base, sectionTop: 80, sectionBottom: 100 })
    expect(place).toMatchObject({ visible: true, top: 80, left: 32 })
  })

  it('shifts left so an open sidebar does not cover the toolbar', () => {
    const place = placeSectionToolbar({
      ...base,
      sectionLeft: 700,
      toolbarWidth: 360,
      contentRight: 840,
    })
    expect(place.visible).toBe(true)
    expect(place.left + 360).toBeLessThanOrEqual(840)
    expect(place.top).toBe(200)
  })

  it('keeps the section left edge when the toolbar fits beside the sidebar', () => {
    expect(placeSectionToolbar({ ...base, contentRight: 840 }).left).toBe(32)
  })
})

describe('fitPopover', () => {
  it('pulls a popover up when it would extend past the viewport', () => {
    expect(fitPopover({ top: 700, left: 40, width: 280, height: 420, viewportWidth: 1280, viewportHeight: 900 })).toEqual({
      top: 472,
      left: 40,
    })
  })
})

describe('stickyHeaderPin', () => {
  it('uses the bottom of a header stuck to the viewport', () => {
    expect(stickyHeaderPin({ position: 'sticky', top: 0, bottom: 72 })).toBe(72)
    expect(stickyHeaderPin({ position: 'fixed', top: 0, bottom: 56 })).toBe(56)
  })

  it('ignores a header that is not pinned to the top', () => {
    expect(stickyHeaderPin(null)).toBe(0)
    expect(stickyHeaderPin({ position: 'static', top: 0, bottom: 72 })).toBe(0)
    expect(stickyHeaderPin({ position: 'sticky', top: 24, bottom: 96 })).toBe(0)
    expect(stickyHeaderPin({ position: 'sticky', top: -80, bottom: -8 })).toBe(0)
  })
})
