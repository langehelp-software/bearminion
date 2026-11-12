import { describe, expect, it } from 'vitest'
import { applyBlocks, type BlockEdit, parseBody } from '../src/entry-blocks.js'
import { EntryError, hasFrontmatter, joinEntry, readFields, removeField, setField, splitEntry } from '../src/entry-source.js'
import { CORPUS } from './entry-corpus.js'

/** Lines present in one text and not the other: what a reviewer would see in a diff. */
function changedLines(before: string, after: string): number {
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  const count = new Map<string, number>()
  for (const line of a) count.set(line, (count.get(line) ?? 0) + 1)
  let added = 0
  for (const line of b) {
    const left = count.get(line) ?? 0
    if (left > 0) count.set(line, left - 1)
    else added++
  }
  let removed = 0
  for (const left of count.values()) removed += left
  return added + removed
}

function edit(source: string, change: (frontmatter: string, eol: '\n' | '\r\n') => string): string {
  const parts = splitEntry(source)
  return joinEntry({ ...parts, frontmatter: change(parts.frontmatter, parts.eol) })
}

describe('splitEntry', () => {
  it.each(Object.entries(CORPUS))('%s: split and join give the same bytes', (_name, { source }) => {
    expect(joinEntry(splitEntry(source))).toBe(source)
  })

  it('separates BOM, frontmatter and body', () => {
    const parts = splitEntry('﻿---\r\ntitle: x\r\n---\r\n\r\nBody')
    expect(parts).toEqual({
      bom: '﻿',
      eol: '\r\n',
      head: '---\r\n',
      frontmatter: 'title: x\r\n',
      tail: '---\r\n',
      body: '\r\nBody',
    })
  })

  it('treats a rule in the body as body, and an unclosed fence as no frontmatter', () => {
    expect(splitEntry('---\ntitle: x\n---\n\nabove\n\n---\n\nbelow\n').body).toBe('\nabove\n\n---\n\nbelow\n')
    expect(hasFrontmatter(splitEntry(CORPUS.unclosedFence?.source ?? ''))).toBe(false)
    expect(hasFrontmatter(splitEntry(CORPUS.noFrontmatter?.source ?? ''))).toBe(false)
  })

  it('handles an empty frontmatter block', () => {
    const parts = splitEntry('---\n---\n\nBody\n')
    expect(parts.frontmatter).toBe('')
    expect(hasFrontmatter(parts)).toBe(true)
  })
})

