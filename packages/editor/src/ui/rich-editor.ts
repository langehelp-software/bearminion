import { baseKeymap, chainCommands, liftEmptyBlock, toggleMark } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { DOMParser as ModelParser, DOMSerializer, type Node as ModelNode, type NodeType, Schema, type Slice } from 'prosemirror-model'
import { splitListItem, wrapInList } from 'prosemirror-schema-list'
import { type Command, EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { isSafeHref, markdownFromHtml, renderRichText, sanitizeRichHtml, stripPlainRich } from '../rich-text.js'

/**
 * The rich-text subset as a ProseMirror schema: paragraphs, line breaks, flat bulleted and numbered lists, bold,
 * italic and links. Nothing else can exist in the document, so nothing else can be pasted or typed into it.
 * Storage stays the markdown subset of `rich-text.ts`; this module only converts at the edges.
 */
export const richSchema = new Schema({
  nodes: {
    doc: { content: '(paragraph | bullet_list | ordered_list)+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    bullet_list: { content: 'list_item+', group: 'block', parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
    ordered_list: { content: 'list_item+', group: 'block', parseDOM: [{ tag: 'ol' }], toDOM: () => ['ol', 0] },
    // One paragraph per item: the markdown subset has no nested lists.
    list_item: { content: 'paragraph', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    text: { group: 'inline' },
  },
  marks: {
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    link: {
      // `newTab` mirrors `data-new-tab` in the markdown flags: null leaves it to the default (external links open a new tab).
      attrs: { href: {}, newTab: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => {
            const href = dom.getAttribute('href') ?? ''
            if (!isSafeHref(href)) return false
            const tab = dom.getAttribute('data-new-tab')
            return { href, newTab: tab === 'true' ? 'new' : tab === 'false' ? 'same' : null }
          },
        },
      ],
      toDOM: (mark) => {
        const tab = mark.attrs.newTab
        const attrs: Record<string, string> = { href: String(mark.attrs.href) }
        if (tab === 'new') attrs['data-new-tab'] = 'true'
        else if (tab === 'same') attrs['data-new-tab'] = 'false'
        return ['a', attrs, 0]
      },
    },
  },
})

const { paragraph, bullet_list, ordered_list, list_item, hard_break } = richSchema.nodes
const { strong, em, link } = richSchema.marks
const parser = ModelParser.fromSchema(richSchema)
const serializer = DOMSerializer.fromSchema(richSchema)

function container(html: string): HTMLElement {
  const node = document.createElement('div')
  // `html` is always the renderer's own output (escaped text, fixed tags), never raw input.
  node.innerHTML = html
  return node
}

/** Markdown → document, through the same renderer the page uses, so what you edit is what the page shows. */
export function docFromMarkdown(markdown: string): ModelNode {
  return parser.parse(container(renderRichText(markdown)))
}

/** Document → markdown, through the same serializer the draft has always used. */
export function markdownFromDoc(doc: ModelNode): string {
  const holder = document.createElement('div')
  holder.append(serializer.serializeFragment(doc.content))
  return markdownFromHtml(holder.innerHTML)
}

function sliceFromMarkdown(markdown: string): Slice {
  return parser.parseSlice(container(renderRichText(markdown)))
}

/** Document position of the `offset`-th character of the text; breaks and block edges count for nothing. */
export function posAtTextOffset(doc: ModelNode, offset: number): number {
  let remaining = Math.max(0, offset)
  let found = -1
  let end = 1
  doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (!node.isText) return true
    const size = node.nodeSize
    if (remaining <= size) {
      found = pos + remaining
      return false
    }
    remaining -= size
    end = pos + size
    return true
  })
  return found >= 0 ? found : end
}

const insertLineBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(hard_break.create()).scrollIntoView())
  return true
}

/**
 * Turn the selected top-level paragraphs into one list, a paragraph per item. `wrapInList` cannot: it wants every
 * selected block inside a single item, and an item here holds exactly one paragraph.
 */
function wrapEachInList(kind: NodeType): Command {
  return (state, dispatch) => {
    const range = state.selection.$from.blockRange(state.selection.$to)
    if (!range) return false
    const paragraphs: ModelNode[] = []
    range.parent.forEach((child, _offset, index) => {
      if (index >= range.startIndex && index < range.endIndex) paragraphs.push(child)
    })
    if (paragraphs.length === 0 || !paragraphs.every((node) => node.type === paragraph)) return false
    dispatch?.(
      state.tr
        .replaceWith(
          range.start,
          range.end,
          kind.create(
            null,
            paragraphs.map((node) => list_item.create(null, node)),
          ),
        )
        .scrollIntoView(),
    )
    return true
  }
}

