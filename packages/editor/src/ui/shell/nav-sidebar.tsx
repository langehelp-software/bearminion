import { BearMark } from '../bear-mark.js'
import { Icon } from '../icons.js'
import { useEditor } from '../state/editor.js'
import { isCurrentItem, type NavGroup } from './nav-items.js'

/** The left navigation: content, layout and settings. Collapses to an icon rail with ⌘\. */
export function NavSidebar({ groups }: { groups: NavGroup[] }) {
  const { doc, ui, chrome } = useEditor()
  const open = ui.navOpen.value
  const view = ui.view.value
  const ref = doc.ref.value
  return (
    <nav class={open ? 'bm-nav bm-chrome' : 'bm-nav bm-nav-rail bm-chrome'} aria-label="Editor">
      <div class="bm-nav-brand">
        <BearMark class="bm-nav-mark" />
        {open && (
          <span class="bm-nav-brand-text">
            <span class="bm-nav-name">BearMinion</span>
            <span class="bm-nav-slogan">Git-based CMS</span>
          </span>
        )}
      </div>
      <div class="bm-nav-groups">
        {groups.map((group) => (
          <div class="bm-nav-group" key={group.label} role="group" aria-label={group.label}>
            {open ? <p class="bm-nav-group-label">{group.label}</p> : <hr class="bm-nav-divider" />}
            {group.items.map((item) => {
              const current = isCurrentItem(item, view, ref)
              return (
                <button
                  key={item.view}
                  type="button"
                  class={current ? 'bm-nav-item bm-nav-item-on' : 'bm-nav-item'}
                  aria-current={current ? 'page' : undefined}
                  aria-label={open ? undefined : item.label}
                  onClick={() => ui.openView(item.view)}
                >
                  <Icon name={item.icon} size={18} />
                  {open && <span class="bm-nav-label-text">{item.label}</span>}
                  {open && item.count !== undefined && <span class="bm-nav-count">{item.count}</span>}
                  {!open && (
                    <span class="bm-tip" role="tooltip">
                      {item.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div class="bm-nav-foot">
        <button
          type="button"
          class="bm-nav-item bm-nav-collapse"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={open}
          aria-keyshortcuts="Control+Backslash Meta+Backslash"
          onClick={chrome.toggleNav}
        >
          <Icon name="panel-left" size={18} />
          {open ? (
            <>
              <span class="bm-nav-label-text">Collapse</span>
              <kbd class="bm-kbd">⌘\</kbd>
            </>
          ) : (
            <span class="bm-tip" role="tooltip">
              Expand sidebar · ⌘\
            </span>
          )}
        </button>
      </div>
    </nav>
  )
}
