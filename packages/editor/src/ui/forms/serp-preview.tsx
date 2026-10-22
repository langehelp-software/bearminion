import { text } from '../shared.js'

/** Address as a search result shows it: no scheme, no `www.`, no trailing slash. Without a site URL, the path alone. */
export function serpUrl(siteUrl: string, slug: string): string {
  const path = slug === 'index' ? '' : `/${slug}`
  const host = siteUrl
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
  return host === '' ? path || '/' : `${host}${path}`
}

/** A search result as the page would appear in one. */
export function SerpPreview({
  seo,
  pageTitle,
  slug,
  siteName,
  siteUrl,
}: {
  seo: Record<string, unknown>
  pageTitle: string
  slug: string
  siteName: string
  siteUrl: string
}) {
  const shownTitle = text(seo.title) || pageTitle
  return (
    <div class="bm-serp" aria-hidden="true">
      <span class="bm-serp-title">{siteName ? `${shownTitle} · ${siteName}` : shownTitle}</span>
      <span class="bm-serp-url">{serpUrl(siteUrl, slug)}</span>
      <span class="bm-serp-desc">{text(seo.description) || 'No description yet.'}</span>
    </div>
  )
}