interface ListAt {
  node: ModelNode
  pos: number
}

/** The lists the selection touches (lists never nest). Works for a caret, a range and select-all alike. */
function listsIn(state: EditorState): ListAt[] {
  const { from, to } = state.selection
  const found: ListAt[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== bullet_list && node.type !== ordered_list) return true
    found.push({ node, pos })
    return false
  })
  return found
}

/**
 * Turn the selected items back into plain paragraphs, splitting each list around them. `liftListItem` merges several
 * items into one before lifting, which an item of a single paragraph cannot hold.
 */
function unwrapSelected(lists: ListAt[], from: number, to: number): Command {
  return (state, dispatch) => {
    if (!dispatch) return true
    const overlaps = (start: number, end: number) => (from === to ? start <= from && from <= end : start < to && end > from)
    const tr = state.tr
    // Last list first, so the positions of the earlier ones stay valid.
    for (const { node: list, pos } of [...lists].reverse()) {
      const parts: ModelNode[] = []
      let kept: ModelNode[] = []
      const flush = () => {
        if (kept.length > 0) parts.push(list.type.create(list.attrs, kept))
        kept = []
      }
      let offset = pos + 1
      list.forEach((item) => {
        const end = offset + item.nodeSize
        if (overlaps(offset, end)) {
          flush()
          if (item.firstChild) parts.push(item.firstChild)
        } else {
          kept.push(item)
        }
        offset = end
      })
      flush()
      tr.replaceWith(pos, pos + list.nodeSize, parts)
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Toggle a list: unwrap the same kind, convert the other kind, otherwise wrap. */
function toggleList(kind: NodeType): Command {
  return (state, dispatch) => {
    const lists = listsIn(state)
    if (lists.length === 0) return wrapInList(kind)(state, dispatch) || wrapEachInList(kind)(state, dispatch)
    if (lists.every((list) => list.node.type === kind))
      return unwrapSelected(lists, state.selection.from, state.selection.to)(state, dispatch)
    if (dispatch) {
      const tr = state.tr
      for (const list of lists) tr.setNodeMarkup(list.pos, kind)
      dispatch(tr)
    }
    return true
  }
}

/** Link the selection. Like the old `createLink`, a caret with nothing selected does nothing. */
function setLink(href: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty || !isSafeHref(href)) return false
    dispatch?.(state.tr.addMark(from, to, link.create({ href })))
    return true
  }
}

export type RichCommand = 'bold' | 'italic' | 'bulletList' | 'orderedList' | 'link'

/** The editing command behind a toolbar button. `url` is for `link`. */
export function commandFor(command: RichCommand, url = ''): Command {
  switch (command) {
    case 'bold':
      return toggleMark(strong)
    case 'italic':
      return toggleMark(em)
    case 'bulletList':
      return toggleList(bullet_list)
    case 'orderedList':
      return toggleList(ordered_list)
    case 'link':
      return setLink(url)
  }
}

/** Enter is a line break, a new item inside a list, and leaves the list from an empty item. */
export const enterCommand: Command = chainCommands(splitListItem(list_item), liftEmptyBlock, insertLineBreak)

/** Which toolbar buttons are on at the selection. */
export interface RichActive {
  bold: boolean
  italic: boolean
  link: boolean
  bulletList: boolean
  orderedList: boolean
}

export function activeOf(state: EditorState): RichActive {
  const { $from, from, to, empty } = state.selection
  const marked = (type: typeof strong) =>
    empty ? type.isInSet(state.storedMarks ?? $from.marks()) !== undefined : state.doc.rangeHasMark(from, to, type)
  const lists = listsIn(state)
  return {
    bold: marked(strong),
    italic: marked(em),
    link: marked(link),
    bulletList: lists.length > 0 && lists.every((item) => item.node.type === bullet_list),
    orderedList: lists.length > 0 && lists.every((item) => item.node.type === ordered_list),
  }
}

function sameActive(a: RichActive, b: RichActive): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.link === b.link && a.bulletList === b.bulletList && a.orderedList === b.orderedList
}

export interface RichEditor {
  readonly field: HTMLElement
  /** Run a toolbar command on the editor's own selection. `url` is for `link`. */
  run(command: RichCommand, url?: string): boolean
  /** Put the draft's markdown into the editor, for undo and restore. Keeps the view mounted. */
  setMarkdown(markdown: string): void
  /** Unmount and put the page's own rendering of `markdown` back. Idempotent. */
  destroy(): void
}

