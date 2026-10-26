---
'bearminion': patch
'create-bearminion': patch
---

Fixed an error in the browser console, "Cannot read properties of undefined (reading 'toLowerCase')", when the browser autofilled a form on a page with the editor. Autofill sends key events without a `key`, and the editor's keyboard shortcuts assumed one.
