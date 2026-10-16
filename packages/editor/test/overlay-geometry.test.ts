import { describe, expect, it } from 'vitest'
import type { SectionDraft } from '../src/draft.js'
import type { OverlayMetrics } from '../src/ui/state/layout.js'
import { findSeams, imageBarTop, nearestSeam, seamName } from '../src/ui/state/overlay.js'

const section = (id: string, type = id): SectionDraft => ({ id, type, props: {} }) as SectionDraft

/** A DOMRect stand-in: the geometry only reads its edges. */
function box(top: number, bottom: number, left = 0, right = 1000): DOMRect {
  return { top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }
}

function metrics(sections: Record<string, DOMRect>, viewportHeight = 800): OverlayMetrics {
  return {
    viewportWidth: 1200,
    viewportHeight,
    pinTop: 0,
    dockBottom: 0,
    sections: new Map(Object.entries(sections)),
    footer: null,
    field: null,
    fieldRect: null,
    pointer: null,
  }
}

describe('findSeams', () => {
  const sections = [section('hero'), section('logos'), section('cta')]

  it('puts a seam above the first section, halfway across each gap, and below the last', () => {
    const seams = findSeams(sections, metrics({ hero: box(20, 300), logos: box(320, 500), cta: box(500, 700) }), 1000)
    expect(seams.map(({ y, id, where }) => [y, id, where])).toEqual([
      [20, 'hero', 'above'],
      [310, 'hero', 'below'],
      [500, 'logos', 'below'],
      [700, 'cta', 'below'],
    ])
  })

  it('drops seams within 8px of the viewport edges', () => {
    const seams = findSeams(sections, metrics({ hero: box(2, 300), logos: box(300, 500), cta: box(500, 795) }), 1000)
    expect(seams.map((seam) => seam.y)).toEqual([300, 500])
  })

  it('stops the line at the sidebar edge', () => {
    const [seam] = findSeams([section('hero')], metrics({ hero: box(100, 300, -20, 1200) }), 760)
    expect(seam).toMatchObject({ left: 0, right: 760 })
  })

  it('skips sections that are not in the DOM', () => {
    expect(findSeams(sections, metrics({ logos: box(100, 200) }), 1000).map((seam) => seam.id)).toEqual(['logos'])
  })
})

describe('nearestSeam', () => {
  const seams = findSeams([section('a'), section('b')], metrics({ a: box(100, 300), b: box(300, 500) }), 1000)

  it('picks the closest seam within 16px of the pointer', () => {
    expect(nearestSeam(seams, { x: 400, y: 290 }, 1000)).toMatchObject({ id: 'a', where: 'below', y: 300 })
    expect(nearestSeam(seams, { x: 400, y: 116 }, 1000)).toMatchObject({ id: 'a', where: 'above' })
  })

  it('shows nothing away from a seam or over the sidebar', () => {
    expect(nearestSeam(seams, { x: 400, y: 200 }, 1000)).toBeNull()
    expect(nearestSeam(seams, { x: 1100, y: 300 }, 1000)).toBeNull()
  })
})

describe('seamName', () => {
  const sections = [section('hero'), section('logos'), section('cta')]
  const labels = { hero: 'Hero', logos: 'Logo strip', cta: 'Call to action' }

  it('names the seam by its neighbours', () => {
    expect(seamName(sections, labels, 'hero', 'above')).toBe('before Hero')
    expect(seamName(sections, labels, 'hero', 'below')).toBe('between Hero and Logo strip')
    expect(seamName(sections, labels, 'logos', 'above')).toBe('between Hero and Logo strip')
    expect(seamName(sections, labels, 'cta', 'below')).toBe('after Call to action')
  })

  it('falls back to the section type and to nothing for an unknown id', () => {
    expect(seamName(sections, {}, 'cta', 'below')).toBe('after cta')
    expect(seamName(sections, labels, 'missing', 'above')).toBe('')
  })
})

describe('imageBarTop', () => {
  it('sits 8px inside the top of the image', () => {
    expect(imageBarTop(box(200, 600), 8)).toBe(208)
  })

  it('stays below the dock when the image top is under it or scrolled past', () => {
    expect(imageBarTop(box(10, 600), 60)).toBe(60)
    expect(imageBarTop(box(-300, 600), 60)).toBe(60)
  })

  it('hides when the visible part of the image cannot hold the bar below the dock', () => {
    expect(imageBarTop(box(-300, 100), 60)).toBeNull()
  })
})