const mounted = new WeakMap<HTMLElement, RichEditor>()

/** The editor mounted on `field`, if any. */
export function richEditorOf(field: Element): RichEditor | undefined {
  return field instanceof HTMLElement ? mounted.get(field) : undefined
}

export interface RichEditorOptions {
  markdown: string
  /** Where the caret or selection was in the page's own markup, as character offsets into the field's text. */
  selection?: { anchor: number; head: number }
  /** Called with the new markdown after every change to the document (not for selection moves). */
  onChange(markdown: string): void
  /** Called when the selection moves into or out of bold, italic, a link or a list. Also once on mount. */
  onActive?(active: RichActive): void
  /** True for focus targets that belong to the editor's own panels; moving focus there keeps the edit going. */
  keepsEdit(target: EventTarget | null): boolean
  /** Called once the view is gone, whoever tore it down. */
  onDestroy?(): void
}

/**
 * Make `field` a ProseMirror editor over `markdown`. The field element itself becomes the editable surface, so the
 * page's own typography applies. Focus leaving the field (to anywhere but the editor's panels) ends the edit.
 */
export function mountRichEditor(
  field: HTMLElement,
  { markdown, selection, onChange, onActive, keepsEdit, onDestroy }: RichEditorOptions,
): RichEditor {
  const existing = mounted.get(field)
  if (existing) return existing
  const stateFor = (source: string) =>
    EditorState.create({
      doc: docFromMarkdown(source),
      plugins: [
        history(),
        keymap({
          'Mod-b': toggleMark(strong),
          'Mod-i': toggleMark(em),
          'Mod-z': undo,
          'Mod-y': redo,
          'Shift-Mod-z': redo,
          Enter: enterCommand,
          'Shift-Enter': insertLineBreak,
        }),
        keymap(baseKeymap),
      ],
    })

  let lastMarkdown = markdown
  let lastActive: RichActive | null = null
  let done = false
  const reportActive = (state: EditorState) => {
    const next = activeOf(state)
    if (lastActive && sameActive(lastActive, next)) return
    lastActive = next
    onActive?.(next)
  }
  const view: EditorView = new EditorView(
    { mount: field },
    {
      state: stateFor(markdown),
      dispatchTransaction(tr) {
        const next = view.state.apply(tr)
        view.updateState(next)
        if (tr.docChanged || tr.selectionSet || tr.storedMarksSet) reportActive(next)
        if (!tr.docChanged) return
        lastMarkdown = markdownFromDoc(next.doc)
        onChange(lastMarkdown)
      },
      // Pasted HTML is parsed and reduced to the markdown subset first; plain text is read as that markdown.
      transformPastedHTML: (html) => sanitizeRichHtml(html),
      clipboardTextParser: (text) => sliceFromMarkdown(stripPlainRich(text)),
    },
  )

  if (selection) {
    const { doc } = view.state
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(doc, posAtTextOffset(doc, selection.anchor), posAtTextOffset(doc, selection.head))),
    )
  }
  view.focus()
  reportActive(view.state)
  const onFocusOut = (event: FocusEvent) => {
    // The window losing focus is not the end of the edit; the browser puts focus back when it returns.
    if (!document.hasFocus()) return
    // The formatting bar and the link popover take focus without ending the edit.
    if (keepsEdit(event.relatedTarget)) return
    handle.destroy()
  }
  view.dom.addEventListener('focusout', onFocusOut)

  const handle: RichEditor = {
    field,
    run(command, url = '') {
      view.focus()
      return commandFor(command, url)(view.state, view.dispatch)
    },
    setMarkdown(next) {
      if (next === lastMarkdown) return
      lastMarkdown = next
      view.updateState(stateFor(next))
    },
    destroy() {
      if (done) return
      done = true
      view.dom.removeEventListener('focusout', onFocusOut)
      mounted.delete(field)
      view.destroy()
      // `destroy` empties a mounted view but leaves its attributes behind.
      field.classList.remove('ProseMirror')
      field.removeAttribute('contenteditable')
      field.removeAttribute('translate')
      if (!field.getAttribute('class')) field.removeAttribute('class')
      field.innerHTML = renderRichText(lastMarkdown)
      onDestroy?.()
    },
  }
  mounted.set(field, handle)
  return handle
}

/** Unmount every rich editor, e.g. before the page's markup is replaced or the editor goes into preview. */
export function destroyRichEditors(): void {
  for (const field of document.querySelectorAll('.ProseMirror')) richEditorOf(field)?.destroy()
}
