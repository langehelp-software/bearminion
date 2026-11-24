import type { ComponentChildren } from 'preact'
import { useRef } from 'preact/hooks'
import { listingType, SETTINGS_VIEWS, type SettingsView, type SideView, type View } from '../../shell.js'
import { IssueContext, LinksContext } from '../context.js'
import { Icon } from '../icons.js'
import { useEditor } from '../state/editor.js'
import type { Catalog } from '../types.js'
import { SidebarResize, useFocusRequest } from './inspector.js'
import { ListingView } from './listing.js'
import { HistoryView } from './history-view.js'
import { MediaView } from './media.js'
import { StatusView } from './status-view.js'
import { DesignPanel, FooterPanel, NavigationPanel, SitePanel } from './panels.js'

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

/** Site links and the open page's anchors for link fields, and the site's issues for the fields they name. */
function SiteContexts({ children }: { children: ComponentChildren }) {
  const { doc, ui, links } = useEditor()
  return (
    <IssueContext.Provider value={ui.issues.value.filter((issue) => issue.file === undefined || issue.file === 'site')}>
      <LinksContext.Provider
        value={{ pages: doc.pages.value, currentSlug: doc.linkKey.value, anchors: doc.anchors.value, editLink: links.open }}
      >
        {children}
      </LinksContext.Provider>
    </IssueContext.Provider>
  )
}

/**
 * Navigation, Footer or Site in the right-hand sidebar, where the inspector usually is, so the page they change stays
 * on the canvas beside them. Same width and resize edge as the inspector; Close (or Escape) goes back to it.
 */
export function SettingsSidebar({ view, catalog }: { view: SideView; catalog: Catalog }) {
  const { ui } = useEditor()
  const root = useRef<HTMLElement>(null)
  useFocusRequest(root)
  const { title, file } = SETTINGS[view]
  return (
    <aside
      class="bm-inspector bm-settings-side bm-panel bm-chrome"
      aria-label={title}
      style={`width:${ui.inspectorWidth.value}px`}
      ref={root}
    >
      <SidebarResize label={`Resize ${title} settings`} />
      <header class="bm-side-head">
        <div class="bm-side-heading">
          <h2 class="bm-side-title">{title}</h2>
          <p class="bm-screen-file">{file}</p>
        </div>
        <button
          type="button"
          class="bm-side-close"
          aria-label={`Close ${title} settings`}
          title="Close (Esc)"
          onClick={() => ui.openView('canvas')}
        >
          <Icon name="x" size={16} />
        </button>
      </header>
      <SiteContexts>
        <div class="bm-body">
          <SettingsBody view={view} catalog={catalog} />
        </div>
      </SiteContexts>
    </aside>
  )
}

/** A full-screen view over the canvas and the inspector: a content listing, Media, History or a settings screen. */
export function FullView({ view, catalog }: { view: Exclude<View, 'canvas'>; catalog: Catalog }) {
  const { doc } = useEditor()
  const type = listingType(view)
  const settings = (SETTINGS_VIEWS as readonly string[]).includes(view) ? (view as SettingsView) : null
  const label =
    type === 'pages'
      ? 'Pages'
      : type !== null
        ? (doc.types.value.find((item) => item.id === type)?.label ?? type)
        : settings
          ? SETTINGS[settings].title
          : view === 'history'
            ? 'History'
            : view === 'status'
              ? 'Site status'
              : 'Media'
  return (
    <main class="bm-view bm-panel bm-chrome" aria-label={label}>
      <SiteContexts>
        {type !== null ? (
          <ListingView key={type} catalog={catalog} type={type} />
        ) : view === 'media' ? (
          <MediaView />
        ) : view === 'history' ? (
          <HistoryView />
        ) : view === 'status' ? (
          <StatusView />
        ) : settings ? (
          <SettingsScreen view={settings}>
            <SettingsBody view={settings} catalog={catalog} />
          </SettingsScreen>
        ) : null}
      </SiteContexts>
    </main>
  )
}
