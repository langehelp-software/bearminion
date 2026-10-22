import type { JSX } from 'preact'
import { getAt } from '../../draft.js'
import type { MarkPatch } from '../../marks.js'
import { Icon } from '../icons.js'
import { type LibraryImage, ImageField } from '../image-field.js'
import { Info } from '../info.js'
import { text, isImageRecord } from '../shared.js'
import { consentEnabled, hasAnalyticsSnippet } from '../site-draft.js'
import type { SiteDraft, Option } from '../types.js'
import { OptionControl, Field } from './fields.js'
import { Segmented } from './segmented.js'
import { WordmarkEditor } from './wordmark.js'

const SITE_GROUPS: { prefix: string; title: string }[] = [{ prefix: 'theme.', title: 'Theme' }]

/** One site option as a control: color mode is a segmented control, other enums are selects, booleans are switches. */
export function siteOptionControl(site: SiteDraft, option: Option, onField: (path: string, value: unknown) => void): JSX.Element {
  const hint = option.name === 'theme.motion' ? 'Site default. Sections can override.' : undefined
  if (option.type === 'enum' && option.name === 'theme.mode' && (option.choices?.length ?? 0) <= 3) {
    return (
      <Segmented
        key={option.name}
        label={option.label}
        value={text(getAt(site, option.name) || option.default)}
        options={(option.choices ?? []).map((choice) => ({ value: choice, label: choice[0]?.toUpperCase() + choice.slice(1) }))}
        onChange={(value) => onField(option.name, value)}
      />
    )
  }
  return (
    <OptionControl
      key={option.name}
      option={option}
      path={option.name}
      hint={hint}
      value={getAt(site, option.name)}
      onChange={(value) => onField(option.name, value)}
    />
  )
}

export function SiteForm({
  site,
  options,
  images,
  onField,
  onOptional,
  onConsentEnabled,
  onEditConsent,
  onMarks,
  onUploaded,
  onDeleted,
}: {
  site: SiteDraft
  options: readonly Option[]
  images: LibraryImage[]
  onField: (path: string, value: unknown) => void
  /** Optional text fields: an empty value removes the key instead of saving "". */
  onOptional: (path: string, value: string) => void
  /** The cookie banner switch. */
  onConsentEnabled: (enabled: boolean) => void
  /** Opens the dialog with the banner's text. */
  onEditConsent: () => void
  onMarks: (path: string, patch: MarkPatch, start: number, end: number) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
}) {
  const logo = getAt(site, 'favicon') ?? getAt(site, 'logo')
  const groupOf = (option: Option) => SITE_GROUPS.find((group) => option.name.startsWith(group.prefix))
  const shown = options.filter(
    (option) => !option.name.startsWith('footer.') && !option.name.startsWith('header.') && option.name !== 'theme.mode',
  )
  const ungrouped = shown.filter((option) => !groupOf(option))
  const control = (option: Option) => siteOptionControl(site, option, onField)
  return (
    <div class="bm-stack">
      <div class="bm-stack">
        <p class="bm-group">Identity</p>
        <WordmarkEditor
          name={text(site.name)}
          marks={getAt(site, 'nameMarks')}
          onName={(value) => onField('name', value)}
          onMarks={(patch, start, end) => onMarks('name', patch, start, end)}
        />
        <Field label="URL" path="url" value={text(site.url)} onChange={(value) => onField('url', value)} mono />
        <ImageField
          label="Favicon"
          path="favicon"
          layout={false}
          value={isImageRecord(logo) ? logo : undefined}
          images={images}
          onChange={(next) => {
            // `logo` is the legacy name. Writing the new key drops it so the draft never holds both.
            onField('logo', undefined)
            onField('favicon', next)
          }}
          onUploaded={onUploaded}
          onDeleted={onDeleted}
        />
      </div>
      <div class="bm-stack">
        <p class="bm-group">Search defaults</p>
        <Field
          label="Title template"
          path="seo.titleTemplate"
          value={text(getAt(site, 'seo.titleTemplate'))}
          onChange={(value) => onOptional('seo.titleTemplate', value)}
          hint="%s becomes the page SEO title."
          mono
        />
        <Field
          label="Description"
          path="seo.description"
          value={text(getAt(site, 'seo.description'))}
          onChange={(value) => onOptional('seo.description', value)}
          hint="Used by pages that don't set their own."
          multiline
          meta={`${text(getAt(site, 'seo.description')).length} / 160`}
        />
        <ImageField
          label="OG image"
          path="seo.ogImage"
          withAlt={false}
          value={{ src: text(getAt(site, 'seo.ogImage')) }}
          images={images}
          onChange={(next) => onOptional('seo.ogImage', next.src)}
          onUploaded={onUploaded}
          onDeleted={onDeleted}
        />
      </div>
      <div class="bm-stack">
        <p class="bm-group">Analytics &amp; scripts</p>
        <Field
          label="Head"
          path="analytics.head"
          value={text(getAt(site, 'analytics.head'))}
          onChange={(value) => onOptional('analytics.head', value)}
          hint="Added at the end of the page head. Paste the snippet your analytics tool gives you, script tags included."
          multiline
          mono
        />
        <Field
          label="End of body"
          path="analytics.bodyEnd"
          value={text(getAt(site, 'analytics.bodyEnd'))}
          onChange={(value) => onOptional('analytics.bodyEnd', value)}
          hint="Added just before the closing body tag, for tools that ask for it there."
          multiline
          mono
        />
        <p class="bm-hint">Runs on your live site only: not while you edit, and not on Vercel or Netlify previews.</p>
      </div>
      <ConsentGroup
        enabled={consentEnabled(site)}
        snippets={hasAnalyticsSnippet(site)}
        onEnabled={onConsentEnabled}
        onEdit={onEditConsent}
      />
      {SITE_GROUPS.map((group) => {
        const items = shown.filter((option) => groupOf(option) === group)
        if (items.length === 0) return null
        return <SiteGroup key={group.prefix} title={group.title} items={items} control={control} />
      })}
      {ungrouped.length > 0 && (
        <div class="bm-stack">
          <p class="bm-group">Other</p>
          {ungrouped.map(control)}
        </div>
      )}
    </div>
  )
}

