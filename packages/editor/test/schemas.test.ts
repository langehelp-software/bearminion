import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineSection, defineTheme, defineSite, defineWireframe, MAX_NAV_DEPTH, imageSchema, linkSchema, seoSchema } from '../src/index.js'
import { bearminion } from '../src/astro.js'
import { resolveEditorContext } from '../src/options.js'
import { pruneSectionProps, isOptionalPath } from '../src/section-optional.js'
import {
  contentCounts,
  heroSchema,
  optionalContent,
  pageSchema,
  sectionOptions,
  sectionRegistry,
  sectionSchema,
  sectionTypes,
  siteDefinition,
  siteOptions,
  siteSchema,
  type Section,
} from './starter.js'

const siteDefaults = {
  url: 'https://bearminion.example',
  seo: {
    titleTemplate: '%s · BearMinion',
    description: 'Default description.',
  },
}

type Assert<T extends true> = T
type SectionTypeName =
  | 'hero'
  | 'logoStrip'
  | 'steps'
  | 'features'
  | 'textImage'
  | 'stats'
  | 'testimonials'
  | 'pricing'
  | 'video'
  | 'media'
  | 'faq'
  | 'cta'
  | 'contact'
export type _SectionTypesMatch = Assert<
  Section['type'] extends SectionTypeName ? (SectionTypeName extends Section['type'] ? true : false) : false
>
export type _HeroPropsNarrow = Assert<'items' extends keyof Extract<Section, { type: 'hero' }>['props'] ? false : true>

