import { describe, expect, it } from 'vitest'
import {
  addListItem,
  addNavChild,
  addSection,
  applyPendingEdits,
  editField,
  canAddItems,
  canRemoveItems,
  duplicateSection,
  imageSrcPath,
  indentNav,
  isImageField,
  isMultilineField,
  linkWarning,
  moveSection,
  nextSectionId,
  outdentNav,
  pageHref,
  removeListItem,
  removeSection,
  reorderList,
  reorderListAt,
  sectionFromDefaults,
  setField,
  slugFromPath,
  suggestAnchor,
  type PageDraft,
} from '../src/draft.js'

const page = (): PageDraft => ({
  slug: 'index',
  title: 'Home',
  seo: { title: 'Home', description: '' },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      variant: 'split',
      tone: 'base',
      props: { heading: 'Content lives in git.', items: ['one'] },
    },
    { id: 'cta', type: 'cta', variant: 'band', tone: 'base', props: { heading: 'Clone' } },
  ],
})

describe('field paths', () => {
  it('updates a nested field without mutating the original', () => {
    const original = page()
    const next = setField(original, 'sections.0.props.heading', 'Edited')
    expect(original.sections[0]?.props.heading).toBe('Content lives in git.')
    expect((next as PageDraft).sections[0]?.props.heading).toBe('Edited')
  })

  it('updates site options and navigation labels by path', () => {
    const site = { name: 'BearMinion', theme: { mode: 'light' }, header: { links: [{ label: 'Home', href: '/' }] } }
    const named = setField(site, 'name', 'Demo') as typeof site
    const mode = setField(named, 'theme.mode', 'dark') as typeof site
    const label = setField(mode, 'header.links.0.label', 'Start') as typeof site
    expect(label).toMatchObject({
      name: 'Demo',
      theme: { mode: 'dark' },
      header: { links: [{ label: 'Start', href: '/' }] },
    })
  })

  it('treats image alt paths as image fields and points at src', () => {
    expect(isImageField('sections.0.props.image.alt')).toBe(true)
    expect(isImageField('sections.1.props.items.0.image.alt')).toBe(true)
    expect(isImageField('logo.alt')).toBe(true)
    expect(isImageField('sections.0.props.heading')).toBe(false)
    expect(imageSrcPath('sections.0.props.image.alt')).toBe('sections.0.props.image.src')
    expect(imageSrcPath('logo.src')).toBe('logo.src')
    expect(isMultilineField('sections.0.props.body')).toBe(true)
    expect(isMultilineField('sections.0.props.heading')).toBe(false)
  })
})

