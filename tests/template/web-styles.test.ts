import { describe, expect, it } from 'vitest'
import { classesInCss, missingClasses, unescapeClass, usesClass } from '../../apps/web/scripts/check-styles.mjs'

describe('bearminion.com style check', () => {
  it('reads class names out of selectors, unescaped, and skips numbers and strings in values', () => {
    const css = [
      '.flex{display:flex}',
      '.md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.\\[\\&_code\\]\\:bg-bg code{background:var(--bg)}',
      '.\\32 xl\\:p-4{padding:1rem}',
      '.group:hover .group-hover\\:underline{text-decoration:underline}',
      '.p-2{padding:.5rem;margin:0.25em}',
      '@font-face{src:url(font.woff2) format("woff2.x")}',
      '.a{content:".not-a-class"}',
    ].join('')
    expect([...classesInCss(css)].sort()).toEqual(
      ['2xl:p-4', '[&_code]:bg-bg', 'a', 'flex', 'group', 'group-hover:underline', 'md:grid-cols-2', 'p-2'].sort(),
    )
    expect(unescapeClass('w-1\\/2')).toBe('w-1/2')
  })

  it('matches whole class tokens only', () => {
    const source = `<div class="flex md:grid-cols-2" />\nconst x = { hidden: true }\nclass:list={['p-2', open && 'block']}`
    expect(usesClass(source, 'flex')).toBe(true)
    expect(usesClass(source, 'md:grid-cols-2')).toBe(true)
    expect(usesClass(source, 'p-2')).toBe(true)
    expect(usesClass(source, 'grid-cols-2')).toBe(false)
    expect(usesClass(source, 'hidden')).toBe(false)
  })

  it('reports a template class the site lacks only when the site code uses it', () => {
    const template = '.flex{display:flex}.grid{display:grid}.story-only{color:red}'
    const sources = [{ path: 'src/components/Card.astro', text: '<div class="flex grid">' }]
    expect(missingClasses(template, '.flex{display:flex}.grid{display:grid}', sources)).toEqual([])
    expect(missingClasses(template, '.flex{display:flex}', sources)).toEqual([{ name: 'grid', file: 'src/components/Card.astro' }])
  })
})
