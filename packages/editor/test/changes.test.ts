import { describe, expect, it } from 'vitest'
import { describePageChanges, describeSiteChanges, fieldLabel, groupChanges } from '../src/changes.js'

const hero = (heading: string, extra: object = {}) => ({
  id: 'hero',
  type: 'hero',
  anchor: 'intro',
  props: { heading, ...extra },
})

describe('changes', () => {
  it('labels paths in words', () => {
    expect(fieldLabel('props.plans.1.cta.label')).toBe('plans › #2 › cta › label')
    expect(fieldLabel('seo.ogImage')).toBe('seo › og image')
  })

  it('reports nothing when nothing differs', () => {
    const page = { slug: 'index', title: 'Home', sections: [hero('Hi')] }
    expect(describePageChanges(page, structuredClone(page))).toEqual([])
  })

  it('describes page, section and structure changes', () => {
    const saved = { slug: 'index', title: 'Home', sections: [hero('Hi'), { id: 'faq', type: 'faq', props: {} }] }
    const draft = {
      slug: 'index',
      title: 'Start',
      sections: [{ id: 'faq', type: 'faq', props: {} }, hero('Hello', { sub: 'More' }), { id: 'cta', type: 'cta', props: {} }],
    }
    const entries = describePageChanges(saved, draft, { hero: 'Hero', cta: 'Call to action' })
    expect(entries).toContainEqual({ area: 'Page', field: 'title', kind: 'changed', before: 'Home', after: 'Start' })
    expect(entries).toContainEqual({ area: 'Hero · #intro', field: 'heading', kind: 'changed', before: 'Hi', after: 'Hello' })
    expect(entries).toContainEqual({ area: 'Hero · #intro', field: 'sub', kind: 'added', after: 'More' })
    expect(entries).toContainEqual({ area: 'Sections', field: 'Call to action added', kind: 'added' })
    expect(entries).toContainEqual({ area: 'Sections', field: 'Order changed', kind: 'changed' })
  })

  it('reports a removed section', () => {
    const saved = { slug: 'index', title: 'Home', sections: [hero('Hi')] }
    const draft = { slug: 'index', title: 'Home', sections: [] }
    expect(describePageChanges(saved, draft, { hero: 'Hero' })).toEqual([
      { area: 'Sections', field: 'Hero · #intro removed', kind: 'removed' },
    ])
  })

  it('groups site changes by area and shortens long values', () => {
    const long = 'x'.repeat(200)
    const entries = describeSiteChanges(
      { name: 'A', header: { sticky: true } },
      { name: long, header: { sticky: false }, url: 'https://a.test' },
    )
    const groups = groupChanges(entries)
    expect(groups.map((group) => group.area)).toEqual(['Brand', 'Header', 'Site'])
    expect(groups[0]?.entries[0]?.after?.length).toBeLessThanOrEqual(48)
  })
})
