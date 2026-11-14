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

/** One type in `GET /types`. */
export interface ContentTypeInfo {
  id: string
  kind: 'single' | 'multi'
  label: string
  /** The address: `/about` for a single, `/blog/{slug}` for the entries of a multi type. */
  path: string
  /** True for the home page, the 404 page and `pages`, which every site has. */
  builtIn: boolean
  /** The type's own fields as JSON Schema, one per key, or null when it declares none. */
  fields: { name: string; required: boolean; schema: Record<string, unknown> | null; readOnly: boolean }[] | null
  /** The section types a document of this type may use, or null for all of them. */
  sections: string[] | null
  /** Multi types only. Null keeps the order of the files. */
  sort?: { by: string; order: 'asc' | 'desc' } | null
  /** Multi types only. */
  listing?: { slug: string; perPage: number; path: string } | null
  rename?: boolean
  delete?: boolean
}

/** `GET /types/:id/entries`. */
export interface EntryListItem {
  slug: string
  title: string
  file: string
  /** The entry's address, such as `/blog/first-post`. */
  path: string
  /** The value the list is ordered by, when that is one of the type's fields. */
  sortValue?: unknown
  anchors: string[]
}

/** `GET /images` entries and the body of a successful `POST /images`. */
export interface UploadedImage {
  filename: string
  /** Project-relative path, the value image fields store. */
  path: string
  bytes?: number
}

/** `GET /videos` entries and the body of a successful `POST /videos`. */
export interface UploadedVideo {
  filename: string
  /** Project-relative path of the file. */
  path: string
  /** What a Media section's `video` field holds, such as `/videos/demo-1a2b3c4d.mp4`. */
  url: string
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
    /** The id of the entry's content type. Default `pages`. */
    type?: string
    /** Slug the page is stored under now. When `document.slug` differs, the page is renamed. */
    from: string
    document: TPage
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
