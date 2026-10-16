import { createContext } from 'preact'
import type { OptionalContent } from '../section-optional.js'
import type { PageSummary, LinkRecord, Issue } from './types.js'

export const LinksContext = createContext<{
  pages: PageSummary[]
  currentSlug: string
  anchors: string[]
  editLink: (path: string, record: LinkRecord, rect: DOMRect) => void
}>({
  pages: [],
  currentSlug: 'index',
  anchors: [],
  editLink: () => {},
})

export const IssueContext = createContext<Issue[]>([])

/** Which props of the section being edited can be dropped. ValueEditor reads it to offer Remove, Add and "empty hides it". */
export const OptionalContext = createContext<{ content: OptionalContent | undefined }>({ content: undefined })
