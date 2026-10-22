import { describe, expect, it } from 'vitest'
import { formatJsonLd, jsonLdWarnings, parseJsonLdInput } from '../src/index.js'

const article = { '@context': 'https://schema.org', '@type': 'Article', headline: 'Hello' }

describe('parseJsonLdInput', () => {
  it('treats empty input as no custom JSON-LD', () => {
    expect(parseJsonLdInput('  \n')).toEqual({ ok: true, value: [] })
    expect(parseJsonLdInput('[]')).toEqual({ ok: true, value: [] })
  })

  it('accepts one object, an array, and an @graph object', () => {
    expect(parseJsonLdInput(JSON.stringify(article))).toEqual({ ok: true, value: [article] })
    expect(parseJsonLdInput(JSON.stringify([article, article]))).toEqual({ ok: true, value: [article, article] })
    const graph = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'X' }] }
    expect(parseJsonLdInput(JSON.stringify(graph))).toEqual({ ok: true, value: [graph] })
  })

  it('unwraps a pasted script tag', () => {
    const pasted = `<script type="application/ld+json">\n${JSON.stringify(article)}\n</script>`
    expect(parseJsonLdInput(pasted)).toEqual({ ok: true, value: [article] })
    expect(parseJsonLdInput(`<SCRIPT TYPE='application/ld+json' id="x">${JSON.stringify(article)}</SCRIPT>`)).toEqual({
      ok: true,
      value: [article],
    })
  })

  it('reports invalid JSON and non-object values', () => {
    const broken = parseJsonLdInput('{"@type": "Article",}')
    expect(broken.ok).toBe(false)
    expect(parseJsonLdInput('"text"')).toMatchObject({ ok: false })
    expect(parseJsonLdInput('[1, 2]')).toMatchObject({ ok: false })
    expect(parseJsonLdInput('[[{}]]')).toMatchObject({ ok: false })
  })

  it('does not unwrap other script tags', () => {
    expect(parseJsonLdInput('<script>alert(1)</script>')).toMatchObject({ ok: false })
  })
})

describe('formatJsonLd', () => {
  it('shows one block as an object and several as an array', () => {
    expect(formatJsonLd(undefined)).toBe('')
    expect(formatJsonLd([])).toBe('')
    expect(JSON.parse(formatJsonLd([article]))).toEqual(article)
    expect(JSON.parse(formatJsonLd([article, article]))).toEqual([article, article])
  })

  it('round-trips through the parser', () => {
    expect(parseJsonLdInput(formatJsonLd([article, article]))).toEqual({ ok: true, value: [article, article] })
  })
})

describe('jsonLdWarnings', () => {
  it('flags a missing context or type but not a graph', () => {
    expect(jsonLdWarnings([article])).toEqual([])
    expect(jsonLdWarnings([{ '@context': 'https://schema.org', '@graph': [] }])).toEqual([])
    expect(jsonLdWarnings([{ name: 'x' }])).toHaveLength(2)
  })
})
