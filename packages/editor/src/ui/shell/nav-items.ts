import type { ContentTypeInfo } from '../../api-types.js'
import { listingType, listingView, type View } from '../../shell.js'
import type { IconName } from '../icons.js'
import type { DocumentRef, PageSummary } from '../types.js'

export interface NavItem {
  view: View
  label: string
  icon: IconName
  /** Entries of a content type, shown beside it while the navigation is open. */
  count?: number
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** A type can be named after what it holds; anything else gets the layers icon. */
function typeIcon(type: ContentTypeInfo): IconName {
  if (/blog|post|news|article/.test(type.id)) return 'pen'
  if (/doc|guide|manual|book/.test(type.id)) return 'book'
  return 'layers'
}

/** What a listing of `pages` holds: pages, the home and 404 pages, and the singles. */
export function isPagesListed(item: PageSummary): boolean {
  return item.type === undefined || item.fixed === 'single'
}

/**
 * The navigation. Content types are read from the site, never hard-coded: Pages is built in, every multi type the
 * content model declares follows, and Media is always last.
 */
export function navGroups(types: readonly ContentTypeInfo[], documents: readonly PageSummary[], media: boolean): NavGroup[] {
  const declared = types.filter((type) => type.kind === 'multi' && !type.builtIn)
  const content: NavItem[] = [
    { view: listingView('pages'), label: 'Pages', icon: 'file-text', count: documents.filter(isPagesListed).length },
    ...declared.map((type) => ({
      view: listingView(type.id),
      label: type.label,
      icon: typeIcon(type),
      count: documents.filter((item) => item.type === type.id && item.fixed === undefined).length,
    })),
    ...(media ? [{ view: 'media' as const, label: 'Media', icon: 'image' as const }] : []),
  ]
  return [
    { label: 'Content', items: content },
    {
      label: 'Layout',
      items: [
        { view: 'navigation', label: 'Navigation', icon: 'menu' },
        { view: 'footer', label: 'Footer', icon: 'panel-bottom' },
      ],
    },
    {
      label: 'Settings',
      items: [
        { view: 'site', label: 'Site', icon: 'globe' },
        { view: 'design', label: 'Design', icon: 'palette' },
        { view: 'seo', label: 'SEO', icon: 'search' },
      ],
    },
  ]
}

/** Which content type a document of `ref` lists under: singles are listed with the pages. */
export function listedType(ref: DocumentRef): string {
  return ref.kind === 'single' ? 'pages' : ref.type
}

/** The item that is current: the open full-screen view, or on the canvas the content type of the open document. */
export function isCurrentItem(item: NavItem, view: View, ref: DocumentRef): boolean {
  if (view !== 'canvas') return item.view === view
  return listingType(item.view) === listedType(ref)
}

/** "Settings / Design" in the top bar: the group a view belongs to and its own name. */
export function viewTitle(groups: readonly NavGroup[], view: View): { group: string; label: string } {
  for (const group of groups) {
    const item = group.items.find((candidate) => candidate.view === view)
    if (item) return { group: group.label, label: item.label }
  }
  return { group: '', label: '' }
}
