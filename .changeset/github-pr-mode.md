---
'bearminion': minor
'create-bearminion': minor
---

`githubStore` gets `mode: 'pr'`: each edited page gets a branch and a pull request of its own, later saves join it, and nothing is ever merged. Stores can now expose `scoped(scope)` for this, and the editor API uses it per page, site, upload and batch save.