describe('section operations', () => {
  it('inserts a section from design-system defaults, then duplicates, moves, and deletes it', () => {
    const start = page()
    const id = nextSectionId(start.sections, 'hero')
    expect(id).toBe('hero-2')
    const inserted = addSection(start, 1, sectionFromDefaults('hero', id, { heading: 'Content lives in git.' }, 'split', 'base'))
    expect(inserted.sections.map((section) => section.id)).toEqual(['hero', 'hero-2', 'cta'])
    expect(inserted.sections[1]?.props.heading).toBe('Content lives in git.')

    const duplicated = duplicateSection(inserted, 'hero-2')
    expect(duplicated.sections.map((section) => section.id)).toEqual(['hero', 'hero-2', 'hero-3', 'cta'])

    const moved = moveSection(duplicated, 'cta', -1)
    expect(moved.sections.map((section) => section.id)).toEqual(['hero', 'hero-2', 'cta', 'hero-3'])
    expect(moveSection(moved, 'hero', -1).sections[0]?.id).toBe('hero')

    const removed = removeSection(moved, 'hero-2')
    expect(removed.sections.map((section) => section.id)).toEqual(['hero', 'cta', 'hero-3'])
  })

  it('reorders list items and respects count rules', () => {
    const start = page()
    const added = addListItem(start, 'sections.0.props.items', 'two') as PageDraft
    expect(added.sections[0]?.props.items).toEqual(['one', 'two'])
    const reordered = reorderListAt(added, 'sections.0.props.items', 0, 1) as PageDraft
    expect(reordered.sections[0]?.props.items).toEqual(['two', 'one'])
    const removed = removeListItem(reordered, 'sections.0.props.items', 0) as PageDraft
    expect(removed.sections[0]?.props.items).toEqual(['one'])

    expect(reorderList(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    const rule = { min: 3, max: 6, exact: { variant: 'bento', count: 4 } }
    expect(canAddItems(4, rule, 'bento')).toBe(false)
    expect(canRemoveItems(4, rule, 'bento')).toBe(false)
    expect(canAddItems(6, rule, 'cards')).toBe(false)
    expect(canRemoveItems(3, rule, 'cards')).toBe(false)
    expect(canAddItems(3, rule, 'cards')).toBe(true)
  })

  it('reorders navigation and nests a child link', () => {
    const links = [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
    ]
    expect(reorderList(links, 1, 0).map((link) => link.label)).toEqual(['Pricing', 'Features'])
    const nested = addNavChild(links, 0, { label: 'About', href: '/about' })
    expect(nested[0]?.children).toEqual([{ label: 'About', href: '/about' }])
    expect(pageHref('index')).toBe('/')
    expect(pageHref('about')).toBe('/about')
    expect(slugFromPath('/about/')).toBe('about')
    expect(slugFromPath('/')).toBe('index')
  })

  it('indents and outdents navigation up to three levels', () => {
    const links = [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
    ]
    const indented = indentNav(links, [1])
    expect(indented).toHaveLength(1)
    expect(indented[0]?.children?.[0]?.label).toBe('Pricing')
    const withGrandchild = indentNav(
      [
        {
          label: 'A',
          href: '#a',
          children: [
            { label: 'B', href: '#b' },
            { label: 'C', href: '#c' },
          ],
        },
      ],
      [0, 1],
    )
    expect(withGrandchild[0]?.children?.[0]?.children?.[0]?.label).toBe('C')
    expect(indentNav(withGrandchild, [0, 0, 0])).toEqual(withGrandchild)
    const flattened = outdentNav(withGrandchild, [0, 0, 0])
    expect(flattened[0]?.children?.map((link) => link.label)).toEqual(['B', 'C'])
  })

  it('suggests unique anchors and warns about missing internal targets', () => {
    const taken = new Set(['hero'])
    expect(suggestAnchor({ type: 'hero', props: { heading: 'Content lives in git.' } }, taken)).toBe('content-lives-in-git')
    expect(suggestAnchor({ type: 'hero', props: { heading: 'Hero' } }, new Set(['hero']))).toBe('hero-2')
    const pages = [
      { slug: 'index', anchors: ['features', 'contact'] },
      { slug: 'about', anchors: ['intro'] },
    ]
    expect(linkWarning('#missing', pages, 'index')).toBe('No anchor "#missing" on this page.')
    expect(linkWarning('#features', pages, 'index')).toBeNull()
    expect(linkWarning('/missing', pages, 'index')).toBe('No page at /missing.')
    expect(linkWarning('/about#intro', pages, 'index')).toBeNull()
    expect(linkWarning('/about#nope', pages, 'index')).toBe('No anchor "#nope" on /about.')
    expect(linkWarning('https://astro.build', pages, 'index')).toBeNull()
    expect(linkWarning('#', pages, 'index')).toBeNull()
  })

  it('keeps field edits that arrive before the page or site draft exists', () => {
    const loaded = page()
    const site = { name: 'BearMinion', url: 'https://example.com' }
    const held = applyPendingEdits(null, null, [
      { path: 'sections.0.props.heading', value: 'Typed early' },
      { path: 'name', value: 'Early site' },
    ])
    expect(held.page).toBeNull()
    expect(held.site).toBeNull()
    expect(held.pending).toEqual([
      { path: 'sections.0.props.heading', value: 'Typed early' },
      { path: 'name', value: 'Early site' },
    ])
    const applied = applyPendingEdits(loaded, site, held.pending)
    expect(applied.pending).toEqual([])
    const emphasised = editField(
      { ...loaded, sections: [{ ...loaded.sections[0], props: { heading: 'Content lives in git.', em: 'git' } }] },
      'sections.0.props.heading',
      'A new title',
    ) as PageDraft
    expect(emphasised.sections[0]?.props).toEqual({ heading: 'A new title' })
    const kept = editField(
      { sections: [{ props: { heading: 'Content lives in git.', em: 'git' } }] },
      'sections.0.props.heading',
      'Content lives in git now.',
    ) as PageDraft
    expect(kept.sections[0]?.props).toEqual({
      heading: 'Content lives in git now.',
      marks: [{ start: 17, end: 20, italic: true, font: 'serif' }],
    })
    const siteNamed = editField({ name: 'BearMinion', nameEm: 'Minion' }, 'name', 'Site 1') as { name: string; nameEm?: string }
    expect(siteNamed).toEqual({ name: 'Site 1' })
    expect((applied.page as PageDraft).sections[0]?.props.heading).toBe('Typed early')
    expect((applied.page as PageDraft).sections[1]?.props.heading).toBe('Clone')
    expect(applied.site).toMatchObject({ name: 'Early site', url: 'https://example.com' })
  })

  it('gives a duplicated section a unique anchor', () => {
    const source = page()
    source.sections[0]!.anchor = 'hero'
    const copy = duplicateSection(source, 'hero')
    expect(copy.sections[1]?.id).not.toBe('hero')
    expect(copy.sections[1]?.anchor).toBe('hero-2')
  })
})
