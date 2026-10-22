import { useEffect, useRef, useState } from 'preact/hooks'
import {
  CONSENT_COPY,
  CONSENT_LIMITS,
  type ConsentReopen,
  type ConsentText,
  type ConsentTextKey,
  consentCopy,
  consentTextIssues,
} from '../../consent.js'
import { Field } from '../forms/fields.js'
import { Segmented } from '../forms/segmented.js'
import { DialogClose } from './dialog.js'

const KEYS: readonly ConsentTextKey[] = ['title', 'body', 'accept', 'reject', 'settings', 'policyLabel', 'policyHref']

type Draft = Record<ConsentTextKey, string>

function startDraft(consent: ConsentText): Draft {
  const copy = consentCopy(consent)
  return {
    title: copy.title,
    body: copy.body,
    accept: copy.accept,
    reject: copy.reject,
    settings: copy.settings,
    policyLabel: copy.policyLabel,
    policyHref: copy.policyHref ?? '',
  }
}

/**
 * What the draft saves: only the texts that differ from the theme's own, so a site that never changed a
 * text keeps following the default. An emptied field goes back to the default too.
 */
export function savedConsentText(draft: Draft): ConsentText {
  const saved: ConsentText = {}
  for (const key of KEYS) {
    const value = draft[key].trim()
    const fallback: string = key === 'policyHref' ? '' : CONSENT_COPY[key]
    if (value !== '' && value !== fallback) saved[key] = value
  }
  return saved
}

/**
 * The words of the cookie banner. It edits a copy: Apply writes it to the site draft in one step, Cancel and
 * Escape drop it. On and off lives in the sidebar, so this dialog never changes it.
 */
export function ConsentDialog({
  consent,
  reopen: startReopen,
  onApply,
  onClose,
}: {
  consent: ConsentText
  reopen: ConsentReopen
  onApply: (text: ConsentText, reopen: ConsentReopen) => void
  onClose: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Draft>(() => startDraft(consent))
  const [reopen, setReopen] = useState<ConsentReopen>(startReopen)
  const saved = savedConsentText(draft)
  const issues = consentTextIssues(saved)
  const valid = Object.keys(issues).length === 0
  const preview = consentCopy(saved)

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('input, textarea')?.focus()
  }, [])

  const set = (key: ConsentTextKey) => (value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const field = (
    key: ConsentTextKey,
    label: string,
    extra: { hint?: string; multiline?: boolean; limit?: number; mono?: boolean } = {},
  ) => (
    <Field
      label={label}
      value={draft[key]}
      onChange={set(key)}
      hint={issues[key] ? undefined : extra.hint}
      multiline={extra.multiline}
      mono={extra.mono}
      meta={extra.limit ? `${draft[key].length} / ${extra.limit}` : undefined}
    />
  )

  return (
    <div class="bm-scrim">
      <div class="bm-dialog bm-consent" role="dialog" aria-modal="true" aria-label="Edit cookie banner" ref={root}>
        <div class="bm-dialog-head">
          <div class="bm-dialog-heading">
            <h2 class="bm-dialog-title">Cookie banner</h2>
            <p class="bm-dialog-sub">Applied to the site draft. Nothing is written until you save.</p>
          </div>
          <DialogClose onClose={onClose} />
        </div>
        <div class="bm-consent-body">
          <div class="bm-consent-preview" aria-hidden="true">
            <p class="bm-consent-preview-title">{preview.title}</p>
            <p class="bm-consent-preview-text">
              {preview.body}
              {preview.policyHref && <span class="bm-consent-preview-link"> {preview.policyLabel}</span>}
            </p>
            <div class="bm-consent-preview-buttons">
              <span>{preview.accept}</span>
              <span>{preview.reject}</span>
            </div>
          </div>
          <div class="bm-stack">
            <p class="bm-group">Text</p>
            {field('title', 'Title', { limit: CONSENT_LIMITS.title })}
            {field('body', 'Message', { multiline: true, limit: CONSENT_LIMITS.body })}
            <div class="bm-row-split">
              {field('accept', 'Accept button')}
              {field('reject', 'Reject button')}
            </div>
          </div>
          <div class="bm-stack">
            <p class="bm-group">Privacy policy</p>
            {field('policyHref', 'Policy page', {
              hint: 'Optional. A page on this site, such as /privacy, or a full address. Leave empty for no link.',
              mono: true,
            })}
            {field('policyLabel', 'Policy link text')}
          </div>
          <div class="bm-stack">
            <p class="bm-group">Changing the choice</p>
            <Segmented
              label="Visitors reopen it with"
              value={reopen}
              options={[
                { value: 'footer', label: 'Footer link' },
                { value: 'icon', label: 'Corner icon' },
              ]}
              onChange={(value) => setReopen(value === 'icon' ? 'icon' : 'footer')}
            />
            {field('settings', reopen === 'icon' ? 'Icon label' : 'Footer link text', {
              hint:
                reopen === 'icon'
                  ? 'A small cookie icon in the bottom-left corner, shown once the banner is closed. The label is read out by screen readers.'
                  : 'The link stays in the footer after visitors choose, so they can change their mind.',
            })}
          </div>
          {Object.entries(issues).map(([key, message]) => (
            <span class="bm-error" role="alert" key={key}>
              {KEY_LABEL[key as ConsentTextKey]}: {message}
            </span>
          ))}
        </div>
        <div class="bm-actions">
          <button type="button" class="bm-primary" disabled={!valid} onClick={() => onApply(saved, reopen)}>
            Apply
          </button>
          <button type="button" class="bm-tertiary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const KEY_LABEL: Record<ConsentTextKey, string> = {
  title: 'Title',
  body: 'Message',
  accept: 'Accept button',
  reject: 'Reject button',
  settings: 'Footer link text or icon label',
  policyLabel: 'Policy link text',
  policyHref: 'Policy page',
}
