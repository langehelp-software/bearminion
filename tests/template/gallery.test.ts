import { describe, expect, it } from 'vitest'
import { gallery, galleryCounts } from '../../templates/default/src/components/sections/gallery/definition'
import { stepIndex, swipeStep } from '../../templates/default/src/components/sections/gallery/lightbox'

const picture = (n: number) => ({ src: `src/assets/uploads/p${n}.png`, alt: `Picture ${n}` })
const parse = (props: Record<string, unknown>) => gallery.schema.safeParse({ ...gallery.defaults, ...props })

describe('gallery schema', () => {
  it('accepts the defaults and a caption on a picture', () => {
    expect(parse({}).success).toBe(true)
    expect(parse({ images: [{ ...picture(1), caption: 'On the harbour' }] }).success).toBe(true)
  })

  it('needs alt text on every picture', () => {
    expect(parse({ images: [{ src: 'a.png', alt: '' }] }).success).toBe(false)
  })

  it('holds 1 to 24 pictures', () => {
    expect(parse({ images: [] }).success).toBe(false)
    expect(parse({ images: Array.from({ length: galleryCounts.images.max }, (_, n) => picture(n)) }).success).toBe(true)
    expect(parse({ images: Array.from({ length: galleryCounts.images.max + 1 }, (_, n) => picture(n)) }).success).toBe(false)
  })

  it('defaults to three columns with the lightbox on, and takes only 2, 3 or 4', () => {
    const parsed = gallery.schema.parse({ images: [picture(1)] })
    expect([parsed.columns, parsed.lightbox, parsed.frame]).toEqual(['3', true, false])
    expect(parse({ columns: '5' }).success).toBe(false)
  })
})

describe('lightbox steps', () => {
  it('wraps at both ends', () => {
    expect(stepIndex(0, -1, 5)).toBe(4)
    expect(stepIndex(4, 1, 5)).toBe(0)
    expect(stepIndex(2, 1, 5)).toBe(3)
    expect(stepIndex(0, 1, 0)).toBe(0)
  })

  it('reads a swipe as a mostly horizontal drag', () => {
    expect(swipeStep(-80, 5)).toBe(1)
    expect(swipeStep(80, -5)).toBe(-1)
    expect(swipeStep(20, 0)).toBe(0)
    expect(swipeStep(-60, 70)).toBe(0)
  })
})