describe('setField', () => {
  it('changes only the edited key: comments, spacing and folded scalars stay', () => {
    const before = '# c\ntitle: Hello   # t\ndraft:   false\ntags: [a, b]\ndesc: >-\n  folded\n  text\nz: 1\n'
    const after = setField(before, 'title', 'New: title')
    expect(after).toBe('# c\ntitle: "New: title"   # t\ndraft:   false\ntags: [a, b]\ndesc: >-\n  folded\n  text\nz: 1\n')
    expect(changedLines(before, after)).toBe(2)
  })

  it('keeps a quoted scalar quoted and a flow list flow', () => {
    expect(setField('title: "x"\n', 'title', 'y')).toBe('title: "y"\n')
    expect(setField("title: 'x'\n", 'title', 'y')).toBe("title: 'y'\n")
    expect(setField('tags: [a, b]\n', 'tags', ['a', 'b', 'c'])).toBe('tags: [ a, b, c ]\n')
  })

  it('replaces a block list, a folded scalar and a nested map in place', () => {
    expect(setField('title: x\ntags:\n  - a\n  - b\nz: 1\n', 'tags', ['a', 'b', 'c'])).toBe('title: x\ntags:\n  - a\n  - b\n  - c\nz: 1\n')
    expect(setField('title: x\ndesc: >-\n  folded\n  text\nz:   1\n', 'desc', 'one line')).toBe('title: x\ndesc: one line\nz:   1\n')
    expect(setField('title: x\nseo:\n  title: t\n  noindex: false\nz: 1\n', 'seo', { title: 't2', noindex: true })).toBe(
      'title: x\nseo:\n  title: t2\n  noindex: true\nz: 1\n',
    )
  })

  it('uses the file’s indent width for nested values', () => {
    expect(setField('title: x\nseo:\n    title: t\nz: 1\n', 'seo', { title: 'u' })).toBe('title: x\nseo:\n    title: u\nz: 1\n')
  })

  it('appends a missing key, with or without a final newline, and in an empty block', () => {
    expect(setField('title: x\n', 'draft', true)).toBe('title: x\ndraft: true\n')
    expect(setField('title: x', 'draft', true)).toBe('title: x\ndraft: true\n')
    expect(setField('', 'title', 'x')).toBe('title: x\n')
  })

  it('writes the file’s own line ending', () => {
    expect(setField('title: x\r\ndraft:   false\r\n', 'title', 'y', '\r\n')).toBe('title: y\r\ndraft:   false\r\n')
    expect(setField('title: x\r\n', 'tags', ['a', 'b'], '\r\n')).toBe('title: x\r\ntags:\r\n  - a\r\n  - b\r\n')
  })

  it('keeps a date scalar as the file wrote it', () => {
    expect(setField('date: 2026-01-05\ntitle: x\n', 'title', 'y')).toBe('date: 2026-01-05\ntitle: y\n')
    expect(setField('date: "2026-01-05"\ntitle: x\n', 'date', '2026-02-01')).toBe('date: "2026-02-01"\ntitle: x\n')
  })

  it('refuses keys that use anchors, aliases or merge keys, and non-mappings', () => {
    const anchored = 'base: &b\n  a: 1\ncopy: *b\n'
    expect(() => setField(anchored, 'copy', 1)).toThrow(EntryError)
    expect(() => setField(anchored, 'base', 1)).toThrow(EntryError)
    expect(() => setField('base: &b\n  a: 1\nx:\n  <<: *b\n', 'y', 1)).toThrow(EntryError)
    expect(() => setField('- a\n- b\n', 'title', 'x')).toThrow(EntryError)
    expect(() => setField('title: [unclosed\n', 'title', 'x')).toThrow(EntryError)
  })

  it('leaves an unrelated entry byte-identical when its own field is set to the same value', () => {
    for (const [name, { source }] of Object.entries(CORPUS)) {
      const parts = splitEntry(source)
      if (!hasFrontmatter(parts) || parts.frontmatter === '') continue
      const fields = readFields(parts.frontmatter)
      const key = Object.keys(fields)[0]
      if (key === undefined) continue
      const raw = parts.frontmatter
      const after = setField(
        raw,
        key,
        fields[key] instanceof Date ? (fields[key] as Date).toISOString().slice(0, 10) : fields[key],
        parts.eol,
      )
      // Only the first key's own line may differ, and only when its value is written differently (quotes, date style).
      expect(changedLines(raw, after), name).toBeLessThanOrEqual(2)
    }
  })
})

describe('removeField', () => {
  it('removes the key line and nothing else', () => {
    expect(removeField('# c\ntitle: x\ndraft: false\nz: 1\n', 'draft')).toBe('# c\ntitle: x\nz: 1\n')
    expect(removeField('title: x\ntags:\n  - a\n  - b\nz: 1\n', 'tags')).toBe('title: x\nz: 1\n')
    expect(removeField('title: x\n', 'missing')).toBe('title: x\n')
  })
})

describe('readFields', () => {
  it('reads like Astro: timestamps are Dates, the rest is plain', () => {
    const fields = readFields('title: Hello\ndate: 2026-01-05\nquoted: "2026-01-05"\ntags: [a, b]\ndraft: false\n')
    expect(fields.date).toBeInstanceOf(Date)
    expect(fields.quoted).toBe('2026-01-05')
    expect(fields).toMatchObject({ title: 'Hello', tags: ['a', 'b'], draft: false })
    expect(readFields('')).toEqual({})
  })
})

describe('parseBody', () => {
  it.each(Object.entries(CORPUS))('%s: blocks join back into the body', (_name, { source, mdx }) => {
    const body = splitEntry(source).body
    expect(
      applyBlocks(
        parseBody(body, { mdx }),
        parseBody(body, { mdx }).blocks.map((block) => ({ id: block.id })),
      ),
    ).toBe(body)
  })

  it('marks what the editor cannot represent as locked', () => {
    const locked = (name: string) =>
      parseBody(splitEntry(CORPUS[name]?.source ?? '').body, { mdx: CORPUS[name]?.mdx })
        .blocks.filter((block) => !block.editable)
        .map((block) => block.type)
    expect(locked('html')).toEqual(['html', 'paragraph', 'html'])
    expect(locked('footnoteAndDirective')).toEqual(['paragraph', 'footnoteDefinition', 'paragraph'])
    expect(locked('structures')).toEqual(['definition'])
    expect(locked('mdx')).toEqual(['paragraph', 'html'])
    expect(locked('plain')).toEqual([])
  })

  it('keeps plain markdown editable', () => {
    const types = parseBody(splitEntry(CORPUS.structures?.source ?? '').body).blocks.map((block) => `${block.type}:${block.editable}`)
    expect(types).toEqual([
      'table:true',
      'code:true',
      'list:true',
      'list:true',
      'blockquote:true',
      'heading:true',
      'thematicBreak:true',
      'paragraph:true',
      'definition:false',
    ])
  })
})

