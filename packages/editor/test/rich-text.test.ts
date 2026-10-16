// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { isSafeHref, markdownFromHtml, renderRichText, sanitizeRichHtml, stripPlainRich } from '../src/rich-text.js'

describe('renderRichText', () => {
  it('renders bold, italic, paragraphs, and line breaks', () => {
    expect(renderRichText('Hello **world**')).toBe('<p>Hello <strong>world</strong></p>')
    expect(renderRichText('A *kind* note')).toBe('<p>A <em>kind</em> note</p>')
    expect(renderRichText('***both***')).toBe('<p><strong><em>both</em></strong></p>')
    expect(renderRichText('one\ntwo')).toBe('<p>one<br>two</p>')
    expect(renderRichText('one\n\ntwo')).toBe('<p>one</p><p>two</p>')
  })

  it('escapes raw HTML and drops unsafe links', () => {
    expect(renderRichText('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(renderRichText('[click](javascript:alert(1))')).toBe('<p>click</p>')
    expect(renderRichText('[click](data:text/html,hi)')).toBe('<p>click</p>')
    expect(renderRichText('[x](https://evil.test/"><script>)')).toBe('<p>x</p>')
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
  })

  it('marks external links and leaves in-page links on the same tab', () => {
    expect(renderRichText('[docs](https://astro.build)')).toBe(
      '<p><a href="https://astro.build" target="_blank" rel="noopener noreferrer">docs</a></p>',
    )
    expect(renderRichText('[home](/about)')).toBe('<p><a href="/about">home</a></p>')
    expect(renderRichText('[contact](#contact)')).toBe('<p><a href="#contact">contact</a></p>')
    expect(renderRichText('[mail](mailto:hi@example.com)')).toBe('<p><a href="mailto:hi@example.com">mail</a></p>')
    expect(renderRichText('[docs](https://astro.build){new}')).toBe(
      '<p><a href="https://astro.build" data-new-tab="true" target="_blank" rel="noopener noreferrer">docs</a></p>',
    )
    expect(renderRichText('[docs](https://astro.build){same}')).toBe('<p><a href="https://astro.build" data-new-tab="false">docs</a></p>')
    expect(renderRichText('[home](/about){new}')).toBe(
      '<p><a href="/about" data-new-tab="true" target="_blank" rel="noopener noreferrer">home</a></p>',
    )
  })

  it('renders bulleted and numbered lists', () => {
    expect(renderRichText('- Alpha\n- Beta **bold**')).toBe('<ul><li>Alpha</li><li>Beta <strong>bold</strong></li></ul>')
    expect(renderRichText('1. One\n2. Two')).toBe('<ol><li>One</li><li>Two</li></ol>')
    expect(renderRichText('Intro\n\n- Alpha\n\nAfter')).toBe('<p>Intro</p><ul><li>Alpha</li></ul><p>After</p>')
  })
})

describe('markdownFromHtml', () => {
  it('round-trips the toolbar subset', () => {
    const samples = [
      'Plain sentence.',
      'Hello **world**',
      'A *kind* note',
      '***both***',
      'See [docs](https://astro.build) today',
      'Jump to [contact](#contact)',
      'line one\nline two',
      'first\n\nsecond',
      'Mix **bold** and *italic* in [a link](/about).',
      '- Alpha\n- Beta **bold**',
      '1. One\n2. Two',
      'Intro\n\n- Alpha\n\nAfter',
    ]
    for (const sample of samples) {
      expect(markdownFromHtml(renderRichText(sample))).toBe(sample)
    }
  })

  it('serializes formatted DOM the browser produces', () => {
    expect(markdownFromHtml('<p>Hello <strong>there</strong></p>')).toBe('Hello **there**')
    expect(markdownFromHtml('<div>one</div><div>two</div>')).toBe('one\n\ntwo')
    expect(markdownFromHtml('a<br>b')).toBe('a\nb')
    expect(markdownFromHtml('<span style="font-weight: bold">Bold</span>')).toBe('**Bold**')
    expect(markdownFromHtml('<a href="javascript:alert(1)">nope</a>')).toBe('nope')
    expect(markdownFromHtml('<script>alert(1)</script>kept')).toBe('kept')
    expect(markdownFromHtml('<ul><li>Alpha</li><li>Beta <strong>x</strong></li></ul>')).toBe('- Alpha\n- Beta **x**')
    expect(markdownFromHtml('<ol><li>One</li><li>Two</li></ol>')).toBe('1. One\n2. Two')
    expect(markdownFromHtml('<h2>Nope</h2><p>Keep</p><img src="/x.png" alt="pic">')).toBe('Keep')
  })

  it('reads malformed and hostile HTML through the DOM', () => {
    expect(markdownFromHtml('<a title="x>y" href="/a">link</a>')).toBe('[link](/a)')
    expect(markdownFromHtml('<!-- note --><b>bold<i>both</b></i> tail')).toBe('**bold*both*** tail')
    expect(markdownFromHtml('<svg><g onload="alert(1)">x</g></svg>after')).toBe('after')
    expect(markdownFromHtml('Fish &amp; chips&nbsp;now')).toBe('Fish & chips now')
  })

  it('keeps nothing from pasted HTML but the subset', () => {
    const pasted =
      '<div onclick="steal()"><p style="color:red">Hi <a href="/x" onmouseover="x()">there</a></p><details open ontoggle="x()">d</details><object data="/evil.swf"></object></div>'
    const clean = sanitizeRichHtml(pasted)
    expect(clean).toBe('<p>Hi <a href="/x">there</a></p><p>d</p>')
    expect(clean).not.toMatch(/on\w+=|style=|object/)
  })

  it('strips pasted headings and images', () => {
    expect(sanitizeRichHtml('<h2>Nope</h2><p>Keep me</p><img src="/x.png"><ul><li>Listed</li></ul>')).toBe(
      '<p>Keep me</p><ul><li>Listed</li></ul>',
    )
    expect(stripPlainRich('# Nope\nKeep me\n![pic](/x.png)\n- Listed')).toBe('\nKeep me\n\n- Listed')
  })
})
