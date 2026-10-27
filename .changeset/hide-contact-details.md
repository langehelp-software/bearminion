---
'bearminion': minor
'create-bearminion': minor
---

A detail in the Contact section has a **Hide from crawlers** switch. Switched on, the built page carries the email address or phone number scrambled and a few lines of script show it when the page loads, so crawlers that only read the HTML find nothing to collect. It is off by default and changes nothing for existing sites. The editor can now show an optional on/off switch on a list item that does not have it yet. The form recipe for Resend reads the sender and receiver from `CONTACT_FROM` and `CONTACT_TO`, so no address is written into the repository.
