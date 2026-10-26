import { describe, expect, it } from 'vitest'
import { describeVideoLink } from '../src/ui/forms/video-source.js'

describe('describeVideoLink', () => {
  it('says nothing for an empty link', () => {
    expect(describeVideoLink('  ')).toBeNull()
  })

  it('names what plays', () => {
    expect(describeVideoLink('https://youtu.be/abcdefghijk')).toMatchObject({ ok: true, text: expect.stringContaining('YouTube') })
    expect(describeVideoLink('https://vimeo.com/76979871')).toMatchObject({ ok: true, text: expect.stringContaining('Vimeo') })
    expect(describeVideoLink('/videos/demo.webm')).toEqual({ ok: true, text: 'Video file.' })
  })

  it('explains what does not play', () => {
    expect(describeVideoLink('https://example.com/watch')).toMatchObject({ ok: false, text: expect.stringContaining('page link') })
    expect(describeVideoLink('demo.webm')).toMatchObject({ ok: false, text: expect.stringContaining('path in public/') })
  })
})
