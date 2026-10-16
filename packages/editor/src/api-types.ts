/**
 * Request and response bodies of the dev editor API (`/__bearminion/api`). The server handlers and the
 * overlay's client both use these, so a changed shape is a type error on both sides.
 */

/** Every error response. `issues` is present on schema validation failures. */
export interface ApiProblem {
  error: string
  message: string
  issues?: ApiIssue[]
}

/** One validation failure: a dotted path into the document and a message. */
export interface ApiIssue {
  path: string
  message: string
  /** Present on `POST /save`, which validates the page and the site together. */
  file?: 'page' | 'site'
}

/** `GET /pages`. */
export interface PageListItem {
  slug: string
  title: string
  /** File name inside the pages directory. */
  file: string
  system?: boolean
  anchors?: string[]
}

/** `GET /images` entries and the body of a successful `POST /images`. */
export interface UploadedImage {
  filename: string
  /** Project-relative path, the value image fields store. */
  path: string
  bytes?: number
}

/** `GET /history/site` and `GET /history/pages/:slug` entries. */
export interface HistoryEntry {
  id: string
  at: string
}

/** `POST /save`. At least one of `page` and `site`. */
export interface SaveRequest<TPage = unknown, TSite = unknown> {
  page?: {
    /** Slug the page is stored under now. When `document.slug` differs, the page is renamed (or made home). */
    from: string
    document: TPage
    /** Where the current home page moves when this page becomes `index`. Required when a home page exists. */
    previousHomeSlug?: string
  }
  site?: TSite
}

/** `POST /save` response: the documents as stored. */
export interface SaveResponse<TPage = unknown, TSite = unknown> {
  page?: TPage
  site?: TSite
}

/** `POST /pages`. `template` is a section type or the slug of a page to copy. */
export interface CreatePageRequest {
  slug: string
  title: string
  template?: string
}

/** `POST /git/commit`. */
export interface CommitRequest {
  message: string
  paths?: string[]
}

export interface CommitResult {
  commit: string
  files: number
}

/** `POST /preview/site`. */
export interface SitePreview {
  header: string
  footer: string
}

export type { ChangedFile, GitInfo } from './git.js'
