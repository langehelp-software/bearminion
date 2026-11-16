/**
 * True while someone is editing: on the dev server, and on the hosted editor's own deployment (its build sets
 * BEARMINION_HOSTED). A built public site is neither, so editor hints and editor-only image routes stay out of it.
 */
export const editing = Boolean(import.meta.env.DEV || import.meta.env.BEARMINION_HOSTED)

/**
 * True wherever an empty frame should still be drawn, so a layout shows its shape: while editing, and in the section
 * previews the docs build (apps/docs/scripts/build-previews.mjs sets BEARMINION_PREVIEWS). A public site leaves them out.
 */
export const placeholders = editing || Boolean(import.meta.env.BEARMINION_PREVIEWS)
