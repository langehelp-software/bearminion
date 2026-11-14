export interface SitemapPage {
  slug: string
  seo: {
    noindex?: boolean
  }
}

/** One address of the site, as `siteRoutes()` lists them: a page, an entry, a single or one page of a listing. */
export interface SitemapRoute {
  path: string
  page: SitemapPage
}

/** Public path for a content slug. The home page is stored as `index`. */
export function pagePath(slug: string): string {
  return slug === 'index' ? '/' : `/${slug}`
}

/** Compare sitemap URLs and content paths with or without a trailing slash. */
export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname || '/'
}

/**
 * Sitemap `filter` for `@astrojs/sitemap`.
 * Keeps only content-loader pages whose `seo.noindex` is not true.
 * Static routes that are not in the content directory (the style guide, for example) are left out.
 */
export function createSitemapFilter(pages: readonly (SitemapPage | SitemapRoute)[]): (pageUrl: string) => boolean {
  const indexable = new Set(
    pages
      // A route carries its own address. A bare page is at `/<slug>`.
      .map((item) => ('path' in item ? { path: item.path, seo: item.page.seo } : { path: pagePath(item.slug), seo: item.seo }))
      .filter((item) => item.seo.noindex !== true)
      .map((item) => item.path),
  )

  return (pageUrl: string) => {
    let pathname = pageUrl
    try {
      pathname = new URL(pageUrl).pathname
    } catch {
      pathname = pageUrl
    }
    return indexable.has(normalizePathname(pathname))
  }
}
