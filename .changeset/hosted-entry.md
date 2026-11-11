---
'bearminion': minor
'create-bearminion': minor
---

Add `bearminion/hosted` (experimental): the editor API without Node, for a Worker or a serverless function, with `createHostedContext`, `handleHostedRequest` and `githubStore`. The editor API itself no longer imports Node modules: undo history, Commit changes and the form-handler lookup are now optional capabilities of the editor context, which the local dev editor fills in as before.
