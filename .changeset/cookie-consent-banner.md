---
"bearminion": minor
"create-bearminion": minor
---

Cookie banner for analytics. `site.consent` (`enabled`, `title`, `body`, `accept`, `reject`, `settings`, `policyLabel`, `policyHref`) is optional, and the banner is on by default: a site that has analytics snippets now asks visitors first, so one that did not want a banner needs `consent.enabled: false` (Site tab, Cookie banner switch). The template sets Google Consent Mode v2 to denied before any tag, keeps the snippets in `<template>` until the visitor accepts, then sends the update and runs them. A footer link, or a corner cookie icon (`reopen: "icon"`), reopens the banner, and withdrawing clears Google Analytics cookies and reloads. The Site tab has a Cookie banner group with the switch and an Edit banner dialog for the text and a privacy policy link. `siteConsentSchema`, `CONSENT_REOPEN`, `consentCopy`, `CONSENT_COPY`, `CONSENT_LIMITS`, `CONSENT_HREF` and `consentTextIssues` are exported. Themes that emit the snippets should hold them back the same way (see the theme docs).
