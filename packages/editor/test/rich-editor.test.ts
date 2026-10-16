// @vitest-environment happy-dom
import { AllSelection, type Command, EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { activeOf, commandFor, docFromMarkdown, enterCommand, markdownFromDoc, posAtTextOffset, richSchema } from '../src/ui/rich-editor.js'

const CASES = [
  '',
  'Plain text',
  'Hello **bold** and *italic* and ***both***',
  'line one\nline two',
  'first\n\nsecond',
  '- Alpha\n- Beta',
  '1. One\n2. Two',
  'Intro\n\n- a\n- b\n\nOutro',
  'A [link](https://example.com) here',
  'A [link](https://example.com){new} here',
  'A [link](https://example.com){same} here',
  'A [mail](mailto:a@b.co) here',
]

describe('markdown ↔ ProseMirror document', () => {
  it.each(CASES)('round-trips %j unchanged', (markdown) => {
    expect(markdownFromDoc(docFromMarkdown(markdown))).toBe(markdown)
  })

  it('always has a block to type into', () => {
    expect(docFromMarkdown('').childCount).toBe(1)
  })

  it('drops unsafe links but keeps their text', () => {
    expect(markdownFromDoc(docFromMarkdown('[x](javascript:alert(1))'))).toBe('x')
  })

  it('does not allow nested lists', () => {
    expect(richSchema.nodes.list_item.contentMatch.matchType(richSchema.nodes.bullet_list)).toBeNull()
  })
})

/** State over `markdown` with the selection at text offsets [from, to] (document positions). */
function at(markdown: string, from: number, to = from): EditorState {
  const base = EditorState.create({ doc: docFromMarkdown(markdown) })
  return base.apply(base.tr.setSelection(TextSelection.create(base.doc, from, to)))
}

function run(state: EditorState, command: Command): EditorState {
  let next = state
  command(state, (tr) => {
    next = state.apply(tr)
  })
  return next
}

describe('commands', () => {
  it('bolds and unbolds the selection', () => {
    const bold = run(at('Hello world', 1, 6), commandFor('bold'))
    expect(markdownFromDoc(bold.doc)).toBe('**Hello** world')
    const plain = run(at(markdownFromDoc(bold.doc), 1, 6), commandFor('bold'))
    expect(markdownFromDoc(plain.doc)).toBe('Hello world')
  })

  it('italicises the selection', () => {
    expect(markdownFromDoc(run(at('Hello world', 7, 12), commandFor('italic')).doc)).toBe('Hello *world*')
  })

  it('links the selection, and ignores a bare caret or an unsafe URL', () => {
    expect(markdownFromDoc(run(at('Hello world', 7, 12), commandFor('link', 'https://example.com')).doc)).toBe(
      'Hello [world](https://example.com)',
    )
    const caret = at('Hello world', 3)
    expect(commandFor('link', 'https://example.com')(caret)).toBe(false)
    expect(commandFor('link', 'javascript:alert(1)')(at('Hello world', 1, 4))).toBe(false)
  })

  it('wraps in a list, switches kind, and lifts back out', () => {
    const bullets = run(at('Alpha', 1), commandFor('bulletList'))
    expect(markdownFromDoc(bullets.doc)).toBe('- Alpha')
    const numbered = run(at('- Alpha', 4), commandFor('orderedList'))
    expect(markdownFromDoc(numbered.doc)).toBe('1. Alpha')
    const plain = run(at('- Alpha', 4), commandFor('bulletList'))
    expect(markdownFromDoc(plain.doc)).toBe('Alpha')
  })

  it('wraps several selected paragraphs, one item each, and lifts them back out', () => {
    const wrapped = run(at('a\n\nb\n\nc', 1, 8), commandFor('bulletList'))
    expect(markdownFromDoc(wrapped.doc)).toBe('- a\n- b\n- c')
    const lifted = run(at('- a\n- b\n- c', 3, 12), commandFor('bulletList'))
    expect(markdownFromDoc(lifted.doc)).toBe('a\n\nb\n\nc')
  })

  it('toggles a list on and off with select-all', () => {
    const base = EditorState.create({ doc: docFromMarkdown('a\n\nb') })
    const all = base.apply(base.tr.setSelection(new AllSelection(base.doc)))
    const on = run(all, commandFor('bulletList'))
    expect(markdownFromDoc(on.doc)).toBe('- a\n- b')
    expect(activeOf(on).bulletList).toBe(true)
    const off = run(on, commandFor('bulletList'))
    expect(markdownFromDoc(off.doc)).toBe('a\n\nb')
    expect(markdownFromDoc(run(on, commandFor('orderedList')).doc)).toBe('1. a\n2. b')
  })

  it('unwraps only the selected item and keeps the rest of the list', () => {
    const middle = run(at('- a\n- b\n- c', 7), commandFor('bulletList'))
    expect(markdownFromDoc(middle.doc)).toBe('- a\n\nb\n\n- c')
  })

  it('Enter makes a line break in text, a new item in a list, and leaves the list from an empty item', () => {
    expect(markdownFromDoc(run(at('onetwo', 4), enterCommand).doc)).toBe('one\ntwo')
    const item = run(at('- Alpha', 8), enterCommand)
    expect(item.doc.child(0).childCount).toBe(2)
    const out = run(item, enterCommand)
    expect(markdownFromDoc(out.doc)).toBe('- Alpha')
    expect(out.doc.childCount).toBe(2)
    expect(out.doc.child(1).type.name).toBe('paragraph')
  })
})

describe('active state', () => {
  it('reports bold, italic and links at the selection', () => {
    const none = activeOf(at('Hello **world**', 2))
    expect(none).toEqual({ bold: false, italic: false, link: false, bulletList: false, orderedList: false })
    expect(activeOf(at('Hello **world**', 8, 10)).bold).toBe(true)
    expect(activeOf(at('Hello **world**', 9)).bold).toBe(true)
    expect(activeOf(at('A *b* c', 4)).italic).toBe(true)
    expect(activeOf(at('A [b](https://example.com) c', 3, 4)).link).toBe(true)
  })

  it('reports which kind of list the caret is in', () => {
    expect(activeOf(at('- a\n- b', 4))).toMatchObject({ bulletList: true, orderedList: false })
    expect(activeOf(at('1. a', 4))).toMatchObject({ bulletList: false, orderedList: true })
  })

  it('follows stored marks after toggling bold at a caret', () => {
    const toggled = run(at('Hello', 3), commandFor('bold'))
    expect(activeOf(toggled).bold).toBe(true)
  })
})

describe('posAtTextOffset', () => {
  it('maps a character offset in the page text to a document position', () => {
    const doc = docFromMarkdown('Hello **big** world')
    // "Hello big world": offset 0 is before "H", 6 is inside the bold run, 15 is the end.
    expect(posAtTextOffset(doc, 0)).toBe(1)
    expect(posAtTextOffset(doc, 6)).toBe(7)
    expect(posAtTextOffset(doc, 15)).toBe(16)
    expect(posAtTextOffset(doc, 99)).toBe(16)
  })

  it('skips block edges between paragraphs', () => {
    const doc = docFromMarkdown('ab\n\ncd')
    // text "abcd": offset 2 is the end of "ab" (position 3), offset 3 is inside "cd" (position 6).
    expect(posAtTextOffset(doc, 2)).toBe(3)
    expect(posAtTextOffset(doc, 3)).toBe(6)
  })
})
