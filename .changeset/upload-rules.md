---
'bearminion': minor
---

Upload rules for images. `maxImageBytes` sets the largest image the editor accepts (default 5 MB, as before); the editor now checks it in the browser and names the file size and the limit before anything is uploaded. `imageConvert: { to: 'webp', maxWidth, quality }` makes the editor scale and re-encode images as WebP in the browser before they are uploaded, which keeps large phone photos out of the repository and drops their metadata. It is off by default, an image that would come out larger is kept as it is, and GIFs are never converted. `GET /images` also returns the rules as `limits`.
