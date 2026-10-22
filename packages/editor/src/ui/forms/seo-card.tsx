import { useContext } from 'preact/hooks'
import type { PageDraft } from '../../draft.js'
import { IssueContext } from '../context.js'
import { Icon } from '../icons.js'
import { text } from '../shared.js'
import { SerpPreview } from './serp-preview.js'

/** The page's search result and a summary of its SEO settings. The fields are edited in the SEO dialog. */
export function SeoCard({
  page,
  siteName,
  siteUrl,
  system,
  onEdit,
}: {
  page: PageDraft
  siteName: string
  siteUrl: string
  system: boolean
  onEdit: () => void
}) {
  const seo = page.seo
  const issues = useContext(IssueContext).filter((issue) => issue.path === 'seo' || issue.path.startsWith('seo.'))
  const jsonLd = Array.isArray(seo.jsonLd) ? seo.jsonLd.length : 0
  const badges = [
    system || seo.noindex === true ? 'noindex' : '',
    !system && seo.nofollow === true ? 'nofollow' : '',
    text(seo.canonical) ? 'canonical' : '',
    text(seo.ogImage) ? 'OG image' : '',
    jsonLd > 0 ? `JSON-LD · ${jsonLd}` : '',
  ].filter(Boolean)
  return (
    <div class="bm-seo-card">
      <SerpPreview seo={seo} pageTitle={page.title} slug={page.slug} siteName={siteName} siteUrl={siteUrl} />
      {badges.length > 0 && (
        <ul class="bm-seo-badges" aria-label="SEO settings in use">
          {badges.map((badge) => (
            <li key={badge} class="bm-seo-badge">
              {badge}
            </li>
          ))}
        </ul>
      )}
      {issues.map((issue) => (
        <span class="bm-error" role="alert" key={`${issue.path}:${issue.message}`}>
          {issue.message}
        </span>
      ))}
      <button type="button" class="bm-tertiary bm-seo-edit" onClick={onEdit}>
        <Icon name="settings" size={14} />
        Edit SEO
      </button>
    </div>
  )
}
