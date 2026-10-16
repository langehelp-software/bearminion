export interface SitemapPage {
  slug: string
  seo: {
    noindex?: boolean
  }
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
export function createSitemapFilter(pages: readonly SitemapPage[]): (pageUrl: string) => boolean {
  const indexable = new Set(pages.filter((page) => page.seo.noindex !== true).map((page) => pagePath(page.slug)))

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