/** Selects that belong side by side (variant and tone) share a row. Switches and the rest stack. */
export function SiteGroup({
  title,
  items,
  control,
  extra,
}: {
  title: string
  items: Option[]
  control: (option: Option) => JSX.Element
  extra?: JSX.Element
}) {
  const pairs = items.filter((option) => option.type === 'enum' && !option.name.endsWith('.mode'))
  const rest = items.filter((option) => !pairs.includes(option))
  return (
    <div class="bm-stack">
      <p class="bm-group">{title}</p>
      {rest.filter((option) => option.type === 'enum' || option.type === 'string').map(control)}
      {pairs.length > 0 && <div class="bm-row-split">{pairs.map(control)}</div>}
      {rest.filter((option) => option.type !== 'enum' && option.type !== 'string').map(control)}
      {extra}
    </div>
  )
}

/** The cookie banner: a switch here, its text in a dialog. */
function ConsentGroup({
  enabled,
  snippets,
  onEnabled,
  onEdit,
}: {
  enabled: boolean
  /** Whether an analytics snippet is set. Without one the banner has nothing to ask about. */
  snippets: boolean
  onEnabled: (enabled: boolean) => void
  onEdit: () => void
}) {
  const status = !enabled
    ? 'Off. Your snippets run for every visitor from the first page, EU visitors included.'
    : snippets
      ? 'On. Your snippets wait until the visitor accepts. Visitors can change their mind from a footer link.'
      : 'On. It appears once you add an analytics snippet above.'
  return (
    <div class="bm-stack">
      <p class="bm-group">Cookie banner</p>
      <label class="bm-switch-row">
        <span class="bm-switch-text">
          <span class="bm-switch-title">
            Ask before analytics runs
            <Info
              label="About the cookie banner"
              text="Visitors in the EU and UK must agree before analytics cookies are set. With the banner on, nothing from the snippets loads until they accept. Google tags also get Consent Mode v2 signals."
            />
          </span>
        </span>
        <input type="checkbox" role="switch" checked={enabled} onChange={(event) => onEnabled(event.currentTarget.checked)} />
      </label>
      <p class="bm-hint">{status}</p>
      <button type="button" class="bm-tertiary bm-consent-edit" onClick={onEdit}>
        <Icon name="settings" size={14} />
        Edit banner
      </button>
    </div>
  )
}
