import { anchorSet, getAt } from '../../draft.js'
import { DesignForm } from '../design-form.js'
import { BrandLogoForm } from '../forms/brand-logo-form.js'
import { FooterForm } from '../forms/footer-form.js'
import { PageForm } from '../forms/page-form.js'
import { SectionForm } from '../forms/section-form.js'
import { Segmented } from '../forms/segmented.js'
import { SiteForm, SiteGroup, siteOptionControl } from '../forms/site-form.js'
import { Icon } from '../icons.js'
import { NavForm } from '../nav.js'
import { text } from '../shared.js'
import { headerActions, navLinks, themeColorsOf } from '../site-draft.js'
import { useEditor } from '../state/editor.js'
import type { Catalog, SiteDraft } from '../types.js'

/** The inspector adds a section from its outline: the picker opens beside the inspector, at the button's height. */
const PICKER_HEIGHT = 440
const PICKER_OFFSET = 536

const FILE_LABELS = { page: 'Page', site: 'Site settings' } as const

export function SaveIssues() {
  const { ui } = useEditor()
  const issues = ui.issues.value
  if (issues.length === 0) return null
  return (
    <div class="bm-alert" role="alert">
      <p class="bm-alert-title">
        <Icon name="alert" />
        Save failed. Nothing was written.
      </p>
      {issues.map((issue) => (
        <p class="bm-error" key={`${issue.file ?? ''}:${issue.path}:${issue.message}`}>
          {issue.file ? `${FILE_LABELS[issue.file]} › ` : ''}
          {issue.path}: {issue.message}
        </p>
      ))}
    </div>
  )
}

export function SectionPanel({ catalog }: { catalog: Catalog }) {
  const { doc, ui, edits, sections, preview } = useEditor()
  const page = doc.page.value
  const selected = page?.sections.find((section) => section.id === ui.selectedId.value)
  if (!page || !selected) return <p class="bm-note">Hover a section on the page to edit its options.</p>
  return (
    <SectionForm
      section={selected}
      index={page.sections.findIndex((section) => section.id === selected.id)}
      sections={page.sections}
      catalog={catalog}
      siteMotion={getAt(doc.site.value, 'theme.motion') !== false}
      onSelect={ui.selectSection}
      onDuplicate={() => sections.askDuplicate(selected.id)}
      onDelete={() => sections.askDelete(selected.id)}
      taken={anchorSet(page.sections.filter((item) => item.id !== selected.id))}
      images={doc.images.value}
      onField={edits.writeField}
      onUploaded={doc.addImage}
      onDeleted={doc.dropImage}
      onPreview={preview.schedulePage}
    />
  )
}

/** What the open document can be called in the inspector: a page (home and 404 included), an entry, a single, a listing page. */
function documentKind(ref: { type: string; kind: 'entry' | 'single' | 'listing' }) {
  return ref.kind === 'entry' ? (ref.type === 'pages' ? 'page' : 'entry') : ref.kind
}

/** The inspector's Page tab: the open document's own fields, its search result and its sections. */
export function PagePanel({ catalog }: { catalog: Catalog }) {
  const { doc, ui, edits, sections } = useEditor()
  const page = doc.page.value
  const site = doc.site.value
  const ref = doc.ref.value
  if (!page) return <p class="bm-note">This address is not a content document. Site settings are still editable.</p>
  return (
    <PageForm
      page={page}
      labels={catalog.sectionLabels}
      siteName={text(site?.name)}
      siteUrl={text(site?.url)}
      siteOgImage={text(getAt(site, 'seo.ogImage'))}
      selectedId={ui.selectedId.value}
      onChange={(next) => edits.updatePage(next)}
      canRename={doc.renameRule.value.allowed}
      fixedReason={doc.renameRule.value.reason}
      kind={documentKind(ref)}
      address={ref.kind === 'listing' ? location.pathname : (doc.href.value ?? undefined)}
      fields={ref.kind === 'listing' ? null : (doc.typeInfo.value?.fields ?? null)}
      images={doc.images.value}
      onUploaded={doc.addImage}
      onDeleted={doc.dropImage}
      onEditSeo={() => {
        ui.dialog.value = { kind: 'seo' }
      }}
      onAddSection={(anchor) => {
        ui.picker.value = {
          id: page.sections[page.sections.length - 1]?.id ?? '',
          where: 'below',
          at: {
            top: Math.max(8, Math.min(anchor.top - 300, window.innerHeight - PICKER_HEIGHT)),
            left: Math.max(8, window.innerWidth - ui.inspectorWidth.peek() - PICKER_OFFSET),
          },
        }
      }}
      onSelectSection={ui.showSection}
      onMoveSection={sections.move}
      onReorderSections={sections.reorder}
      onDuplicateSection={sections.askDuplicate}
      onRemoveSection={sections.askDelete}
    />
  )
}

