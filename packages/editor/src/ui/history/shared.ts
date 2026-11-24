import { useEffect, useState } from 'preact/hooks'
import type { VersionCommit, VersionPage } from '../../api-types.js'
import { type ChangeEntry, describePageChanges, describeSiteChanges } from '../../changes.js'
import type { DraftSnapshot } from '../../undo-history.js'
import { listVersions } from '../api-client.js'
import type { PageSummary } from '../types.js'

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** What one undo step changed: the page's fields, then the site's. */
export function stepChanges(
  before: DraftSnapshot,
  after: DraftSnapshot,
  labels: Record<string, string>,
): { scope: 'page' | 'site'; item: ChangeEntry }[] {
  const page = before.page === after.page ? [] : describePageChanges(parse(before.page), parse(after.page), labels)
  const site = before.site === after.site ? [] : describeSiteChanges(parse(before.site), parse(after.site))
  return [...page.map((item) => ({ scope: 'page' as const, item })), ...site.map((item) => ({ scope: 'site' as const, item }))]
}

/** "Hero › heading, title +2": the first fields a step or a commit changed. */
export function changeSummary(entries: readonly ChangeEntry[]): string {
  const names = [...new Set(entries.map((entry) => entry.field))]
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

/** "14:05". */
export function clock(time: number | string): string {
  const date = new Date(time)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Where a listed document lives: `pages/about.json`, `singles/pricing.json`, `blog/first-post.json`. */
const fileOf = (item: PageSummary): string => `${item.fixed === 'single' ? 'singles' : (item.type ?? 'pages')}/${item.file}`

/** A content file by what people call it: "Site settings", the page's title, or its path. */
export function documentLabel(key: string | undefined, path: string, pages: readonly PageSummary[]): string {
  if (key === 'site.json') return 'Site settings'
  const found = key ? pages.find((item) => fileOf(item) === key) : undefined
  return found?.title || path
}

export type CommitsState =
  | { status: 'loading' }
  | { status: 'failed'; message: string; missing: boolean }
  | { status: 'ready'; commits: VersionCommit[]; cursor?: string; branch?: string; restoreCommits: boolean; more: boolean }

/** The commit history, newest first, with `loadMore` for older pages. `reload` starts over. */
export function useCommits(): { state: CommitsState; loadMore: () => void; reload: () => void } {
  const [state, setState] = useState<CommitsState>({ status: 'loading' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    void listVersions().then((result) => {
      if (!live) return
      if (!result.ok) setState({ status: 'failed', message: result.message, missing: result.status === 404 })
      else setState(ready(result.value, []))
    })
    return () => {
      live = false
    }
  }, [round])

  function loadMore() {
    if (state.status !== 'ready' || !state.cursor) return
    const known = state.commits
    void listVersions(state.cursor).then((result) => {
      if (result.ok) setState(ready(result.value, known))
    })
  }

  return { state, loadMore, reload: () => setRound((value) => value + 1) }
}

function ready(page: VersionPage, known: VersionCommit[]): CommitsState {
  const seen = new Set(known.map((commit) => commit.sha))
  return {
    status: 'ready',
    commits: [...known, ...page.commits.filter((commit) => !seen.has(commit.sha))],
    ...(page.cursor ? { cursor: page.cursor } : {}),
    ...(page.branch ? { branch: page.branch } : {}),
    restoreCommits: page.restoreCommits,
    more: page.cursor !== undefined,
  }
}
