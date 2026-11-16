import type { ComponentChildren } from 'preact'
import { listingType, SETTINGS_VIEWS, type SettingsView, type View } from '../../shell.js'
import { IssueContext, LinksContext } from '../context.js'
import { useEditor } from '../state/editor.js'
import type { Catalog } from '../types.js'
import { ListingView } from './listing.js'
import { MediaView } from './media.js'
import { DesignPanel, FooterPanel, NavigationPanel, SaveIssues, SitePanel } from './panels.js'

/** Title and the file a settings screen writes. */
const SETTINGS: Record<SettingsView, { title: string; file: string }> = {
  navigation: { title: 'Navigation', file: 'site.json → header' },
  footer: { title: 'Footer', file: 'site.json → footer' },
  site: { title: 'Site', file: 'site.json' },
  design: { title: 'Design', file: 'site.json → theme' },
  seo: { title: 'SEO', file: 'site.json → seo' },
}

/** A centred column with a title and its file. Each group of the form inside is drawn as a card. */
function SettingsScreen({ view, children }: { view: SettingsView; children: ComponentChildren }) {
  const { title, file } = SETTINGS[view]
  return (
    <div class="bm-screen">
      <header class="bm-screen-head">
        <h1 class="bm-screen-title">{title}</h1>
        <p class="bm-screen-file">{file}</p>
      </header>
      <SaveIssues />
      <div class="bm-screen-cards">{children}</div>
    </div>
  )
}

function SettingsBody({ view, catalog }: { view: SettingsView; catalog: Catalog }) {
  const { doc } = useEditor()
  const site = doc.site.value
  if (!site) return <p class="bm-note">Loading the site settings.</p>
  switch (view) {
    case 'navigation':
      return <NavigationPanel site={site} catalog={catalog} />
    case 'footer':
      return <FooterPanel site={site} catalog={catalog} />
    case 'design':
      return <DesignPanel site={site} />
    case 'site':
      return <SitePanel site={site} catalog={catalog} />
    case 'seo':
      return <SitePanel site={site} catalog={catalog} part="seo" />
  }
}

/** A full-screen view over the canvas and the inspector: a content listing, Media or a settings screen. */
export function FullView({ view, catalog }: { view: Exclude<View, 'canvas'>; catalog: Catalog }) {
  const { doc, ui, links } = useEditor()
  const type = listingType(view)
  const settings = (SETTINGS_VIEWS as readonly string[]).includes(view) ? (view as SettingsView) : null
  return (
    <main class="bm-view bm-panel bm-chrome" aria-label="Editor view">
      <IssueContext.Provider value={ui.issues.value.filter((issue) => issue.file === undefined || issue.file === 'site')}>
        <LinksContext.Provider
          value={{ pages: doc.pages.value, currentSlug: doc.linkKey.value, anchors: doc.anchors.value, editLink: links.open }}
        >
          {type !== null ? (
            <ListingView key={type} catalog={catalog} type={type} />
          ) : view === 'media' ? (
            <MediaView />
          ) : settings ? (
            <SettingsScreen view={settings}>
              <SettingsBody view={settings} catalog={catalog} />
            </SettingsScreen>
          ) : null}
        </LinksContext.Provider>
      </IssueContext.Provider>
    </main>
  )
}
