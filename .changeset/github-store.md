---
'bearminion': minor
'create-bearminion': minor
---

Add an experimental `githubStore` (`bearminion/astro`): a content store that commits edits to a GitHub repository through the Git Data API. One save is one commit, and uploads are committed as binary files. Store failures now reach the editor as readable errors (`branch_protected`, `github_auth`, `github_rate_limited`, and others) instead of a generic 500.
