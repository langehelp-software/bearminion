# Handoff: Site status (option 2a)

## Overview
Editor screen at **Developer / Site status**. For the developer: which BearMinion release the site runs, whether each section file matches it, which sections aren't installed, and what else can be added. Option **2a** in `Site Status.dc.html` is the chosen direction (1a layout + 1b compact list). Use the **All up to date / Needs attention** switch above 2a to see both states.

## About the Design Files
`Site Status.dc.html` is a **design reference in HTML**, not production code. Rebuild it inside the existing editor shell using its components and `design_handoff_editor_v4/editor-tokens.css` (`--bm-*`). The rail and top bar in the mock only give context; use the real ones. `support.js` is the prototype runtime only.

## Fidelity
**High-fidelity.** Section names, descriptions and add commands are from the current screen. The attention examples (FAQ out of date, Hero changed, Changelog and Compare not installed) are sample data.

## Layout
- Content padding 2.5rem / 2.5rem / 3rem. Title block, then grid `minmax(0,1fr) | 24rem`, gap 1.5rem, `align-items: start`.
- Title `Site status`: 32px / 650 / −0.035em. Subtitle 15px `--bm-help` (copy unchanged).
- Section headers (Installed sections, Not installed, More to add): mono 11px uppercase, tracking `--bm-tracking-section`, `--bm-section`; 10px padding then 1px `--bm-divider`. Optional 12px `--bm-muted` hint beside.

## 1. Status card (main column, top)
White, 1px `--bm-border`, radius `--bm-r-card`. Two cells split by a 1px `--bm-divider`:
- **Left** (min 15rem, padding 1.25rem 1.5rem): mono label `RUNNING`; `bearminion` + version in mono (22px / 620); badge `Latest release` (`--bm-badge-green-*`, radius `--bm-r-chip`). If not latest: amber badge `Update available · 1.26.0`.
- **Right**: 24px round status icon + 17px / 600 line:
  - All OK: ✓ green, "All 17 sections up to date"
  - Attention: ! amber, "2 of 15 sections need attention · 2 not installed"
  - Below: help text (13px) + `npx bearminion status` command chip.

## 2. Installed sections (main column)
Header with count badge: `17 · all up to date` (green) or `15 · 2 need attention` (amber).
One white card (1px `--bm-border`, radius 10px, padding 0 1rem) holding rows:
- Grid `9rem | minmax(0,1fr) | auto`, gap 0.375rem 1rem, padding 0.75rem 0, 1px `--bm-divider` between rows (none on last).
- Name 14px / 600 · description 13px `--bm-help`, single line with ellipsis (full text as `title`) · right: status badge (only if not OK) + key in mono 11px `--bm-muted`.
- **No "Up to date" badge** on healthy rows; the summary covers them.
- **Sort**: rows needing attention first, then alphabetical.
- **Attention row**: below the row, spanning columns 2–end, a note box (radius 8px, padding 10px 10px 10px 14px): 12px text on the left, command chip on the right (white, inset 1px `--bm-border`, radius 7px, 32px, mono 12px, copy icon).

| State | Badge | Note box bg | Note | Command |
|---|---|---|---|---|
| Out of date | `--bm-badge-amber-*` "Out of date" | `oklch(0.97 0.025 80)` | A newer version ships with this release. | `npx bearminion update <key>` |
| Changed locally | `--bm-fill-hover` / `--bm-label` "Changed" | `--bm-fill-soft` | Edited in this project. Updating would replace your edits, so the file is left alone. See the difference first. | `npx bearminion diff <key>` |

⚠ `update` and `diff` are **placeholder commands**; replace with the real CLI. `add <key>` for sections follows the existing `add blog` pattern; confirm.

## 3. Not installed (main column, only if any)
Header hint: "In this release, not in this site yet". Card with **1px dashed** `oklch(0.85 0.005 250)` border, radius 10px, padding 0 1rem. Rows: same grid, padding 0.625rem 0, name `--bm-label`, description `--bm-muted`, right: command chip `npx bearminion add <key>` (`--bm-fill` bg, radius 7px, 32px).

## 4. More to add (side column)
Stack of cards (gap 0.75rem): white, 1px `--bm-border`, radius 10px, padding 1rem. Title 14px / 600, description 12px `--bm-help`, then full-width command chip (36px, `--bm-fill`, radius `--bm-r-control`, mono 12px, copy icon right). Long commands wrap (`overflow-wrap:anywhere`). Copy unchanged from the current screen.

## Interactions
- Copy icon on every command chip: copies the command, swaps to ✓ "Copied" for 1.5s.
- Description ellipsis shows full text on hover (`title`).
- Data comes from the same source as `npx bearminion status` (installed sections + hash compare against the release manifest).

## Responsive
Below ~1100px content width the side column drops under the main column. Below ~640px rows stack: name + badge, description, key.

## Files
- `Site Status.dc.html`: design (2a at top with state switch; 1a, 1b below)
- `support.js`: prototype runtime only
