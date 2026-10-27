// @vitest-environment happy-dom
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SectionDraft } from '../src/draft.js'
import { SectionForm } from '../src/ui/forms/section-form.js'
import { imageFields } from '../src/section-fields.js'
import type { Catalog } from '../src/ui/types.js'
import { sectionRegistry } from './starter.js'

const definitions = Object.values(sectionRegistry)
const catalog: Catalog = {
  sectionOptions: Object.fromEntries(definitions.map((item) => [item.type, item.options])),
  siteOptions: [],
  contentCounts: {},
  sectionDefaults: Object.fromEntries(definitions.map((item) => [item.type, item.defaults as Record<string, unknown>])),
  sectionLabels: Object.fromEntries(definitions.map((item) => [item.type, item.label])),
  optionalContent: Object.fromEntries(definitions.map((item) => [item.type, item.optional])),
  fieldChoices: Object.fromEntries(definitions.map((item) => [item.type, item.choices])),
  fieldIcons: Object.fromEntries(definitions.map((item) => [item.type, item.icons])),
  fieldImages: Object.fromEntries(definitions.map((item) => [item.type, imageFields(item.schema)])),
  showWhen: Object.fromEntries(definitions.map((item) => [item.type, item.showWhen])),
}

describe('Section tab controls', () => {
  let container: HTMLElement
  let onField: ReturnType<typeof vi.fn<(path: string, value: unknown) => void>>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    onField = vi.fn<(path: string, value: unknown) => void>()
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  const mount = (section: SectionDraft) =>
    render(
      h(SectionForm, {
        section,
        index: 0,
        sections: [section],
        catalog,
        siteMotion: true,
        taken: new Set<string>(),
        images: [],
        onField,
        onUploaded: () => {},
        onDeleted: () => {},
        onPreview: () => {},
        onSelect: () => {},
        onDuplicate: () => {},
        onDelete: () => {},
      }),
      container,
    )

  const group = (name: string) => container.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${name}"]`)
  const radios = (name: string) => [...(group(name)?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])]
  /** The name of each field, without the hint and tag text that follows it ("EyebrowLeave empty…" → "Eyebrow"). */
  const labels = () =>
    [...container.querySelectorAll('.bm-label, .bm-label-text')].map(
      (node) => /^[A-Z][a-z]*(?: [a-z]+)*/.exec(node.textContent?.trim() ?? '')?.[0] ?? '',
    )

  it('picks a step icon from a grid instead of typing its name', () => {
    mount({
      id: 'steps',
      type: 'steps',
      variant: 'columns',
      props: {
        heading: 'How',
        steps: [
          { icon: 'git', title: 'Push' },
          { icon: 'check', title: 'Done' },
        ],
      },
    } as SectionDraft)
    const pickers = container.querySelectorAll('[role="radiogroup"][aria-label="Icon"]')
    expect(pickers).toHaveLength(2)
    const first = radios('Icon')
    expect(first).toHaveLength(10)
    expect(first.map((button) => button.getAttribute('aria-label'))).toContain('Terminal')
    expect(first.find((button) => button.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label')).toBe('Git')
    expect(first.every((button) => button.querySelector('path')?.getAttribute('d'))).toBe(true)
    first.find((button) => button.getAttribute('aria-label') === 'Terminal')?.click()
    expect(onField).toHaveBeenCalledWith('sections.0.props.steps.0.icon', 'terminal')
    expect(container.querySelector('input[value="git"]')).toBeNull()
  })

  it('shows video fields for a video and the image field for an image', () => {
    const media = (kind: 'video' | 'image', intro: boolean): SectionDraft =>
      ({
        id: 'media',
        type: 'media',
        variant: 'centered',
        props: { heading: 'Watch', kind, intro, video: 'https://youtu.be/abc', label: 'Demo', image: { src: 'src/assets/a.png', alt: '' } },
      }) as SectionDraft
    mount(media('video', true))
    expect(labels()).toEqual(expect.arrayContaining(['Heading', 'Video', 'Poster', 'Label']))
    expect(labels()).not.toContain('Image')

    mount(media('image', false))
    expect(labels()).toEqual(expect.arrayContaining(['Image']))
    for (const hidden of ['Heading', 'Eyebrow', 'Body', 'Video', 'Poster', 'Label']) expect(labels()).not.toContain(hidden)
  })

  it('shows short choice lists as segmented controls and writes the raw value', () => {
    mount({ id: 'media', type: 'media', variant: 'centered', tone: 'subtle', props: { heading: 'Watch', kind: 'video' } } as SectionDraft)
    expect(radios('Variant').map((button) => button.textContent)).toEqual(['Centered', 'Wide', 'Split'])
    expect(radios('Tone').find((button) => button.getAttribute('aria-checked') === 'true')?.textContent).toBe('Subtle')
    expect(radios('Type').map((button) => button.textContent)).toEqual(['Video', 'Image'])
    expect(radios('Shape').map((button) => button.textContent)).toEqual(['16:9', '4:3', '21:9', '1:1'])
    radios('Type')[1]?.click()
    expect(onField).toHaveBeenCalledWith('sections.0.props.kind', 'image')
    radios('Variant')[2]?.click()
    expect(onField).toHaveBeenCalledWith('sections.0.variant', 'split')
  })

  it('offers an image slot for a missing image whatever its name', () => {
    mount({ id: 'media', type: 'media', variant: 'centered', props: { heading: 'Watch', kind: 'video' } } as SectionDraft)
    // An image slot: the image field's label and its Choose button, not a text box called Poster.
    const poster = [...container.querySelectorAll('.bm-label-text')].find((node) => node.textContent === 'Poster')
    expect(poster).toBeDefined()
    const textLabels = [...container.querySelectorAll('label.bm-label')].map((node) => node.textContent ?? '')
    expect(textLabels.some((text) => text.startsWith('Poster'))).toBe(false)
  })

  it('shows the contact detail switch as a checkbox, for a detail that has not set it and for one that has', () => {
    mount({
      id: 'contact',
      type: 'contact',
      variant: 'split',
      props: {
        heading: 'Write',
        details: [
          { label: 'Email', value: 'a@b.co' },
          { label: 'Phone', value: '600 100 200', hideFromCrawlers: true },
        ],
        topics: ['General'],
      },
    } as SectionDraft)
    const switches = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(switches).toHaveLength(2)
    expect(switches.map((input) => input.checked)).toEqual([false, true])
    switches[0]?.click()
    expect(onField).toHaveBeenCalledWith('sections.0.props.details.0.hideFromCrawlers', true)
  })

  it('hides the hero command while it is off and the badge in the editorial layout', () => {
    const hero = (variant: string, code: string): SectionDraft =>
      ({
        id: 'hero',
        type: 'hero',
        variant,
        props: { heading: 'Hi', code, command: 'npm create x', badge: { text: 'New', href: '#' } },
      }) as SectionDraft
    mount(hero('split', 'off'))
    expect(labels()).toContain('Badge')
    expect(labels()).not.toContain('Command')
    mount(hero('editorial', 'terminal'))
    expect(labels()).toContain('Command')
    expect(labels()).not.toContain('Badge')
  })
})
