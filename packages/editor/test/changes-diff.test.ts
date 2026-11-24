import { describe, expect, it } from 'vitest'
import { describePageDiff, describeSiteDiff, fieldName } from '../src/changes.js'

const section = (id: string, type: string, anchor: string, props: Record<string, unknown>) => ({ id, type, anchor, props })

describe('version diff', () => {
  it('names fields the way people say them', () => {
    expect(fieldName('props.primary.href')).toBe('main button link')
    expect(fieldName('props.items.1.cta.label')).toBe('item 2 › button text')
    expect(fieldName('props.heading')).toBe('heading')
    expect(fieldName('props.someNewThing')).toBe('some new thing')
    expect(fieldName('seo.title')).toBe('SEO title')
  })

  it('describes a page: sections added and removed, then each changed value with its raw path', () => {
    const before = {
      title: 'Home',
      sections: [
        section('a', 'hero', 'intro', { primary: { href: '/#contact', label: 'Talk' } }),
        section('b', 'stats', 'stats', {}),
        section('c', 'pricing', 'pricing', {}),
      ],
    }
    const after = {
      title: 'Home',
      sections: [
        section('a', 'hero', 'intro', { primary: { href: 'mailto:hello@example.com', label: 'Talk' } }),
        section('d', 'steps', 'steps', {}),
      ],
    }
    const diff = describePageDiff(before, after, { hero: 'Hero', stats: 'Stats', pricing: 'Pricing', steps: 'Steps' })
    expect(diff.sectionsAdded).toEqual(['Steps'])
    expect(diff.sectionsRemoved).toEqual(['Stats', 'Pricing'])
    expect(diff.rows).toEqual([
      {
        label: 'Hero · main button link',
        path: '#intro › primary › href',
        kind: 'changed',
        is: 'link',
        before: '/#contact',
        after: 'mailto:hello@example.com',
      },
    ])
    expect(diff.summary).toBe('1 section added · 2 removed · 1 link changed')
  })

  it('labels page fields and site fields', () => {
    expect(describePageDiff({ title: 'A' }, { title: 'B' }).rows[0]).toMatchObject({ label: 'Title', path: 'title', is: 'field' })
    const site = describeSiteDiff({ header: { links: [{ label: 'Blog' }] } }, { header: { links: [{ label: 'News' }] } })
    expect(site.rows[0]).toMatchObject({ label: 'Header · link 1 › text', path: 'header › links › #1 › label' })
    expect(site.summary).toBe('1 field changed')
    expect(describeSiteDiff({}, {}).summary).toBe('')
  })
})
