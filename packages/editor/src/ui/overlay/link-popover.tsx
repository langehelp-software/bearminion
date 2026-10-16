import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { fitPopover } from '../../toolbar-place.js'
import { DialogClose } from '../dialogs/dialog.js'
import { Icon } from '../icons.js'
import { Info } from '../info.js'
import { LinkControl } from '../nav.js'
import { stepRadio } from '../shared.js'
import { isPagePath } from '../state/document.js'
import { useEditor } from '../state/editor.js'
import type { LinkEdit } from '../types.js'

const LINK_STYLES: readonly { value: string; label: string; sample: string }[] = [
  { value: '', label: 'Default', sample: 'Auto' },
  { value: 'primary', label: 'Primary', sample: 'Button' },
  { value: 'secondary', label: 'Secondary', sample: 'Button' },
  { value: 'tertiary', label: 'Tertiary', sample: 'Link' },
]

/** Right side of the collapsed Advanced row: "Secondary · #get-starter", or empty when nothing is set. */
function advancedSummary(edit: Pick<LinkEdit, 'style' | 'id' | 'path'>): string {
  const parts: string[] = []
  if (edit.style !== '' && isPagePath(edit.path)) parts.push(edit.style[0]?.toUpperCase() + edit.style.slice(1))
  if (edit.id.trim() !== '') parts.push(`#${edit.id.trim()}`)
  return parts.join(' · ')
}

type Box = { top: number; left: number }

/** Keeps the popover inside the viewport once its real size is known. */
function useFittedBox(node: { current: HTMLDivElement | null }, anchor: Box): Box {
  const [box, setBox] = useState<Box | null>(null)
  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    const next = fitPopover({
      top: anchor.top,
      left: anchor.left,
      width: element.offsetWidth || 280,
      height: element.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    setBox((current) => (current && current.top === next.top && current.left === next.left ? current : next))
  })
  return box ?? anchor
}

/** Edit a button, a nav link or a link inside rich text: label, target, new window, and for buttons style and ID. */
export function LinkPopover() {
  const { ui } = useEditor()
  const edit = ui.linkEdit.value
  return edit ? <LinkPopoverBody edit={edit} /> : null
}

function LinkPopoverBody({ edit }: { edit: LinkEdit }) {
  const { doc, links } = useEditor()
  const root = useRef<HTMLDivElement>(null)
  const box = useFittedBox(root, edit)
  return (
    <div class="bm-popover" role="dialog" aria-label="Edit link" ref={root} style={`top:${box.top}px;left:${box.left}px;width:290px;`}>
      <div class="bm-popover-head">
        <span class="bm-popover-title" aria-hidden="true">
          Edit link
        </span>
        <DialogClose onClose={links.close} />
      </div>
      <label class="bm-label">
        Label
        <input aria-label="Label" value={edit.label} onInput={(event) => links.update({ label: event.currentTarget.value })} />
      </label>
      <LinkControl
        href={edit.href}
        pages={doc.pages.value}
        currentSlug={doc.currentSlug.value}
        currentAnchors={doc.anchors.value}
        onChange={(href) => links.update({ href })}
      />
      <label class="bm-switch-row">
        <span class="bm-switch-text">
          <span class="bm-switch-title">Open in new window</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Open in new window"
          checked={edit.newTab}
          onChange={(event) => links.update({ newTab: event.currentTarget.checked })}
        />
      </label>
      {edit.button && <AdvancedLink edit={edit} />}
      <div class="bm-actions">
        <button type="button" class="bm-primary" onClick={links.apply}>
          Apply
        </button>
        <button type="button" class="bm-tertiary" onClick={links.close}>
          Cancel
        </button>
        {edit.removable && (
          <button type="button" class="bm-tertiary bm-danger bm-actions-remove" onClick={links.remove}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

/** The collapsed Advanced row of a button: its style override and its ID. */
function AdvancedLink({ edit }: { edit: LinkEdit }) {
  const { links } = useEditor()
  const setStyle = (style: string) => links.update({ style })
  return (
    <div class="bm-advanced">
      <button
        type="button"
        class="bm-advanced-toggle"
        aria-expanded={edit.advanced}
        onClick={() => links.update({ advanced: !edit.advanced })}
      >
        <span class="bm-chevron" aria-hidden="true">
          <Icon name="chevron-right" size={12} />
        </span>
        Advanced
        <span class="bm-advanced-summary">{advancedSummary(edit)}</span>
      </button>
      {edit.advanced && isPagePath(edit.path) && (
        <div class="bm-field">
          <span class="bm-label">
            <span class="bm-label-text">
              Style
              <Info
                label="About button style"
                text="Default keeps the look this section was designed with. Pick a style only to override it."
              />
            </span>
          </span>
          <div
            class="bm-tones bm-tones-2"
            role="radiogroup"
            aria-label="Button style"
            onKeyDown={(event) =>
              stepRadio(
                event,
                LINK_STYLES.map((choice) => choice.value),
                edit.style,
                setStyle,
              )
            }
          >
            {LINK_STYLES.map((choice) => (
              <button
                type="button"
                key={choice.value}
                role="radio"
                class="bm-tone"
                aria-checked={edit.style === choice.value}
                tabIndex={edit.style === choice.value ? 0 : -1}
                onClick={() => setStyle(choice.value)}
              >
                <span class={`bm-btnsample bm-btnsample-${choice.value === '' ? 'default' : choice.value}`} aria-hidden="true">
                  <span>{choice.sample}</span>
                </span>
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {edit.advanced && (
        <div class="bm-field">
          <label class="bm-label">
            ID
            <input
              class="bm-mono"
              aria-label="ID"
              aria-describedby="bm-link-id-hint"
              placeholder="get-starter"
              value={edit.id}
              onInput={(event) => links.update({ id: event.currentTarget.value })}
            />
          </label>
          <p class="bm-hint" id="bm-link-id-hint">
            For #links and analytics. Must not match a section anchor.
          </p>
        </div>
      )}
    </div>
  )
}
