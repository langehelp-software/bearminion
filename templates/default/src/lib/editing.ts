/**
 * True while someone is editing: on the dev server, and on the hosted editor's own deployment (its build sets
 * BEARMINION_HOSTED). A built public site is neither, so editor hints and editor-only image routes stay out of it.
 */
export const editing = Boolean(import.meta.env.DEV || import.meta.env.BEARMINION_HOSTED)
