import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://example.com')
  const sitemap = new URL('sitemap-index.xml', origin)
  const body = `User-agent: *\nAllow: /\nSitemap: ${sitemap.href}\n`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
