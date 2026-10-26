// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { attachShortcuts } from '../src/ui/controllers/shortcuts.js'
import type { Editor } from '../src/ui/state/editor.js'

function fakeEditor() {
  const saveAndGo = vi.fn()
  const editor = {
    ui: { previewing: { peek: () => false }, confirm: { peek: () => null }, open: { peek: () => false } },
    session: { saveAndGo },
    sections: { confirm: vi.fn() },
    chrome: { exitPreview: vi.fn() },
    editor: undefined,
  } as unknown as Editor
  return { editor, saveAndGo }
}

describe('keyboard shortcuts', () => {
  it('ignores a keydown that has no key, as browser autofill dispatches', () => {
    const { editor, saveAndGo } = fakeEditor()
    const detach = attachShortcuts(editor)
    try {
      const event = new Event('keydown', { bubbles: true })
      expect(() => window.dispatchEvent(event)).not.toThrow()
      expect(saveAndGo).not.toHaveBeenCalled()
    } finally {
      detach()
    }
  })

  it('still saves on Ctrl+S', () => {
    const { editor, saveAndGo } = fakeEditor()
    const detach = attachShortcuts(editor)
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      expect(saveAndGo).toHaveBeenCalledTimes(1)
    } finally {
      detach()
    }
  })
})
