---
'bearminion': minor
'create-bearminion': minor
---

New starter sections and editor features.

- **Gallery** section: grid, masonry and featured layouts, a keyboard-friendly lightbox, an optional box around each picture, and required alt text.
- **Text** section: long-form rich text for an About or policy page, with a narrow, readable column on by default. Rich-text fields can opt into **H2** and **H3** (`data-rich-headings`); `renderRichText`, `sanitizeRichHtml` and `stripPlainRich` take a `{ headings }` option.
- **Media** now covers video: the separate Video section is gone, and Media gains `playback` (`controls` or `loop`). Content `schemaVersion` 2 migrates existing Video sections to Media automatically.
- **Video uploads**: upload an mp4, webm, mov or ogv to `public/videos` from the editor (`videosDir`, `maxVideoBytes`, default 50 MB), pick an uploaded one, and see what a pasted link is or why it will not play. New API routes `GET`/`POST /videos` and `DELETE /videos/:filename`.
- `parseMediaSource` and `VIDEO_FILE` are exported from `bearminion`.