describe('section schemas', () => {
  it('registers the v2 section types', () => {
    expect(sectionTypes).toEqual([
      'hero',
      'logoStrip',
      'steps',
      'features',
      'textImage',
      'stats',
      'testimonials',
      'pricing',
      'video',
      'media',
      'faq',
      'cta',
      'contact',
    ])
    expect(sectionRegistry.hero.label).toBe('Hero')
    expect(sectionRegistry.hero.schema.parse(sectionRegistry.hero.defaults).heading).toBe('Say what you do in one line.')
  })

  it('accepts a hero and preserves section order', () => {
    const page = pageSchema.parse({
      slug: 'index',
      title: 'Home',
      seo: { title: 'Home', description: 'Hi' },
      sections: [
        {
          id: 'hero',
          type: 'hero',
          props: {
            eyebrow: 'Eyebrow',
            heading: 'Hello',
            sub: 'Sub',
            primary: { label: 'Go', href: '#cta' },
            secondary: { label: 'More', href: '#features' },
          },
        },
        {
          id: 'cta',
          type: 'cta',
          props: {
            heading: 'Next',
            body: 'A short line.',
            primary: { label: 'Go', href: '/about' },
          },
        },
      ],
    })

    expect(page.sections.map((section) => section.type)).toEqual(['hero', 'cta'])
    expect(page.sections[0]).toMatchObject({ variant: 'split', tone: 'base', props: { heading: 'Hello' } })
  })

  it('requires em to be a substring of heading', () => {
    const result = heroSchema.safeParse({
      eyebrow: 'Eyebrow',
      heading: 'Hello',
      em: 'missing',
      sub: 'Sub',
      primary: { label: 'Go', href: '#cta' },
      secondary: { label: 'More', href: '#features' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'em')).toBe(true)
      expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(/substring of heading/)
    }
  })

  it('migrates em to a serif italic mark and rejects overlapping marks', () => {
    const migrated = heroSchema.parse({
      eyebrow: 'Eyebrow',
      heading: 'Content lives in git.',
      em: 'git',
      sub: 'Sub',
      primary: { label: 'Go', href: '#cta' },
      secondary: { label: 'More', href: '#features' },
    })
    expect(migrated.marks).toEqual([{ start: 17, end: 20, italic: true, font: 'serif' }])
    expect('em' in migrated).toBe(false)

    const overlap = heroSchema.safeParse({
      eyebrow: 'Eyebrow',
      heading: 'Content lives in git.',
      marks: [
        { start: 0, end: 7, weight: 'bold' },
        { start: 4, end: 10, font: 'mono' },
      ],
      sub: 'Sub',
      primary: { label: 'Go', href: '#cta' },
      secondary: { label: 'More', href: '#features' },
    })
    expect(overlap.success).toBe(false)
    if (!overlap.success) {
      expect(overlap.error.issues.map((issue) => issue.message).join('\n')).toMatch(/must not overlap/)
    }

    const outside = heroSchema.safeParse({
      eyebrow: 'Eyebrow',
      heading: 'Hi',
      marks: [{ start: 0, end: 8, italic: true }],
      sub: 'Sub',
      primary: { label: 'Go', href: '#cta' },
      secondary: { label: 'More', href: '#features' },
    })
    expect(outside.success).toBe(false)
  })

  it('rejects a link id that collides with a section anchor', () => {
    const page = pageSchema.safeParse({
      slug: 'index',
      title: 'Home',
      seo: { title: 'Home', description: 'Hi' },
      sections: [
        {
          id: 'features',
          type: 'features',
          anchor: 'features',
          props: sectionRegistry.features.defaults,
        },
        {
          id: 'hero',
          type: 'hero',
          props: {
            ...sectionRegistry.hero.defaults,
            primary: { label: 'Go', href: '#cta', id: 'features' },
          },
        },
      ],
    })
    expect(page.success).toBe(false)
    if (!page.success) {
      expect(page.error.issues.map((issue) => issue.message).join('\n')).toMatch(
        /Link id "features" collides with section anchor "features"/,
      )
    }

    const named = siteSchema.parse({
      name: 'BearMinion',
      nameEm: 'Minion',
      ...siteDefaults,
      header: { links: [], cta: { label: 'Go', href: '/', id: 'go', newTab: true, trackingId: 'cta_header' } },
      footer: { columns: [] },
    })
    expect(named.nameMarks).toEqual([{ start: 4, end: 10, italic: true, font: 'serif' }])
    expect(named.header.actions[0]).toMatchObject({ newTab: true, id: 'go', trackingId: 'cta_header' })

    const duplicate = siteSchema.safeParse({
      name: 'BearMinion',
      ...siteDefaults,
      header: {
        links: [{ label: 'Home', href: '/', id: 'go' }],
        cta: { label: 'Go', href: '/', id: 'go' },
      },
      footer: { columns: [] },
    })
    expect(duplicate.success).toBe(false)
    if (!duplicate.success) {
      expect(duplicate.error.issues.map((issue) => issue.message).join('\n')).toMatch(/Duplicate link id "go"/)
    }
  })

  it('rejects unknown props, unknown types, and duplicate ids', () => {
    expect(() => sectionSchema.parse({ id: 'hero', type: 'hero', props: { heading: 'Hi', extra: true } })).toThrow(/unrecognized/i)

    const unknown = sectionSchema.safeParse({ id: 'banner', type: 'banner', props: {} })
    expect(unknown.success).toBe(false)
    if (!unknown.success) {
      expect(unknown.error.issues.some((issue) => issue.path.join('.') === 'type')).toBe(true)
      expect(unknown.error.issues.map((issue) => issue.message).join('\n')).toMatch(/Unknown section type "banner"/)
    }

    const duplicate = pageSchema.safeParse({
      slug: 'index',
      title: 'Home',
      seo: { title: 'Home', description: '' },
      sections: [
        {
          id: 'hero',
          type: 'hero',
          props: {
            eyebrow: 'Eyebrow',
            heading: 'One',
            sub: 'Sub',
            primary: { label: 'Go', href: '#cta' },
            secondary: { label: 'More', href: '#features' },
          },
        },
        {
          id: 'hero',
          type: 'hero',
          props: {
            eyebrow: 'Eyebrow',
            heading: 'Two',
            sub: 'Sub',
            primary: { label: 'Go', href: '#cta' },
            secondary: { label: 'More', href: '#features' },
          },
        },
      ],
    })
    expect(duplicate.success).toBe(false)
    if (!duplicate.success) {
      expect(duplicate.error.issues.map((issue) => issue.message).join('\n')).toMatch(/Duplicate section id "hero"/)
    }
  })

  it('requires list items to match their item schema', () => {
    const result = sectionRegistry.features.schema.safeParse({
      items: [{ description: 'No title' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.').includes('title'))).toBe(true)
    }
  })

  it('uses the design-system defaults for variant, tone, and yearly discount', () => {
    for (const type of sectionTypes) {
      const options = sectionOptions[type]
      const parsed = sectionSchema.parse({
        id: 'sample',
        type,
        props: sectionRegistry[type].defaults,
      })
      expect(parsed.variant).toBe(options.find((option) => option.name === 'variant')?.default)
      expect(parsed.tone).toBe(options.find((option) => option.name === 'tone')?.default)
      expect(options.find((option) => option.name === 'motion')?.default).toBe(true)
    }

    const pricing = sectionSchema.parse({
      id: 'pricing',
      type: 'pricing',
      props: sectionRegistry.pricing.defaults,
    })
    expect(pricing.type).toBe('pricing')
    if (pricing.type === 'pricing') {
      expect(pricing.props.yearlyDiscount).toBe(sectionOptions.pricing.find((option) => option.name === 'yearlyDiscount')?.default)
      expect(pricing.props.plans[0]?.cta).toEqual({ label: 'Start free', href: '#contact' })
    }

    const site = siteSchema.parse({
      name: 'BearMinion',
      ...siteDefaults,
      header: { links: [], cta: { label: 'Go', href: '/' } },
      footer: { columns: [] },
    })
    expect(site.theme.mode).toBe(siteOptions.find((option) => option.name === 'theme.mode')?.default)
    expect(site.theme.motion).toBe(siteOptions.find((option) => option.name === 'theme.motion')?.default)
    expect(site.header.variant).toBe(siteOptions.find((option) => option.name === 'header.variant')?.default)
    expect(site.header.sticky).toBe(siteOptions.find((option) => option.name === 'header.sticky')?.default)
    expect(site.footer.variant).toBe(siteOptions.find((option) => option.name === 'footer.variant')?.default)
    expect(site.nameMarks).toBeUndefined()
    expect(site.footer.badge).toBeUndefined()
    expect(Object.keys(sectionOptions)).toEqual(sectionTypes)
  })

  it('rejects an invalid variant, a short feature list, a short FAQ, and a bento that is not four items', () => {
    const invalidVariant = sectionSchema.safeParse({
      id: 'hero',
      type: 'hero',
      variant: 'giant',
      props: sectionRegistry.hero.defaults,
    })
    expect(invalidVariant.success).toBe(false)

    const shortFeatures = sectionSchema.safeParse({
      id: 'features',
      type: 'features',
      variant: 'cards',
      props: {
        ...sectionRegistry.features.defaults,
        items: sectionRegistry.features.defaults.items.slice(0, contentCounts.features.items.min - 1),
      },
    })
    expect(shortFeatures.success).toBe(false)

    // The bento grid takes any count the section allows: 4 keeps the wide fourth card, 3, 5 or 6 fill rows of three.
    const items = sectionRegistry.features.defaults.items
    for (const count of [3, 4, 5, 6]) {
      const bento = sectionSchema.safeParse({
        id: 'features',
        type: 'features',
        variant: 'bento',
        props: { ...sectionRegistry.features.defaults, items: Array.from({ length: count }, (_, at) => items[at % items.length]) },
      })
      expect(bento.success, `bento with ${count} items`).toBe(true)
    }

    const shortFaq = sectionRegistry.faq.schema.safeParse({
      ...sectionRegistry.faq.defaults,
      items: sectionRegistry.faq.defaults.items.slice(0, contentCounts.faq.items.min - 1),
    })
    expect(shortFaq.success).toBe(false)
  })

  it('rejects a string plan cta and a nameEm that is not in the name', () => {
    const plan = sectionRegistry.pricing.defaults.plans[0]
    const pricing = sectionRegistry.pricing.schema.safeParse({
      ...sectionRegistry.pricing.defaults,
      plans: plan ? [{ ...plan, cta: 'Clone the starter' }] : [],
    })
    expect(pricing.success).toBe(false)

    const site = siteSchema.safeParse({
      name: 'BearMinion',
      nameEm: 'Nope',
      ...siteDefaults,
      header: { links: [], cta: { label: 'Go', href: '/' } },
      footer: { columns: [] },
    })
    expect(site.success).toBe(false)
    if (!site.success) {
      expect(site.error.issues.map((issue) => issue.message).join('\n')).toMatch(/nameEm must be a substring of name/)
    }
  })

  it('rejects defaults that do not match the schema', () => {
    expect(() =>
      defineSection({
        type: 'broken',
        label: 'Broken',
        description: 'A section whose defaults do not fit its schema.',
        schema: z.object({ heading: z.string().min(1) }).strict(),
        defaults: { heading: '' },
        variants: ['plain'],
        defaultVariant: 'plain',
        optional: { props: [] },
        wireframe: defineWireframe([[8, 8, 40, 8, 'title']]),
      }),
    ).toThrow(/Invalid defaults for section "broken"[\s\S]*heading/)
  })

  const note = {
    type: 'note',
    label: 'Note',
    description: 'A short note.',
    schema: z.object({ body: z.string() }).strict(),
    defaults: { body: 'Hi' },
    variants: ['plain', 'boxed'],
    defaultVariant: 'plain',
    optional: { props: [] },
    wireframe: defineWireframe([[8, 8, 40, 8, 'title']]),
  } as const

  it('rejects a default variant that is not one of the variants', () => {
    expect(() => defineSection({ ...note, variants: ['plain', 'boxed'], defaultVariant: 'wide' as never })).toThrow(
      /default variant "wide"/,
    )
  })

  it('rejects a wireframe with an unknown kind or a rectangle outside the frame', () => {
    expect(() => defineSection({ ...note, wireframe: [[8, 8, 40, 8, 'banner']] as never })).toThrow(/unknown kind "banner"/)
    expect(() => defineSection({ ...note, wireframe: [[80, 8, 40, 8, 'title']] })).toThrow(/leaves the 100/)
    expect(() => defineSection({ ...note, wireframe: [] })).toThrow(/at least one rectangle/)
  })

  it('builds the control list from the variants, then tone, motion and the section options', () => {
    const definition = defineSection({
      ...note,
      options: [{ name: 'columns', label: 'Columns', type: 'number', default: 2, min: 1, max: 4 }],
    })
    expect(definition.options.map((option) => option.name)).toEqual(['variant', 'tone', 'motion', 'columns'])
    expect(definition.options[0]).toMatchObject({ choices: ['plain', 'boxed'], default: 'plain' })
  })

  it('gives every starter section a description, a valid wireframe and the variant control first', () => {
    for (const type of sectionTypes) {
      const definition = sectionRegistry[type]
      expect(definition.description.length).toBeGreaterThan(0)
      expect(definition.wireframe.length).toBeGreaterThan(0)
      expect(definition.options[0]).toMatchObject({ name: 'variant', choices: definition.variants, default: definition.defaultVariant })
    }
  })
})

describe('site schema', () => {
  it('accepts a BCP 47 language tag', () => {
    const base = { name: 'BearMinion', ...siteDefaults, header: { links: [] }, footer: { columns: [] } }
    expect(siteSchema.safeParse({ ...base, lang: 'pl' }).success).toBe(true)
    expect(siteSchema.safeParse({ ...base, lang: 'pt-BR' }).success).toBe(true)
    expect(siteSchema.safeParse({ ...base, lang: 'english please' }).success).toBe(false)
  })

  it('stores the legacy logo as favicon, validates the brand logo, and reads system mode as light', () => {
    const base = { name: 'BearMinion', ...siteDefaults, header: { links: [] }, footer: { columns: [] } }
    const legacy = siteSchema.parse({ ...base, logo: { src: '/logo.svg', alt: '' }, theme: { mode: 'system', motion: true } })
    expect(legacy.favicon).toEqual({ src: '/logo.svg', alt: '' })
    expect('logo' in legacy).toBe(false)
    expect(legacy.theme.mode).toBe('light')
    const both = siteSchema.parse({ ...base, logo: { src: '/old.svg', alt: '' }, favicon: { src: '/new.svg', alt: '' } })
    expect(both.favicon?.src).toBe('/new.svg')
    expect(siteSchema.safeParse({ ...base, brandLogo: { src: '/b.svg', alt: 'B', height: 40 } }).success).toBe(true)
    expect(siteSchema.safeParse({ ...base, brandLogo: { src: '/b.svg', alt: 'B', height: 8 } }).success).toBe(false)
    expect(siteSchema.safeParse({ ...base, brandLogo: { src: '/b.svg', alt: 'B', fit: 'cover' } }).success).toBe(false)
  })

  it('accepts a header, theme defaults, and footer columns', () => {
    const site = siteSchema.parse({
      name: 'BearMinion',
      ...siteDefaults,
      logo: { src: '/logo.svg', alt: 'BearMinion' },
      header: {
        variant: 'floating',
        links: [{ label: 'About', href: '/about' }],
        cta: { label: 'Start', href: '#cta' },
        signIn: { label: 'Sign in', href: '/about#contact' },
      },
      footer: {
        variant: 'wordmark',
        text: 'Hi',
        columns: [{ title: 'Product', links: [{ label: 'Home', href: '/' }] }],
      },
    })

    expect(site.theme).toEqual({ mode: 'light', motion: true })
    expect(site.header.variant).toBe('floating')
    expect(site.header.actions.map((action) => action.href)).toEqual(['/about#contact', '#cta'])
    expect(site.footer.columns[0]?.links[0]?.label).toBe('Home')
  })

  it('lets a header omit both buttons', () => {
    const site = siteSchema.parse({
      name: 'BearMinion',
      ...siteDefaults,
      header: { links: [] },
      footer: { columns: [] },
    })
    expect(site.header.actions).toEqual([])
  })

  it('accepts up to two header actions and rejects mixing them with the legacy fields', () => {
    const base = { name: 'BearMinion', ...siteDefaults, footer: { columns: [] } }
    const two = siteSchema.safeParse({
      ...base,
      header: {
        links: [],
        actions: [
          { label: 'A', href: '/' },
          { label: 'B', href: '/b' },
        ],
      },
    })
    expect(two.success).toBe(true)
    const three = siteSchema.safeParse({
      ...base,
      header: {
        links: [],
        actions: [
          { label: 'A', href: '/' },
          { label: 'B', href: '/b' },
          { label: 'C', href: '/c' },
        ],
      },
    })
    expect(three.success).toBe(false)
    const mixed = siteSchema.safeParse({
      ...base,
      header: { links: [], actions: [{ label: 'A', href: '/' }], cta: { label: 'Go', href: '/' } },
    })
    expect(mixed.success).toBe(false)
  })

  it('allows at most three footer columns', () => {
    const column = { title: 'Product', links: [{ label: 'Home', href: '/' }] }
    const base = { name: 'BearMinion', ...siteDefaults, header: { links: [] } }
    expect(siteSchema.safeParse({ ...base, footer: { columns: [column, column, column] } }).success).toBe(true)
    expect(siteSchema.safeParse({ ...base, footer: { columns: [column, column, column, column] } }).success).toBe(false)
  })

  it('rejects a header link without href', () => {
    const result = siteSchema.safeParse({
      name: 'BearMinion',
      ...siteDefaults,
      header: { links: [{ label: 'Home' }], cta: { label: 'Go', href: '/' } },
      footer: { columns: [] },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'header.links.0.href')).toBe(true)
    }
  })
})

describe('defineSite', () => {
  const chrome = {
    header: { variants: ['bar', 'split'], defaultVariant: 'bar' },
    footer: { variants: ['plain'], defaultVariant: 'plain' },
  } as const
  const base = { name: 'Acme', ...siteDefaults, header: { links: [] }, footer: { columns: [] } }

  it('validates against the variants the theme declares', () => {
    const site = defineSite(chrome)
    const parsed = site.schema.parse(base)
    expect(parsed.header.variant).toBe('bar')
    expect(parsed.footer.variant).toBe('plain')
    expect(site.schema.safeParse({ ...base, header: { links: [], variant: 'split' } }).success).toBe(true)
    // 'floating' is a starter variant, not this theme's.
    expect(site.schema.safeParse({ ...base, header: { links: [], variant: 'floating' } }).success).toBe(false)
    expect(site.schema.safeParse({ ...base, footer: { columns: [], variant: 'columns' } }).success).toBe(false)
  })

  it('builds the sidebar controls from the declared variants and defaults', () => {
    const site = defineSite({ ...chrome, header: { ...chrome.header, defaultVariant: 'split' } })
    const header = site.options.find((option) => option.name === 'header.variant')
    expect(header).toMatchObject({ type: 'enum', choices: ['bar', 'split'], default: 'split' })
    expect(site.schema.parse(base).header.variant).toBe('split')
    expect(site.options.map((option) => option.name)).toEqual([
      'lang',
      'theme.mode',
      'theme.motion',
      'header.variant',
      'header.tone',
      'header.sticky',
      'footer.variant',
      'footer.tone',
    ])
  })

  it('applies the limits and only offers the footer badge when enabled', () => {
    const site = defineSite({
      header: { ...chrome.header, maxActions: 1, recommendedLinks: 5 },
      footer: { ...chrome.footer, maxColumns: 2, badge: true },
    })
    expect(site.limits).toEqual({ maxHeaderActions: 1, maxFooterColumns: 2 })
    expect(site.counts.header).toEqual({ links: { recommended: 5 } })
    expect(site.counts.footer).toEqual({ columns: { recommended: 2, max: 2 } })
    const link = { label: 'Go', href: '/' }
    expect(site.schema.safeParse({ ...base, header: { links: [], actions: [link, link] } }).success).toBe(false)
    const column = { title: 'Col', links: [] }
    expect(site.schema.safeParse({ ...base, footer: { columns: [column, column, column] } }).success).toBe(false)
    expect(site.schema.safeParse({ ...base, footer: { columns: [], badge: 'New' } }).success).toBe(true)
    expect(site.options.some((option) => option.name === 'footer.badge')).toBe(true)

    const plain = defineSite(chrome)
    expect(plain.limits).toEqual({ maxHeaderActions: 2, maxFooterColumns: 3 })
    expect(plain.options.some((option) => option.name === 'footer.badge')).toBe(false)
    expect(plain.schema.safeParse({ ...base, footer: { columns: [], badge: 'New' } }).success).toBe(false)
  })

  it('rejects an invalid definition', () => {
    expect(() => defineSite({ ...chrome, header: { ...chrome.header, defaultVariant: 'wide' as never } })).toThrow(
      /header\.defaultVariant "wide"/,
    )
    expect(() => defineSite({ ...chrome, footer: { ...chrome.footer, maxColumns: 0 } })).toThrow(/footer\.maxColumns/)
  })

  it('needs the site definition to start the editor', () => {
    expect(() => resolveEditorContext({ sections: sectionRegistry } as never, '/tmp/site')).toThrow(/`site` option/)
  })

  it('describes the starter chrome', () => {
    expect(siteDefinition.header.variants).toEqual(['bar', 'centered', 'floating'])
    expect(siteDefinition.footer).toMatchObject({ defaultVariant: 'columns', badge: true })
  })
})

describe('seo schema', () => {
  it('defaults noindex and nofollow to false', () => {
    const seo = seoSchema.parse({ title: 'Home', description: 'Hi' })
    expect(seo.noindex).toBe(false)
    expect(seo.nofollow).toBe(false)
    expect(seo.canonical).toBeUndefined()
  })

  it('accepts noindex, nofollow, and a canonical override', () => {
    const seo = seoSchema.parse({
      title: 'Preview',
      description: 'Hidden',
      noindex: true,
      nofollow: true,
      canonical: 'https://bearminion.example/preview',
    })
    expect(seo.noindex).toBe(true)
    expect(seo.nofollow).toBe(true)
    expect(seo.canonical).toBe('https://bearminion.example/preview')
  })

  it('rejects a non-boolean noindex and an unknown button variant', () => {
    const seo = seoSchema.safeParse({ title: 'Home', description: '', noindex: 'yes' })
    expect(seo.success).toBe(false)
    if (!seo.success) {
      expect(seo.error.issues.some((issue) => issue.path.join('.') === 'noindex')).toBe(true)
    }

    const theme = defineTheme({ fonts: { serif: { label: 'Display', family: 'Fraunces, serif' } } })
    expect(theme.fonts.serif).toEqual({ label: 'Display', family: 'Fraunces, serif' })
    expect(theme.fonts.sans.label).toBe('Sans')

    const page = pageSchema.safeParse({
      slug: 'index',
      title: 'Home',
      seo: { title: 'Home', description: '' },
      sections: [
        {
          id: 'cta',
          type: 'cta',
          props: {
            heading: 'Go',
            body: 'Body',
            primary: { label: 'Go', href: '/about', variant: 'giant' },
          },
        },
      ],
    })
    expect(page.success).toBe(false)
    if (!page.success) {
      expect(JSON.stringify(page.error.issues)).toMatch(/variant/)
    }
  })
})

describe('anchors and navigation depth', () => {
  it(`allows ${MAX_NAV_DEPTH} nav levels and rejects one more`, () => {
    const leaf = { label: 'Grandchild', href: '#c' }
    const child = { label: 'Child', href: '#b', children: [leaf] }
    expect(linkSchema.safeParse({ label: 'Root', href: '#a', children: [child] }).success).toBe(true)
    const tooDeep = {
      label: 'Root',
      href: '#a',
      children: [
        {
          label: 'Child',
          href: '#b',
          children: [{ label: 'Grandchild', href: '#c', children: [{ label: 'Too deep', href: '#d' }] }],
        },
      ],
    }
    expect(linkSchema.safeParse(tooDeep).success).toBe(false)
  })

  it('requires unique anchors and a slug shape', () => {
    const section = {
      id: 'hero',
      type: 'hero' as const,
      anchor: 'top',
      props: {
        eyebrow: 'Eyebrow',
        heading: 'One',
        sub: 'Sub',
        primary: { label: 'Go', href: '#cta' },
        secondary: { label: 'More', href: '#features' },
      },
    }
    const page = {
      slug: 'index',
      title: 'Home',
      seo: { title: 'Home', description: '' },
      sections: [section, { ...section, id: 'hero-2', anchor: 'top' }],
    }
    const duplicate = pageSchema.safeParse(page)
    expect(duplicate.success).toBe(false)
    const bad = pageSchema.safeParse({ ...page, sections: [{ ...section, anchor: 'Not Slug' }] })
    expect(bad.success).toBe(false)
    const ok = pageSchema.safeParse({ ...page, sections: [section, { ...section, id: 'hero-2', anchor: 'bottom' }] })
    expect(ok.success).toBe(true)
  })
})

describe('optional section content', () => {
  const dropped = (type: (typeof sectionTypes)[number]) => {
    const spec = optionalContent[type]
    const props = structuredClone(sectionRegistry[type].defaults) as Record<string, unknown>
    for (const key of spec?.props ?? []) delete props[key]
    for (const [arrayKey, keys] of Object.entries(spec?.items ?? {})) {
      const list = props[arrayKey]
      if (!Array.isArray(list)) continue
      props[arrayKey] = list.map((item) => {
        const copy = { ...(item as Record<string, unknown>) }
        for (const key of keys) delete copy[key]
        return copy
      })
    }
    return props
  }

  it('lists every section type', () => {
    expect(Object.keys(optionalContent).sort()).toEqual([...sectionTypes].sort())
  })

  it.each(sectionTypes)('%s stays valid with every optional prop removed', (type) => {
    const result = sectionRegistry[type].schema.safeParse(dropped(type))
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true)
  })

  it.each(sectionTypes)('%s stays valid with each optional prop removed on its own', (type) => {
    const spec = optionalContent[type]
    for (const key of spec?.props ?? []) {
      const props = structuredClone(sectionRegistry[type].defaults) as Record<string, unknown>
      delete props[key]
      const result = sectionRegistry[type].schema.safeParse(props)
      expect(result.success, `${type}.${key}`).toBe(true)
    }
  })

  it('keeps what defines an item required', () => {
    const features = structuredClone(sectionRegistry.features.defaults) as { items: Record<string, unknown>[] }
    delete features.items[0]?.title
    expect(sectionRegistry.features.schema.safeParse(features).success).toBe(false)
    const faq = structuredClone(sectionRegistry.faq.defaults) as { items: Record<string, unknown>[] }
    delete faq.items[0]?.q
    expect(sectionRegistry.faq.schema.safeParse(faq).success).toBe(false)
    const stats = structuredClone(sectionRegistry.stats.defaults) as { items: Record<string, unknown>[] }
    delete stats.items[0]?.value
    expect(sectionRegistry.stats.schema.safeParse(stats).success).toBe(false)
  })

  it('accepts empty text lists', () => {
    const textImage = { ...structuredClone(sectionRegistry.textImage.defaults), points: [] }
    expect(sectionRegistry.textImage.schema.safeParse(textImage).success).toBe(true)
    const contact = { ...structuredClone(sectionRegistry.contact.defaults), details: [], topics: [] }
    expect(sectionRegistry.contact.schema.safeParse(contact).success).toBe(true)
  })

  it('drops marks when the heading is gone', () => {
    const hero = structuredClone(sectionRegistry.hero.defaults) as Record<string, unknown>
    delete hero.heading
    const parsed = sectionRegistry.hero.schema.safeParse(hero)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect((parsed.data as Record<string, unknown>).marks).toBeUndefined()
  })

  it('prunes emptied text and recognises optional paths', () => {
    const pruned = pruneSectionProps(optionalContent.hero, {
      eyebrow: '',
      heading: '',
      marks: [{ start: 0, end: 2, italic: true }],
      sub: 'Keep',
      primary: { label: 'A', href: '#' },
    })
    expect(pruned).toEqual({ sub: 'Keep', primary: { label: 'A', href: '#' } })
    const items = pruneSectionProps(optionalContent.features, { items: [{ title: 'T', description: '' }] })
    expect(items).toEqual({ items: [{ title: 'T' }] })
    expect(isOptionalPath(optionalContent.hero, 'sections.0.props.eyebrow')).toBe(true)
    expect(isOptionalPath(optionalContent.features, 'sections.1.props.items.2.description')).toBe(true)
    expect(isOptionalPath(optionalContent.features, 'sections.1.props.items.2.title')).toBe(false)
  })
})

describe('image layout', () => {
  it('keeps old images valid and accepts fit and position', () => {
    expect(imageSchema.parse({ src: 'src/assets/a.png', alt: 'A' })).toEqual({ src: 'src/assets/a.png', alt: 'A' })
    const set = imageSchema.parse({ src: 'src/assets/a.png', alt: 'A', fit: 'contain', position: 'top left' })
    expect(set.fit).toBe('contain')
    expect(set.position).toBe('top left')
    expect(imageSchema.safeParse({ src: 'a', alt: '', fit: 'auto' }).success).toBe(true)
  })

  it('rejects unknown fit and position values', () => {
    expect(imageSchema.safeParse({ src: 'a', alt: '', fit: 'stretch' }).success).toBe(false)
    expect(imageSchema.safeParse({ src: 'a', alt: '', position: 'middle' }).success).toBe(false)
    expect(imageSchema.safeParse({ src: 'a', alt: '', zoom: 2 }).success).toBe(false)
  })
})

describe('astro integration', () => {
  it('exposes the dev-server hooks', () => {
    const integration = bearminion({ sections: sectionRegistry, site: siteDefinition })
    expect(integration.name).toBe('bearminion')
    expect(integration.hooks['astro:config:setup']).toEqual(expect.any(Function))
    expect(integration.hooks['astro:server:setup']).toEqual(expect.any(Function))
  })
  it('accepts a button style on a section link and rejects unknown ones', () => {
    const base = { id: 'hero', type: 'hero' }
    const ok = pageSchema.safeParse({
      slug: 'index',
      title: 'Home',
      seo: { title: 'Home', description: '' },
      sections: [{ ...base, props: { ...sectionRegistry.hero.defaults, primary: { label: 'Go', href: '#cta', style: 'tertiary' } } }],
    })
    expect(ok.success).toBe(true)
    const bad = pageSchema.safeParse({
      slug: 'index',
      title: 'Home',
      seo: { title: 'Home', description: '' },
      sections: [{ ...base, props: { ...sectionRegistry.hero.defaults, primary: { label: 'Go', href: '#cta', style: 'loud' } } }],
    })
    expect(bad.success).toBe(false)
  })

  it('accepts a hidden section image and rejects a non-boolean flag', () => {
    const make = (hidden: unknown) =>
      pageSchema.safeParse({
        slug: 'index',
        title: 'Home',
        seo: { title: 'Home', description: '' },
        sections: [
          { id: 'hero', type: 'hero', props: { ...sectionRegistry.hero.defaults, image: { src: 'placeholder', alt: '', hidden } } },
        ],
      })
    expect(make(true).success).toBe(true)
    expect(make('yes').success).toBe(false)
  })
})

describe('video section', () => {
  const props = (video: string) => ({ ...sectionRegistry.video.defaults, video })

  it('accepts a file in public/, an https link to a file and the placeholder', () => {
    for (const video of ['/videos/demo.webm', '/demo.mp4', 'https://cdn.example.com/a/demo.MP4?v=2', 'placeholder']) {
      expect(sectionRegistry.video.schema.safeParse(props(video)).success, video).toBe(true)
    }
  })

  it('refuses page links, other schemes and paths that are not video files', () => {
    for (const video of [
      'https://www.youtube.com/watch?v=abc',
      'https://vimeo.com/123',
      'javascript:alert(1)//.mp4',
      '//cdn.example.com/demo.mp4',
      'videos/demo.webm',
      '/videos/demo.gif',
      '/videos/my demo.webm',
    ]) {
      const result = sectionRegistry.video.schema.safeParse(props(video))
      expect(result.success, video).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toMatch(/\.mp4 or \.webm/)
    }
  })

  it('defaults to controls and accepts loop playback', () => {
    expect(sectionRegistry.video.schema.parse({ video: 'placeholder' }).playback).toBe('controls')
    expect(sectionRegistry.video.schema.parse({ video: 'placeholder', playback: 'loop' }).playback).toBe('loop')
    expect(sectionRegistry.video.schema.safeParse({ video: 'placeholder', playback: 'autoplay' }).success).toBe(false)
    expect(sectionOptions.video.find((option) => option.name === 'playback')).toMatchObject({ type: 'enum', default: 'controls' })
  })
})

describe('commands', () => {
  it('shows the hero command only in a chosen style, and keeps the primary button in the file when it is switched off', () => {
    const hero = sectionRegistry.hero
    const parsed = hero.schema.parse({ ...hero.defaults, command: 'npm create bearminion@latest' })
    expect(parsed.command).toBe('npm create bearminion@latest')
    expect(parsed.code).toBe('off')
    expect(parsed.button).toBe(true)
    expect(parsed.glow).toBe(false)
    expect(hero.schema.parse({ ...hero.defaults, code: 'action', button: false }).primary).toEqual(hero.defaults.primary)
    expect(hero.schema.safeParse({ ...hero.defaults, code: 'banner' }).success).toBe(false)
    expect(sectionOptions.hero.map((option) => option.name)).toEqual(['variant', 'tone', 'motion', 'button', 'code', 'glow'])
  })

  it('takes a linked badge with an optional tag', () => {
    const hero = sectionRegistry.hero
    const badge = { tag: '1.2', text: 'Available now', href: '/changelog' }
    expect(hero.schema.parse({ ...hero.defaults, badge }).badge).toEqual(badge)
    expect(hero.schema.safeParse({ ...hero.defaults, badge: { text: 'Out now', href: '#' } }).success).toBe(true)
    expect(hero.schema.safeParse({ ...hero.defaults, badge: { tag: 'New', href: '#' } }).success).toBe(false)
  })

  it('lets the CTA terminal print up to eight lines, each with an optional prompt', () => {
    const cta = sectionRegistry.cta
    const output = [{ text: 'Installed 12 packages' }, { prompt: '→', text: 'Next: npm run dev' }]
    expect(cta.schema.parse({ ...cta.defaults, output }).output).toEqual(output)
    expect(cta.schema.safeParse({ ...cta.defaults, output: Array(9).fill({ text: 'line' }) }).success).toBe(false)
    expect(cta.schema.safeParse({ ...cta.defaults, output: [{ text: '' }] }).success).toBe(false)
    expect(cta.schema.safeParse({ ...cta.defaults, output: ['plain string'] }).success).toBe(false)
  })
})

describe('media section', () => {
  const media = sectionRegistry.media
  const withVideo = (video: string) => media.schema.safeParse({ ...media.defaults, video })

  it('plays YouTube, Vimeo and video file links', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=abcdefghijk',
      'https://youtu.be/abcdefghijk',
      'https://www.youtube.com/shorts/abcdefghijk',
      'https://www.youtube-nocookie.com/embed/abcdefghijk',
      'https://vimeo.com/76979871',
      'https://player.vimeo.com/video/76979871',
      '/videos/demo.webm',
      'https://cdn.example.com/demo.mp4?v=2',
    ]) {
      expect(withVideo(link).success, link).toBe(true)
    }
  })

  it('refuses links that are not a video', () => {
    for (const link of ['https://example.com/page', 'javascript:alert(1)', 'youtube.com/watch?v=abcdefghijk', '/images/a.gif', '']) {
      expect(withVideo(link).success, link).toBe(false)
    }
  })

  it('defaults to a video with a heading, and offers type, shape and heading controls', () => {
    const parsed = media.schema.parse(media.defaults)
    expect([parsed.kind, parsed.aspect, parsed.intro]).toEqual(['video', '16:9', true])
    expect(parsed.video).toBeUndefined()
    expect(sectionOptions.media.map((option) => option.name)).toEqual(['variant', 'tone', 'motion', 'kind', 'aspect', 'intro'])
  })
})

describe('steps section', () => {
  const steps = sectionRegistry.steps

  it('takes two to six steps with a known icon', () => {
    const step = { icon: 'bolt', title: 'Quick', description: 'Run `npm run dev`.' }
    for (const count of [2, 6]) {
      expect(steps.schema.safeParse({ ...steps.defaults, steps: Array(count).fill(step) }).success, `${count}`).toBe(true)
    }
    for (const count of [1, 7]) {
      expect(steps.schema.safeParse({ ...steps.defaults, steps: Array(count).fill(step) }).success, `${count}`).toBe(false)
    }
    expect(steps.schema.safeParse({ ...steps.defaults, steps: [step, { ...step, icon: 'rocket' }] }).success).toBe(false)
  })

  it('numbers steps unless switched off', () => {
    expect(steps.schema.parse(steps.defaults).numbered).toBe(true)
    expect(steps.schema.parse({ ...steps.defaults, numbered: false }).numbered).toBe(false)
  })
})
