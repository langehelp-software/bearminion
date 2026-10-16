import SectionHeader from './SectionHeader.astro'

export default {
  title: 'Molecules/SectionHeader',
  component: SectionHeader,
}

export const Default = {
  args: {
    eyebrow: 'Features',
    heading: 'What stays out of the way',
    marks: [{ start: 11, end: 25, italic: true, font: 'serif' }],
    intro: 'No database, no hosted editor, and no content locked in someone else\u2019s API.',
  },
}
