import type { JSX } from 'preact'
import { describePageChanges, describeSiteChanges } from '../../changes.js'
import { getAt, type PageDraft } from '../../draft.js'
import type { JsonLdBlock } from '../../json-ld.js'
import { isSystemPage } from '../../page.js'
import { text } from '../shared.js'
import { consentReopenOf, consentTextOf, siteJsonLdOf, siteJsonLdSourceOf } from '../site-draft.js'
import { type Editor, useEditor } from '../state/editor.js'
import { ScrollLock } from '../scroll-lock.js'
import type { EditorDialog } from '../state/ui.js'
import type { Catalog, ConfirmAction } from '../types.js'
import { ChangesDialog } from './changes-dialog.js'
import { CommitDialog } from './commit-dialog.js'
import { ConsentDialog } from './consent-dialog.js'
import { ConfirmDialog, LeaveDialog } from './dialog.js'
import { HistoryDialog } from './history-dialog.js'
import { SeoDialog } from './seo-dialog.js'
import { SiteJsonLdDialog } from './site-jsonld-dialog.js'

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Dialog body and note for duplicate and delete. The target is bold and named the way the toolbar names it. */
function confirmCopy(confirm: ConfirmAction, page: PageDraft | null, catalog: Catalog | null): { body: JSX.Element; note: string } {
  const section = page?.sections.find((item) => item.id === confirm.id)
  const label = section ? (catalog?.sectionLabels[section.type] ?? section.type) : 'this section'
  const name = section?.anchor ? `${label} · #${section.anchor}` : label
  if (confirm.action === 'duplicate') {
    return {
      body: (
        <>
          Insert a copy of <strong>{name}</strong> right after it.
        </>
      ),
      note: 'The copy is a draft edit until you save.',
    }
  }
  const links = section?.anchor ? `Links to #${section.anchor} will stop working. ` : ''
  return {
    body: (
      <>
        Remove <strong>{name}</strong> from this page.
      </>
    ),
    note: `${links}Nothing is written until you save.`,
  }
}

/** Confirm before a section is duplicated or deleted. */
export function SectionConfirm() {
  const { doc, ui, sections } = useEditor()
  const confirm = ui.confirm.value
  if (!confirm) return null
  const remove = confirm.action === 'delete'
  return (
    <>
      <ScrollLock />
      <ConfirmDialog
        label={remove ? 'Delete section' : 'Duplicate section'}
        {...confirmCopy(confirm, doc.page.value, doc.catalog.value)}
        tone={remove ? 'danger' : 'neutral'}
        icon={remove ? 'trash' : 'copy'}
        confirmLabel={remove ? 'Delete' : 'Duplicate'}
        danger={remove}
        onConfirm={sections.confirm}
        onCancel={() => {
          ui.confirm.value = null
        }}
      />
    </>
  )
}

/** The one modal dialog that is up, if any. */
export function SessionDialogs() {
  const editor = useEditor()
  const dialog = editor.ui.dialog.value
  if (!dialog) return null
  return (
    <>
      <ScrollLock />
      <SessionDialog editor={editor} dialog={dialog} />
    </>
  )
}

function SessionDialog({ editor, dialog }: { editor: Editor; dialog: EditorDialog }) {
  const { doc, ui, session, edits } = editor
  const close = () => {
    ui.dialog.value = null
  }
  switch (dialog.kind) {
    case 'history': {
      const page = doc.page.value
      if (!page || !doc.site.value) return null
      return (
        <HistoryDialog
          slug={doc.savedSlug.value}
          labels={doc.catalog.value?.sectionLabels ?? {}}
          page={page}
          onRestore={editor.restoreVersion}
          onUndo={editor.stepUndo}
          onClose={close}
        />
      )
    }
    case 'commit': {
      const git = ui.gitState.value
      if (!git) return null
      return <CommitDialog info={git} unsaved={doc.dirty.value} onDone={() => void session.loadGit()} onClose={close} />
    }
    case 'seo': {
      const page = doc.page.value
      if (!page) return null
      return (
        <SeoDialog
          page={page}
          siteName={text(doc.site.value?.name)}
          siteUrl={text(doc.site.value?.url)}
          system={isSystemPage(page.slug)}
          images={doc.images.value}
          issues={ui.issues.value.filter((issue) => issue.file !== 'site')}
          onUploaded={doc.addImage}
          onDeleted={doc.dropImage}
          onApply={(seo) => {
            edits.updatePage({ ...page, seo })
            close()
          }}
          onClose={close}
        />
      )
    }
    case 'consent': {
      const site = doc.site.value
      if (!site) return null
      return (
        <ConsentDialog
          consent={consentTextOf(site)}
          reopen={consentReopenOf(site)}
          onApply={(consent, reopen) => {
            // Only the texts go into `consent`; `enabled` stays as the sidebar set it.
            const enabled = getAt(site, 'consent.enabled')
            const next = { ...(enabled === undefined ? {} : { enabled }), ...(reopen === 'icon' ? { reopen } : {}), ...consent }
            edits.writeField('consent', Object.keys(next).length > 0 ? next : undefined)
            close()
          }}
          onClose={close}
        />
      )
    }
    case 'siteJsonLd': {
      const site = doc.site.value
      if (!site) return null
      return (
        <SiteJsonLdDialog
          blocks={siteJsonLdOf(site)}
          source={siteJsonLdSourceOf(site)}
          onApply={(blocks: JsonLdBlock[]) => {
            edits.writeField('seo.jsonLd', blocks.length > 0 ? blocks : undefined)
            close()
          }}
          onClose={close}
        />
      )
    }
    case 'discard':
      return (
        <ConfirmDialog
          label="Discard changes"
          body="Throw away every unsaved change to this page and the site, and reload both from the saved files?"
          note="This cannot be undone."
          tone="danger"
          icon="rotate-ccw"
          confirmLabel="Discard"
          danger
          onConfirm={() => {
            close()
            session.discardAndGo(null)
          }}
          onCancel={close}
        />
      )
    case 'changes':
      if (!doc.dirty.value) return null
      return (
        <ChangesDialog
          files={[
            {
              file: doc.pageFile.value,
              scope: 'page',
              entries: describePageChanges(parseJson(doc.savedPageJson.value), doc.page.value, doc.catalog.value?.sectionLabels),
            },
            { file: 'site.json', scope: 'site', entries: describeSiteChanges(parseJson(doc.savedSiteJson.value), doc.site.value) },
          ]}
          onSave={() => {
            close()
            void session.saveAndGo(null)
          }}
          onDiscard={() => {
            ui.dialog.value = { kind: 'discard' }
          }}
          onClose={close}
        />
      )
    case 'leave':
      return (
        <LeaveDialog
          onSave={() => {
            close()
            void session.saveAndGo(dialog.href)
          }}
          onDiscard={() => {
            close()
            session.discardAndGo(dialog.href)
          }}
          onCancel={close}
        />
      )
    case 'home':
      return (
        <ConfirmDialog
          label="Replace home page?"
          body={
            <>
              <strong>{dialog.title}</strong> is already the home page. If you continue, it moves to <strong>/{dialog.previousSlug}</strong>{' '}
              and this page is served at / once you save.
            </>
          }
          tone="warn"
          icon="alert"
          confirmLabel="Replace home page"
          onConfirm={() => {
            session.becomeHome(dialog.previousSlug)
            close()
          }}
          onCancel={close}
        />
      )
  }
}
