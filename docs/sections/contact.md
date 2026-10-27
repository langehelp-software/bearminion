---
title: Contact
description: "Contact details beside a form."
sidebar:
  order: 14
  label: Contact
---

Contact details beside a form.

The form always posts to `/api/contact`, where a handler you write in `src/forms/contact.ts` receives the message. Its keys, including the Cloudflare Turnstile site key (`PUBLIC_TURNSTILE_SITE_KEY`), live in the environment, not in the content file. While that file does not exist, `astro dev` and `astro build` warn, the section's settings in the editor warn, and visitors who send the form get an error. [Forms](../forms/README.md) covers the handler, the glue for your host, form services, email, Turnstile and spam.

**`split`** (default): the heading and details on the left, the form on the right.

![Contact, split layout: heading and an email address on the left, a form on the right.](../images/sections/contact-split.webp)

**`card`**: a centered heading over a form in a card.

![Contact, card layout: a centered heading above a card holding the form.](../images/sections/contact-card.webp)

**`minimal`**: a large heading and a form with underlined fields.

![Contact, minimal layout: a large heading above a form with underlined fields and a send button.](../images/sections/contact-minimal.webp)

Content: `details` (a `label` and a `value` each, such as an email address) and `topics` (the choices in the topic menu), three of each recommended. Optional: `eyebrow`, `heading`, `body`, `note` and `thanks`. When the handler answers with a `message`, the visitor sees it in place of `thanks`. A failed send shows its error in a message at the bottom of the screen that stays until the visitor closes it.

### Keep an email address or phone number from crawlers

Each detail has a **Hide from crawlers** switch. When it is on, the built page carries the value scrambled instead of as readable text, and a few lines of script show it to the visitor when the page loads. A crawler that only reads the HTML, which is most of them, finds no address or number to collect.

- **It is obfuscation, not encryption.** The page has to show the value, so a browser, and any crawler that runs the page's script, can recover it. It also does not cover the same value anywhere else: in other sections, in the sitewide JSON-LD, or in your content files and repository.
- **Without JavaScript** the visitor reads "Turn on JavaScript to see this, or use the form." and can still send a message.
- **In the editor** the value stays readable and editable. The switch is off for new details.


## Add it to your site

A site made before this section existed gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add contact
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
