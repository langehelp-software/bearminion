---
'bearminion': patch
'create-bearminion': patch
---

Fix the release of `create-bearminion`, which was never published after 1.8.0: publishing both packages rebuilt them at the same time, and bearminion's build emptied the files create-bearminion's build was reading. The release now builds each package once, in order.
