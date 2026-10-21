import { describe, expect, it } from 'vitest'
import { parseMediaSource } from '../../templates/default/src/components/sections/media/source'
import { stepColumns } from '../../templates/default/src/components/sections/steps/icons'

describe('media sources', () => {
  it('embeds YouTube through youtube-nocookie.com, with its thumbnail as the fallback cover', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=abc123DEF_-',
      'https://youtube.com/watch?feature=share&v=abc123DEF_-',
      'https://youtu.be/abc123DEF_-?t=10',
      'https://m.youtube.com/shorts/abc123DEF_-',
    ]) {
      expect(parseMediaSource(link), link).toEqual({
        kind: 'youtube',
        id: 'abc123DEF_-',
        embed: 'https://www.youtube-nocookie.com/embed/abc123DEF_-?autoplay=1&rel=0',
        thumbnail: 'https://i.ytimg.com/vi/abc123DEF_-/hqdefault.jpg',
      })
    }
  })

  it('embeds Vimeo with Do Not Track', () => {
    expect(parseMediaSource('https://vimeo.com/76979871')).toEqual({
      kind: 'vimeo',
      id: '76979871',
      embed: 'https://player.vimeo.com/video/76979871?autoplay=1&dnt=1',
    })
  })

  it('plays video files in a video element and refuses everything else', () => {
    expect(parseMediaSource(' /videos/demo.webm ')).toEqual({ kind: 'file', src: '/videos/demo.webm' })
    expect(parseMediaSource('https://example.com/watch?v=abcdefghijk')).toBeNull()
    expect(parseMediaSource('//cdn.example.com/a.mp4')).toBeNull()
    expect(parseMediaSource('javascript:alert(1)//.mp4')).toBeNull()
  })
})

describe('step grid', () => {
  it('has a column rule for every count the section allows, and never more columns than steps', () => {
    for (let count = 2; count <= 6; count += 1) {
      const rule = stepColumns[count]
      expect(rule, `${count}`).toBeTruthy()
      const columns = [...(rule ?? '').matchAll(/grid-cols-(\d)/g)].map((match) => Number(match[1]))
      expect(Math.max(...columns)).toBe(count)
      // No orphans: every column count divides the number of steps.
      for (const value of columns) expect(count % value, `${count} in ${value}`).toBe(0)
    }
  })
})
