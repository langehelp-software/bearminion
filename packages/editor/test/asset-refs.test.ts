import { describe, expect, it } from 'vitest'
import { draftImageUsages } from '../src/asset-paths.js'
import { assetFile, assetRefs, describePageRef, describeSiteRef, isAssetPath, missingAssetIssues } from '../src/asset-refs.js'

describe('isAssetPath', () => {
  it('accepts image files under src/assets only', () => {
    expect(isAssetPath('src/assets/uploads/hero-a1b2.png')).toBe(true)
    expect(isAssetPath('src/assets/og.webp')).toBe(true)
    for (const src of [
      'placeholder',
      'https://x.test/a.png',
      '/src/assets/a.png',
      'src/assets/../site.json',
      'src/assets/a.svg',
      'public/a.png',
    ]) {
      expect(isAssetPath(src), src).toBe(false)
    }
  })
})

describe('assetFile', () => {
  it('resolves inside src/assets or the uploads directory, and nowhere else', () => {
    expect(assetFile('/site', '/site/src/assets/uploads', 'src/assets/uploads/a.png')).toBe('/site/src/assets/uploads/a.png')
    expect(assetFile('/site', '/elsewhere/uploads', 'src/assets/a.png')).toBe('/site/src/assets/a.png')
    expect(assetFile('/site', '/site/src/assets/uploads', 'content/a.png')).toBeNull()
  })
})

describe('assetRefs', () => {
  it('finds every local image path with its dotted path, in document order', () => {
    const page = {
      seo: { ogImage: 'src/assets/og.png' },
      sections: [
        {
          props: { image: { src: 'src/assets/uploads/hero.png', alt: 'x' }, logos: [{ src: 'placeholder' }, { src: 'src/assets/l.png' }] },
        },
      ],
    }
    expect(assetRefs(page)).toEqual([
      { path: 'seo.ogImage', src: 'src/assets/og.png' },
      { path: 'sections.0.props.image.src', src: 'src/assets/uploads/hero.png' },
      { path: 'sections.0.props.logos.1.src', src: 'src/assets/l.png' },
    ])
  })
})

describe('missingAssetIssues', () => {
  it('reports only the paths whose file is missing', async () => {
    const doc = { a: { src: 'src/assets/here.png' }, b: 'src/assets/gone.png' }
    const issues = await missingAssetIssues(doc, async (src) => src.endsWith('here.png'))
    expect(issues).toEqual([{ path: 'b', message: 'Image file not found: src/assets/gone.png. Choose another image or upload it again.' }])
  })
})

describe('usage labels', () => {
  it('names site fields people know, and falls back to the path', () => {
    expect(describeSiteRef({ path: 'brandLogo.src', src: '' })).toBe('Site settings › brand logo')
    expect(describeSiteRef({ path: 'footer.badge.src', src: '' })).toBe('Site settings › footer.badge.src')
  })

  it('names a page by title and the section by its label', () => {
    const page = { title: 'About', sections: [{ type: 'hero' }, { type: 'textImage' }] }
    const labels = { textImage: 'Text and image' }
    expect(describePageRef({ path: 'sections.1.props.image.src', src: '' }, page, labels)).toBe('About page › Text and image')
    expect(describePageRef({ path: 'sections.0.props.image.src', src: '' }, page, labels)).toBe('About page › hero')
    expect(describePageRef({ path: 'seo.ogImage', src: '' }, page, labels)).toBe('About page › social preview image')
  })
})

describe('draftImageUsages', () => {
  const src = 'src/assets/uploads/new-a1b2c3d4.png'
  const page = {
    title: 'Home',
    seo: { ogImage: 'src/assets/other.png' },
    sections: [
      { type: 'hero', props: { image: { src, alt: '' } } },
      { type: 'textImage', props: { image: { src: 'src/assets/other.png', alt: '' } } },
    ],
  }

  it('names every place the unsaved page and site point at the image', () => {
    const site = { brandLogo: { src }, favicon: { src: 'src/assets/other.png' } }
    expect(draftImageUsages(src, { page, site }, { hero: 'Hero' })).toEqual(['Site settings › brand logo', 'Home page › Hero'])
  })

  it('finds nothing for an image the drafts do not use, or when no draft is loaded', () => {
    expect(draftImageUsages('src/assets/uploads/unused.png', { page, site: {} }, {})).toEqual([])
    expect(draftImageUsages(src, { page: null, site: null }, {})).toEqual([])
  })
})