export function DesignPanel({ site }: { site: SiteDraft }) {
  const { doc, edits } = useEditor()
  return (
    <DesignForm
      colors={themeColorsOf(site)}
      modeControl={
        <Segmented
          label="Color mode"
          value={text(getAt(site, 'theme.mode') || 'light')}
          options={['light', 'dark'].map((choice) => ({ value: choice, label: choice[0]?.toUpperCase() + choice.slice(1) }))}
          onChange={(value) => edits.writeField('theme.mode', value)}
        />
      }
      onChange={(path, value) => {
        edits.writeField(`theme.colors.${path}`, value)
        if (value !== undefined) return
        // Clearing the last override of a tone, then of a mode, leaves no empty objects in site.json.
        const parts = path.split('.')
        for (let depth = parts.length - 1; depth >= 1; depth -= 1) {
          const parent = `theme.colors.${parts.slice(0, depth).join('.')}`
          const node = getAt(doc.site.peek(), parent)
          if (typeof node === 'object' && node !== null && Object.keys(node).length === 0) edits.writeField(parent, undefined)
          else break
        }
      }}
    />
  )
}

export function SitePanel({ site, catalog, part = 'site' }: { site: SiteDraft; catalog: Catalog; part?: 'site' | 'seo' }) {
  const { doc, edits, ui } = useEditor()
  return (
    <SiteForm
      part={part}
      site={site}
      options={catalog.siteOptions}
      images={doc.images.value}
      onField={edits.writeField}
      onOptional={(path, value) => {
        edits.writeOrClear(path, value)
        // Clearing the last snippet leaves no empty `analytics` object in site.json.
        if (value !== '' || !path.startsWith('analytics.')) return
        const node = getAt(doc.site.peek(), 'analytics')
        if (typeof node === 'object' && node !== null && Object.keys(node).length === 0) edits.writeOrClear('analytics', '')
      }}
      onConsentEnabled={(enabled) => {
        // Only `false` is stored. Switching back on removes the key, and the last key takes `consent` with it.
        edits.writeField('consent.enabled', enabled ? undefined : false)
        const node = getAt(doc.site.peek(), 'consent')
        if (typeof node === 'object' && node !== null && Object.keys(node).length === 0) edits.writeOrClear('consent', '')
      }}
      onEditConsent={() => {
        ui.dialog.value = { kind: 'consent' }
      }}
      onEditJsonLd={() => {
        ui.dialog.value = { kind: 'siteJsonLd' }
      }}
      onMarks={edits.applyMarksAt}
      onUploaded={doc.addImage}
      onDeleted={doc.dropImage}
    />
  )
}

export function NavigationPanel({ site, catalog }: { site: SiteDraft; catalog: Catalog }) {
  const { doc, edits } = useEditor()
  return (
    <NavForm
      maxActions={catalog.siteLimits?.maxHeaderActions ?? 2}
      layout={
        <>
          <BrandLogoForm
            site={site}
            images={doc.images.value}
            onField={edits.writeField}
            onUploaded={doc.addImage}
            onDeleted={doc.dropImage}
          />
          <SiteGroup
            title="Header layout"
            items={catalog.siteOptions.filter((option) => option.name.startsWith('header.'))}
            control={(option) => siteOptionControl(site, option, edits.writeField)}
          />
        </>
      }
      links={navLinks(site)}
      pages={doc.pages.value}
      currentSlug={doc.linkKey.value}
      currentAnchors={doc.anchors.value}
      actions={headerActions(site)}
      onActions={(next) => {
        // Older drafts may still hold cta/signIn. Drop them so the draft never carries both forms.
        edits.writeOrClear('header.cta', '')
        edits.writeOrClear('header.signIn', '')
        edits.writeField('header.actions', next)
      }}
      onLinks={(links) => edits.writeField('header.links', links)}
    />
  )
}

export function FooterPanel({ site, catalog }: { site: SiteDraft; catalog: Catalog }) {
  const { doc, edits } = useEditor()
  return (
    <FooterForm
      site={site}
      options={catalog.siteOptions}
      maxColumns={catalog.siteLimits?.maxFooterColumns ?? 3}
      pages={doc.pages.value}
      currentSlug={doc.linkKey.value}
      currentAnchors={doc.anchors.value}
      onField={edits.writeField}
      onOptional={edits.writeOrClear}
    />
  )
}
