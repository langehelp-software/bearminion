import type {
  ApiIssue,
  ApiProblem,
  CommitRequest,
  CommitResult,
  ContentTypeInfo,
  CreatePageRequest,
  DocumentAt,
  EntryListItem,
  GitInfo,
  PageListItem,
  RestoreResult,
  SaveRequest,
  SaveResponse,
  SitePreview,
  UploadedImage,
  UploadedVideo,
  VersionCommit,
  VersionFile,
  VersionPage,
} from '../api-types.js'
import type { PageDraft } from '../draft.js'
import type { UploadRules } from '../upload-rules.js'
import type { Catalog, SiteDraft } from './types.js'

export const API = '/__bearminion/api'

/** A response body, or the issues that explain why there is none. Network failures land here too. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string; issues: ApiIssue[] }

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, init)
  } catch {
    return failure(0, 'The dev server did not answer.')
  }
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) return { ok: true, value: body as T }
  const problem = isProblem(body) ? body : null
  const message = problem?.message ?? `Request failed (${response.status}).`
  return { ok: false, status: response.status, message, issues: problem?.issues?.length ? problem.issues : [{ path: '(root)', message }] }
}

function failure(status: number, message: string): ApiResult<never> {
  return { ok: false, status, message, issues: [{ path: '(root)', message }] }
}

function isProblem(value: unknown): value is ApiProblem {
  return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'
}

const sendJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const segment = encodeURIComponent

export const getCatalog = () => request<Catalog>('/schema')
export const getSite = () => request<SiteDraft>('/site')
export const getPages = () => request<{ pages: PageListItem[] }>('/pages')
/** The document the address shows, and of which content type it is. A listing page's document has no slug. */
export const getDocumentAt = (pathname: string) => request<DocumentAt<PageDraft>>(`/document?path=${segment(pathname)}`)
export const getTypes = () => request<{ types: ContentTypeInfo[] }>('/types')
export const getEntries = (type: string) => request<{ entries: EntryListItem[] }>(`/types/${segment(type)}/entries`)
/** Where the entries of a type are created and deleted. Pages keep their own route. */
const entriesPath = (type: string) => (type === 'pages' ? '/pages' : `/types/${segment(type)}/entries`)
export const createEntry = (type: string, body: CreatePageRequest) => request<PageDraft>(entriesPath(type), sendJson('POST', body))
export const deleteEntry = (type: string, slug: string) =>
  request<{ deleted: true; slug: string }>(`${entriesPath(type)}/${segment(slug)}`, { method: 'DELETE' })

/** Validate and write the page (with any rename or move to home) and the site together. */
export const saveDraft = (body: SaveRequest<PageDraft, SiteDraft>) =>
  request<SaveResponse<PageDraft, SiteDraft>>('/save', sendJson('POST', body))

export const previewPage = (page: PageDraft, motion: boolean, type?: string) =>
  request<{ html: string }>('/preview', sendJson('POST', { page, motion, ...(type === undefined ? {} : { type }) }))
export const previewSite = (site: SiteDraft, pathname: string) =>
  request<SitePreview>('/preview/site', sendJson('POST', { site, pathname }))

export const getImages = (usage = false) =>
  request<{ images: UploadedImage[]; limits?: UploadRules }>(usage ? '/images?usage=1' : '/images')
export const deleteImage = (filename: string) =>
  request<{ deleted: true; filename: string }>(`/images/${segment(filename)}`, { method: 'DELETE' })
export function uploadImage(file: File) {
  const body = new FormData()
  body.set('file', file)
  return request<UploadedImage>('/images', { method: 'POST', body })
}

export const getVideos = () => request<{ videos: UploadedVideo[]; maxBytes: number }>('/videos')
export const deleteVideo = (filename: string) =>
  request<{ deleted: true; filename: string }>(`/videos/${segment(filename)}`, { method: 'DELETE' })
export function uploadVideo(file: File) {
  const body = new FormData()
  body.set('file', file)
  return request<UploadedVideo>('/videos', { method: 'POST', body })
}

export const getGit = () => request<GitInfo>('/git')
/** Whether the form handlers the sections post to exist in `src/forms`. */
export const getForms = () => request<{ enabled: boolean; handlers: Record<string, { file: string | null }> }>('/forms')
export const commit = (body: CommitRequest) => request<CommitResult>('/git/commit', sendJson('POST', body))

/** Commits of the content and the uploads, newest first; `cursor` from the previous page for older ones. */
export const listVersions = (cursor?: string) => request<VersionPage>(`/versions${cursor ? `?cursor=${segment(cursor)}` : ''}`)
/** One commit and the content files it changed. */
export const getVersion = (sha: string) => request<{ commit: VersionCommit; files: VersionFile[] }>(`/versions/${segment(sha)}`)
/** Where the bytes of `path` at commit `sha` are served: an image's `src`. */
export const versionFileUrl = (sha: string, path: string) => `${API}/versions/${segment(sha)}/file?path=${segment(path)}`

/** The text of `path` at `sha`: a string, `undefined` when it did not exist there, or `null` when it could not be read. */
export async function getVersionText(sha: string, path: string): Promise<string | undefined | null> {
  try {
    const response = await fetch(versionFileUrl(sha, path))
    if (response.status === 404) return undefined
    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

/** Put the files of `sha` (all, or `paths`) back as they were there, as a new commit. */
export const restoreVersion = (sha: string, paths?: readonly string[]) =>
  request<RestoreResult>(`/versions/${segment(sha)}/restore`, sendJson('POST', paths ? { paths } : {}))
