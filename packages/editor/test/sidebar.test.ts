import { describe, expect, it } from 'vitest'
import { SIDEBAR_DEFAULT, SIDEBAR_MIN, clampSidebarWidth, sidebarBounds } from '../src/sidebar.js'

describe('sidebar width', () => {
  it('clamps between 380px and 40% of the viewport', () => {
    expect(sidebarBounds(1280)).toEqual({ min: SIDEBAR_MIN, max: 512 })
    expect(clampSidebarWidth(SIDEBAR_DEFAULT, 1280)).toBe(440)
    expect(clampSidebarWidth(100, 1280)).toBe(380)
    expect(clampSidebarWidth(900, 1280)).toBe(512)
  })

  it('shrinks the minimum when 40% of the viewport is under 380px', () => {
    expect(sidebarBounds(700)).toEqual({ min: 280, max: 280 })
    expect(clampSidebarWidth(440, 700)).toBe(280)
  })
})
