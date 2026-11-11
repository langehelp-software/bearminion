---
'bearminion': minor
'create-bearminion': minor
---

Add `createHostedEditor` to `bearminion/hosted` (experimental): GitHub App sign-in (OAuth with PKCE, encrypted session cookie) in front of the editor API. Each request runs on the signed-in person's own GitHub token, so commits are authored by them and the repository's branch rules apply; only people with push access to the repository may sign in.
