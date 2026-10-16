import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { type IconName, Icon } from '../icons.js'

/** Focus stays on the primary action; Tab cycles inside the dialog. Shared by the alert dialogs. */
export function useDialogFocus(root: { current: HTMLDivElement | null }) {
  useEffect(() => {
    const dialog = root.current
    dialog?.querySelector<HTMLButtonElement>('.bm-primary')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>('button')]
      if (items.length === 0) return
      const rootNode = dialog.getRootNode()
      const active = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement
      const index = items.indexOf(active as HTMLElement)
      event.preventDefault()
      const next = event.shiftKey
        ? items[(index <= 0 ? items.length : index) - 1]
        : items[index < 0 || index === items.length - 1 ? 0 : index + 1]
      next?.focus()
    }
    dialog?.addEventListener('keydown', onKey)
    return () => dialog?.removeEventListener('keydown', onKey)
  }, [])
}

/** Alert layout: [icon tile] [title / body with the target in bold / muted note] [x], a footer rule, then the buttons. */
function AlertHead({
  tone,
  icon,
  title,
  body,
  note,
  onClose,
}: {
  tone: 'warn' | 'danger' | 'neutral'
  icon: IconName
  title: string
  body: ComponentChildren
  note?: string
  onClose: () => void
}) {
  return (
    <div class="bm-alert-main">
      <span class={`bm-tile bm-tile-${tone}`} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div class="bm-alert-copy">
        <h2 class="bm-dialog-title">{title}</h2>
        <p class="bm-alert-body">{body}</p>
        {note && <p class="bm-alert-note">{note}</p>}
      </div>
      <DialogClose onClose={onClose} />
    </div>
  )
}

export function ConfirmDialog({
  label,
  body,
  note,
  tone,
  icon,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  label: string
  body: ComponentChildren
  note?: string
  tone: 'warn' | 'danger' | 'neutral'
  icon: IconName
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root)
  return (
    <div
      class="bm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={label}
      ref={root}
      style="top:24%;left:50%;transform:translateX(-50%);"
    >
      <AlertHead tone={tone} icon={icon} title={label} body={body} note={note} onClose={onCancel} />
      <div class="bm-actions">
        <button type="button" class={danger ? 'bm-primary bm-danger' : 'bm-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" class="bm-tertiary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Leaving the page with unsaved edits. Discard is a secondary destructive action, so it sits on the left. */
export function LeaveDialog({ onSave, onDiscard, onCancel }: { onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root)
  return (
    <div
      class="bm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label="Unsaved changes"
      ref={root}
      style="top:24%;left:50%;transform:translateX(-50%);"
    >
      <AlertHead
        tone="warn"
        icon="alert"
        title="Unsaved changes"
        body="You have unsaved changes. Save them before leaving this page?"
        note="Discard throws them away and reloads from the saved files."
        onClose={onCancel}
      />
      <div class="bm-actions">
        <button type="button" class="bm-primary" onClick={onSave}>
          Save
        </button>
        <button type="button" class="bm-tertiary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" class="bm-tertiary bm-danger bm-actions-remove" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}

/** The X in a dialog's top right corner. Only for dialogs that can be dismissed without doing anything. */
export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" class="bm-icon-btn bm-close bm-dialog-x" aria-label="Close" title="Close (Esc)" onClick={onClose}>
      <Icon name="x" size={16} />
    </button>
  )
}
