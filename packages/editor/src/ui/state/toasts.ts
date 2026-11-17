import { signal } from '@preact/signals'

export type ToastTone = 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  title: string
  /** Detail under the title, one line each: the validation issues of a failed save, the files an upload refused. */
  lines: readonly string[]
  /** Toasts with the same key replace each other, so a repeated failure does not pile up copies. */
  key?: string
}

export interface ToastOptions {
  lines?: readonly string[]
  key?: string
}

/** Oldest toasts past this are dropped, so a stuck failure loop cannot grow the stack without bound. */
const MAX_TOASTS = 12

/**
 * Errors and warnings shown over the editor, newest in front, older ones stacked behind. They stay until the user
 * dismisses them; the editor only removes one itself when what it reported no longer holds (a later save succeeded).
 */
export function createToasts() {
  /** Oldest first. */
  const list = signal<readonly Toast[]>([])
  let nextId = 1

  function show(tone: ToastTone, title: string, options: ToastOptions = {}): number {
    const id = nextId
    nextId += 1
    const toast: Toast = { id, tone, title, lines: options.lines ?? [], ...(options.key ? { key: options.key } : {}) }
    const kept = options.key ? list.peek().filter((item) => item.key !== options.key) : list.peek()
    list.value = [...kept, toast].slice(-MAX_TOASTS)
    return id
  }

  function dismiss(id: number) {
    const next = list.peek().filter((item) => item.id !== id)
    if (next.length !== list.peek().length) list.value = next
  }

  function dismissKey(key: string) {
    const next = list.peek().filter((item) => item.key !== key)
    if (next.length !== list.peek().length) list.value = next
  }

  function clear() {
    if (list.peek().length > 0) list.value = []
  }

  return {
    list,
    show,
    error: (title: string, options?: ToastOptions) => show('error', title, options),
    warning: (title: string, options?: ToastOptions) => show('warning', title, options),
    info: (title: string, options?: ToastOptions) => show('info', title, options),
    dismiss,
    dismissKey,
    clear,
  }
}

export type Toasts = ReturnType<typeof createToasts>
