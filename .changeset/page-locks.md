---
'bearminion': minor
---

`bearminion({ pages: { rename: false, delete: false } })` locks page operations for sites whose addresses carry search ranking or are the target of redirects. Both default to `true`, so nothing changes unless you set them. A locked operation is refused by the API with `409` `operation_locked`, whoever asks: the rename route, the delete route, set-home, and a save that changes a slug (making another page the home page counts as a rename, because the old home page moves to a new address). The editor makes the slug read-only, disables the Home page switch and hides Delete. `GET /schema` reports the rules as `pageRules`.
