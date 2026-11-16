import type { APIRoute } from 'astro'
import { getSite } from '../lib/content'

/**
 * SEO › Indexing in the editor: "Allow search engines" off (site.seo.robots false) disallows the whole site, and
 * "Generate sitemap.xml" off (site.seo.sitemap false) leaves the Sitemap line out, as the build has no sitemap then.
 */
export const GET: APIRoute = async ({ site: origin }) => {
  const { seo } = await getSite()
  const lines = ['User-agent: *', seo.robots === false ? 'Disallow: /' : 'Allow: /']
  if (seo.sitemap !== false) lines.push(`Sitemap: ${new URL('sitemap-index.xml', origin ?? new URL('https://example.com')).href}`)
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
