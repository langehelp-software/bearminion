import { useEffect, useState } from 'preact/hooks'
import { getForms } from '../api-client.js'

export const FORMS_DOCS = 'https://docs.bearminion.com/forms'

export interface HandlerNote {
  /** `warn` is drawn like an error; `hint` like the other help lines. */
  tone: 'hint' | 'warn'
  text: string
}

/**
 * What the sidebar says about the code behind a section's form. BearMinion can see that the file exists, not that it
 * works: its keys, its service and its host are outside the project, so the note says to test it by hand.
 */
export function describeHandler(name: string, file: string | null): HandlerNote {
  if (file === null) {
    return {
      tone: 'warn',
      text: `Nothing receives this form yet: there is no src/forms/${name}.ts. A visitor who sends it gets an error. Create the file to connect it.`,
    }
  }
  return {
    tone: 'hint',
    text: `This form posts to /api/${name}, handled by your own code in ${file}. BearMinion cannot check that it works: send a test message and see that it arrives.`,
  }
}

/** Under a section's fields, for a section that posts to a handler of the site. */
export function FormHandlerNote({ name }: { name: string }) {
  const [file, setFile] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let current = true
    getForms().then(
      (answer) => {
        if (!current) return
        setFile(answer.ok && answer.value.enabled ? (answer.value.handlers[name]?.file ?? null) : undefined)
      },
      () => {
        if (current) setFile(undefined)
      },
    )
    return () => {
      current = false
    }
  }, [name])
  if (file === undefined) return null
  const note = describeHandler(name, file)
  return (
    <span class={note.tone === 'warn' ? 'bm-error' : 'bm-hint'} role={note.tone === 'warn' ? 'alert' : 'status'} data-form-handler={name}>
      {note.text}{' '}
      <a href={FORMS_DOCS} target="_blank" rel="noopener">
        How to set up a form
      </a>
    </span>
  )
}
