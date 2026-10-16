import { anchorSet, getAt } from '../../draft.js'
import { DesignForm } from '../design-form.js'
import { BrandLogoForm } from '../forms/brand-logo-form.js'
import { FooterForm } from '../forms/footer-form.js'
import { PageForm } from '../forms/page-form.js'
import { PagesForm } from '../forms/pages-form.js'
import { SectionForm } from '../forms/section-form.js'
import { Segmented } from '../forms/segmented.js'
import { SiteForm, SiteGroup, siteOptionControl } from '../forms/site-form.js'
import { Icon } from '../icons.js'
import { NavForm } from '../nav.js'
import { text } from '../shared.js'
import { headerActions, navLinks, themeColorsOf } from '../site-draft.js'
import { useEditor } from '../state/editor.js'
import type { Catalog, SiteDraft } from '../types.js'

/** The sidebar adds a section from its outline: the picker opens beside the sidebar, at the button's height. */
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

export function PagesPanel({ catalog }: { catalog: Catalog }) {
  const { doc, ui, edits, sections, session } = useEditor()
  const page = doc.page.value
  const site = doc.site.value
  const savedSlug = doc.savedSlug.value
  return (
    <>
      <PagesForm
        pages={doc.pages.value}
        labels={catalog.sectionLabels}
        current={savedSlug}
        homeSlug={page && page.slug === 'index' ? savedSlug : 'index'}
        onCreated={() => void session.load(doc.savedSlug.peek())}
        onNavigate={session.requestLeave}
      />
      {page && (
        <PageForm
          page={page}
          labels={catalog.sectionLabels}
          siteName={text(site?.name)}
          siteUrl={text(site?.url)}
          selectedId={ui.selectedId.value}
          onChange={(next) => edits.updatePage(next)}
          savedSlug={savedSlug}
          onHomeChange={session.setHome}
          images={doc.images.value}
          onUploaded={doc.addImage}
          onDeleted={doc.dropImage}
          onAddSection={(anchor) => {
            ui.picker.value = {
              id: page.sections[page.sections.length - 1]?.id ?? '',
              where: 'below',
              at: {
                top: Math.max(8, Math.min(anchor.top - 300, window.innerHeight - PICKER_HEIGHT)),
                left: Math.max(8, window.innerWidth - ui.sidebarWidth.peek() - PICKER_OFFSET),
              },
            }
          }}
          onSelectSection={(id) => {
            ui.selectSection(id)
            ui.tab.value = 'section'
          }}
          onMoveSection={sections.move}
          onReorderSections={sections.reorder}
          onDuplicateSection={sections.askDuplicate}
          onRemoveSection={sections.askDelete}
        />
      )}
    </>
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

export function SitePanel({ site, catalog }: { site: SiteDraft; catalog: Catalog }) {
  const { doc, edits } = useEditor()
  return (
    <SiteForm
      site={site}
      options={catalog.siteOptions}
      images={doc.images.value}
      onField={edits.writeField}
      onOptional={edits.writeOrClear}
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
      currentSlug={doc.currentSlug.value}
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
      currentSlug={doc.currentSlug.value}
      currentAnchors={doc.anchors.value}
      onField={edits.writeField}
      onOptional={edits.writeOrClear}
    />
  )
}
