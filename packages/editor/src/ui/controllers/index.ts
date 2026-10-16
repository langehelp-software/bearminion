import type { Editor } from '../state/editor.js'
import { attachPageEditing } from './page-editing.js'
import { attachPointerTracking } from './pointer-tracking.js'
import { attachReactions, type Dispose } from './reactions.js'
import { attachReloadGuard } from './reload-guard.js'
import { attachShortcuts } from './shortcuts.js'

/**
 * Connect an editor to the page: restore the chrome, start the reactions and listeners, then load the drafts.
 * The returned function undoes all of it, in reverse.
 */
export function attachEditor(editor: Editor): Dispose {
  editor.chrome.restore()
  const detach = [
    attachReactions(editor),
    attachReloadGuard(editor),
    attachShortcuts(editor),
    attachPageEditing(editor),
    attachPointerTracking(editor),
  ]
  editor.session.start()
  return () => {
    for (const dispose of detach.reverse()) dispose()
    editor.dispose()
  }
}