describe('applyBlocks', () => {
  const body = 'First paragraph.\n\nSecond paragraph.\n\n<div>raw</div>\n\nLast.\n'
  const parsed = parseBody(body)
  const keep = parsed.blocks.map((block): BlockEdit => ({ id: block.id }))

  it('is the identity when nothing is edited', () => {
    expect(applyBlocks(parsed, keep)).toBe(body)
  })

  it('edits one block and touches only its lines', () => {
    const edits = keep.map((edit, index) => (index === 1 ? { id: 'b1', markdown: 'Second, edited.' } : edit))
    const after = applyBlocks(parsed, edits)
    expect(after).toBe('First paragraph.\n\nSecond, edited.\n\n<div>raw</div>\n\nLast.\n')
    expect(changedLines(body, after)).toBe(2)
  })

  it('inserts a block with one blank line either side', () => {
    const after = applyBlocks(parsed, [keep[0] as BlockEdit, { markdown: 'Inserted.' }, ...keep.slice(1)])
    expect(after).toBe('First paragraph.\n\nInserted.\n\nSecond paragraph.\n\n<div>raw</div>\n\nLast.\n')
  })

  it('deletes the first, a middle and the last block', () => {
    expect(applyBlocks(parsed, keep.slice(1))).toBe('Second paragraph.\n\n<div>raw</div>\n\nLast.\n')
    expect(applyBlocks(parsed, [keep[0], keep[2], keep[3]] as BlockEdit[])).toBe('First paragraph.\n\n<div>raw</div>\n\nLast.\n')
    expect(applyBlocks(parsed, keep.slice(0, 3))).toBe('First paragraph.\n\nSecond paragraph.\n\n<div>raw</div>\n')
  })

  it('appends to a body with no trailing newline without adding one', () => {
    const bare = parseBody('only')
    expect(applyBlocks(bare, [{ id: 'b0' }, { markdown: 'next' }])).toBe('only\n\nnext')
  })

  it('fills an empty body and ends it with a newline', () => {
    expect(applyBlocks(parseBody(''), [{ markdown: 'Hello' }])).toBe('Hello\n')
    expect(applyBlocks(parseBody(''), [])).toBe('')
  })

  it('keeps raw blocks, odd blank lines and the body’s own line endings through an edit elsewhere', () => {
    const source = splitEntry(CORPUS.extraBlankLines?.source ?? '').body
    const odd = parseBody(source)
    const after = applyBlocks(odd, [{ id: 'b0', markdown: 'A2' }, { id: 'b1' }])
    expect(after).toBe('\n\n\nA2\n\n\n\n\nB\n\n\n')

    const crlf = parseBody('One\r\n\r\nTwo\r\n')
    expect(applyBlocks(crlf, [{ id: 'b0' }, { id: 'b1', markdown: 'Two\nlines' }])).toBe('One\r\n\r\nTwo\r\nlines\r\n')
  })

  it('rejects an id that was not parsed', () => {
    expect(() => applyBlocks(parsed, [{ id: 'nope' }])).toThrow('Unknown block id')
  })

  it('keeps every raw block of the whole corpus byte-identical when one editable block is edited', () => {
    for (const [name, { source, mdx }] of Object.entries(CORPUS)) {
      const entry = parseBody(splitEntry(source).body, { mdx })
      const target = entry.blocks.find((block) => block.editable)
      if (!target) continue
      const after = applyBlocks(
        entry,
        entry.blocks.map((block): BlockEdit => (block === target ? { id: block.id, markdown: 'EDITED' } : { id: block.id })),
      )
      for (const block of entry.blocks) if (block !== target) expect(after, `${name} ${block.id}`).toContain(block.raw)
      expect(changedLines(splitEntry(source).body, after), name).toBeLessThanOrEqual(target.raw.split('\n').length + 1)
    }
  })
})

describe('edit one field of a whole entry', () => {
  it('changes the field and nothing else', () => {
    for (const [name, { source }] of Object.entries(CORPUS)) {
      const parts = splitEntry(source)
      if (!hasFrontmatter(parts) || readFields(parts.frontmatter).title === undefined) continue
      const after = edit(source, (frontmatter, eol) => setField(frontmatter, 'title', 'Changed', eol))
      expect(changedLines(source, after), name).toBeLessThanOrEqual(2)
      expect(splitEntry(after).body, name).toBe(parts.body)
    }
  })
})
