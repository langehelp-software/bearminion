import Emphasis from './Emphasis.astro'

const git = 'Content lives in git.'

export default {
  title: 'Atoms/Emphasis',
  component: Emphasis,
}

export const Phrase = {
  args: {
    heading: git,
    marks: [{ start: git.indexOf('git'), end: git.indexOf('git') + 3, italic: true, font: 'serif' }],
  },
}

export const Mixed = {
  args: {
    heading: git,
    marks: [
      { start: 0, end: 7, weight: 'bold' },
      { start: git.indexOf('git'), end: git.indexOf('git') + 3, font: 'mono' },
    ],
  },
}
