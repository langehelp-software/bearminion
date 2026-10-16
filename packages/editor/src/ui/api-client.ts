import type {
  ApiIssue,
  ApiProblem,
  CommitRequest,
  CommitResult,
  CreatePageRequest,
  GitInfo,
  HistoryEntry,
  PageListItem,
  SaveRequest,
  SaveResponse,
  SitePreview,
  UploadedImage,
} from '../api-types.js'
import type { PageDraft } from '../draft.js'
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
export const getPage = (slug: string) => request<PageDraft>(`/pages/${segment(slug)}`)
export const createPage = (body: CreatePageRequest) => request<PageDraft>('/pages', sendJson('POST', body))
export const deletePage = (slug: string) => request<{ deleted: true; slug: string }>(`/pages/${segment(slug)}`, { method: 'DELETE' })

/** Validate and write the page (with any rename or move to home) and the site together. */
export const saveDraft = (body: SaveRequest<PageDraft, SiteDraft>) =>
  request<SaveResponse<PageDraft, SiteDraft>>('/save', sendJson('POST', body))

export const previewPage = (page: PageDraft, motion: boolean) => request<{ html: string }>('/preview', sendJson('POST', { page, motion }))
export const previewSite = (site: SiteDraft, pathname: string) =>
  request<SitePreview>('/preview/site', sendJson('POST', { site, pathname }))

export const getImages = () => request<{ images: UploadedImage[] }>('/images')
export const deleteImage = (filename: string) =>
  request<{ deleted: true; filename: string }>(`/images/${segment(filename)}`, { method: 'DELETE' })
export function uploadImage(file: File) {
  const body = new FormData()
  body.set('file', file)
  return request<UploadedImage>('/images', { method: 'POST', body })
}

export const getGit = () => request<GitInfo>('/git')
export const commit = (body: CommitRequest) => request<CommitResult>('/git/commit', sendJson('POST', body))

/** Saved versions of the site (`scope` site) or of one page. */
function historyPath(scope: 'page' | 'site', slug: string): string {
  return scope === 'page' ? `/history/pages/${segment(slug)}` : '/history/site'
}
export const listHistory = (scope: 'page' | 'site', slug: string) => request<{ entries: HistoryEntry[] }>(historyPath(scope, slug))
export const getHistoryVersion = (scope: 'page' | 'site', slug: string, id: string) =>
  request<unknown>(`${historyPath(scope, slug)}/${segment(id)}`)
