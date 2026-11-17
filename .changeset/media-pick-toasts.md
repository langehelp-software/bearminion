---
"bearminion": patch
---

Picking an image from the library for an empty image slot on the page now stores an `{ src, alt }` image, so the page saves instead of failing with "expected object, received string". Save failures, upload and delete errors, and the "Another tab saved this page" notice now show as toasts at the bottom right of every screen: they stack, stay until you dismiss them, and a failed save's toast goes away once a save succeeds.

Navigation, Footer, Site and Design settings now open in the right-hand sidebar instead of covering the page, so the header, footer, colours and page they change stay in view while you edit. The sidebar has the inspector's resize edge and shares its width; Close or Escape goes back to the inspector. SEO, Media and the content listings stay full-screen.

The Media screen shows placeholder cards while the image library loads, and each thumbnail shimmers until its file arrives, instead of starting as an empty screen.
