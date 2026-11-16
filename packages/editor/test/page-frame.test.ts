// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { FRAMED_ATTR, PINNED_ATTR, frameCss, framePage, pageScroller } from '../src/ui/page-frame.js'

const rect = { top: 56, left: 248, width: 840, height: 844 }

describe('the page frame', () => {
  afterEach(() => framePage(null))

  it('puts <body> at the canvas and makes it the scroller', () => {
    const css = frameCss(rect)
    expect(css).toContain('top: 56px !important')
    expect(css).toContain('left: 248px !important')
    expect(css).toContain('width: 840px !important')
    expect(css).toContain('transform: translateZ(0) !important')
    // A site's own scroll lock on <html> behind a modal still holds.
    expect(css).toContain(':has(dialog:modal) > body { overflow: hidden !important; }')
  })

  it('frames and unframes the page, with one style element', () => {
    framePage(rect)
    expect(document.documentElement.hasAttribute(FRAMED_ATTR)).toBe(true)
    expect(pageScroller()).toBe(document.body)
    framePage({ ...rect, left: 64 })
    expect(document.querySelectorAll('#bearminion-shell-frame')).toHaveLength(1)
    expect(document.getElementById('bearminion-shell-frame')?.textContent).toContain('left: 64px')
    framePage(null)
    expect(document.documentElement.hasAttribute(FRAMED_ATTR)).toBe(false)
    expect(document.getElementById('bearminion-shell-frame')).toBeNull()
  })

  it("keeps the site's fixed elements in place while <body> scrolls", () => {
    const banner = document.createElement('div')
    banner.style.cssText = 'position: fixed; bottom: 16px; margin-bottom: 4px'
    const block = document.createElement('div')
    document.body.append(banner, block)
    framePage(rect)
    expect(banner.hasAttribute(PINNED_ATTR)).toBe(true)
    expect(block.hasAttribute(PINNED_ATTR)).toBe(false)
    // The site's own margin is kept and the scroll distance is added on top of it.
    expect(banner.style.getPropertyValue('--bearminion-pin-mb')).toBe('4px')
    expect(frameCss(rect)).toContain(
      `[${PINNED_ATTR}] { margin-top: calc(var(--bearminion-pin-mt, 0px) + var(--bearminion-page-scroll, 0px))`,
    )
    document.body.scrollTop = 300
    document.body.dispatchEvent(new Event('scroll'))
    expect(document.documentElement.style.getPropertyValue('--bearminion-page-scroll')).toBe('300px')
    framePage(null)
    expect(banner.hasAttribute(PINNED_ATTR)).toBe(false)
    expect(banner.style.getPropertyValue('--bearminion-pin-mb')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--bearminion-page-scroll')).toBe('')
    banner.remove()
    block.remove()
  })
})
