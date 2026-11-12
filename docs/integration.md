---
title: Astro integration and package
description: "The bearminion package entry points, the Astro integration options, custom content stores and how the package is built."
---

The package's entry points, the integration options, the storage interface and how the package is built.

## Entry points

| Import | Runs | What it has |
| --- | --- | --- |
| `bearminion` | Anywhere (server, browser, Storybook) | Schemas and field helpers, `defineSection`, `defineSite`, `defineTheme`, `defineThemePreview`, `defineWireframe`, marks, the palette (`themeCss`), migrations, API types, and the form types `FormSubmission` and `FormResult` (see [Forms](forms/README.md)) |
| `bearminion/astro` | Node, in `astro.config.ts` | The integration (default export), `createFileStore`, `githubStore`, `loadContent` / `loadPages` / `loadSite` |
| `bearminion/content` | Astro content layer | `contentCollections()` for `src/content.config.ts` |
| `bearminion/rich-text` | Anywhere | `renderRichText` and the rich-text helpers |
| `bearminion/marks` | Anywhere | Heading and wordmark marks |
| `bearminion/forms` | A server or function: Node, Vercel, Netlify, Cloudflare | `defineForm`, `FormError` and `verifyTurnstile`, the server side of the Contact form. Web-standard `Request` and `Response` only. Never import it into browser code (see [Forms](forms/README.md)) |
| `bearminion/hosted` | A Worker or serverless function (experimental) | `createHostedEditor` (GitHub sign-in plus the editor API), `createHostedContext`, `handleHostedRequest` and `githubStore`: the editor API without Node (see [Hosted entry](#hosted-entry-experimental)) |

`astro` and `zod` (v4) are peer dependencies. A test keeps the runtime-neutral entries (including `bearminion/forms` and `bearminion/hosted`) free of Node, Astro and Vite imports.

## Astro integration

```ts
import bearminion from 'bearminion/astro'

export default defineConfig({
  integrations: [
    bearminion({
      contentDir: 'content',
      uploadsDir: 'src/assets/uploads',
      sections: sectionDefinitions,
      site: siteDefinition,
    }),
  ],
})
```

`contentDir` defaults to `content`. `uploadsDir` defaults to `src/assets/uploads`. `videosDir` defaults to `public/videos` and must stay inside `public/`, which serves videos as they are. `maxVideoBytes` caps one video upload (default 50 MB). `pages: { rename?: boolean, delete?: boolean }` locks page operations for a site whose addresses carry search ranking or are the target of redirects. Both default to `true`. `rename: false` refuses changing any page's slug, including making another page the home page (which moves the old home page to a new address); `delete: false` refuses deleting a page. The API refuses a locked operation with `409` `operation_locked`, whoever asks, and the editor hides the controls. A slug typed when a page is created cannot be corrected afterwards from the editor while renaming is locked. `maxImageBytes` caps one image upload (default 5 MB); the editor checks it in the browser before it uploads and the server checks it again. `imageConvert: { to: 'webp', maxWidth?, quality? }` makes the editor re-encode images as WebP in the browser before they are uploaded, scaled down to `maxWidth` (default: no cap, never scaled up) at `quality` 0.1 to 1 (default 0.82), so large phone photos stay out of the repository. It is off by default, an image that would come out larger is kept as it is, and GIFs are never converted. Both are resolved from the Astro project root unless they are already absolute. `sectionsDir` is the folder with your section directories and the files `npx bearminion sync` generates from them (the starter sets `'src/components/sections'`). When it is set, `astro build`, `astro check` and `astro sync` stop if those files no longer match the directories, and `astro dev` warns; without it nothing is checked. `forms` sets the dev route for the forms in your site: a file `src/forms/contact.ts` that default-exports `defineForm(...)` answers at `/api/contact` during `astro dev`, as a dry run unless `BEARMINION_FORMS_LIVE=on` is set in the environment or in `.env.local`. `forms: { dir, prefix }` changes the folder (default `src/forms`) and the path (default `/api`); `forms: false` turns the route off, for a site whose Astro adapter serves the endpoint itself. The route exists only in `astro dev`; see [Forms](forms/README.md). `sections` and `site` are required: the site's section definitions and its `defineSite` result. They validate page and site writes and feed the editor's catalog (labels, options, defaults, wireframes, header and footer controls and limits).

`collections: { id: collection({ schema, path }) }` lets the editor API edit the Markdown entries of an existing content collection (experimental; see [Markdown collections](collections.md)). Entries live outside `contentDir`, so a store key that starts with a slash means the project root instead of the content directory: `/src/content/blog/en/post.md`. `createFileStore` and `githubStore` both accept it.

The integration hooks `astro:config:setup` and `astro:server:setup`. Outside `astro dev` (`build`, `preview`, `sync`) it returns immediately: no routes, no injected scripts, no Vite plugin. Nothing from this API is added to the production build.

During `astro dev` the integration injects `virtual:bearminion-editor` into the page. That module mounts a Preact overlay in an open shadow root, so the editor styles never meet the site's Tailwind layer. The overlay is not registered for `astro build`.

## Content store

The editor API reads and writes content through a `ContentStore`, never through `fs`. The default store is the local project (`createFileStore`, using `contentDir` and `uploadsDir`), and `bearminion({ store })` replaces it:

```ts
interface ContentStore {
  read(key: string): Promise<string | undefined> // `site.json`, `pages/about.json`: paths inside the content directory; `/src/content/blog/a.md`: from the project root
  exists(key: string): Promise<boolean>
  list(dir: string): Promise<string[] | undefined> // file names in `pages`, or undefined when it does not exist
  apply(operations: StoreOperation[]): Promise<void> // writes and removals that belong together (a rename, set-home)
  uploads: { list(): Promise<…>; save({ originalName, bytes, kind }): Promise<…>; remove(filename): Promise<boolean> }
}
```

Values are text. Validation, parsing and the file layout (sorted keys, two spaces, trailing newline) stay in the editor, so every store writes the same bytes. `apply` runs writes before removals; a store that can make the whole batch atomic, such as a single commit, should.

### GitHub store (experimental)

`githubStore` keeps content in a GitHub repository. It uses web-standard `fetch` only, so it also runs in a Worker or a serverless function.

```ts
import { githubStore } from 'bearminion/astro'

bearminion({
  store: githubStore({
    repo: 'acme/site',
    token: process.env.GITHUB_TOKEN!, // fine-grained token, "Contents: Read and write", this one repository
    // branch: 'main',                // default: the repository's default branch
    // rootDir: 'apps/web',           // the site's folder inside the repository
    // contentDir: 'content',         // relative to rootDir
    // uploadsDir: 'src/assets/uploads',
  }),
})
```

- One save is one commit on the branch. A rename, set-home or delete lands together, never half-applied.
- Writes are fast-forward only. If someone pushed in between, the store retries once from the new head, then answers `409` `branch_moved`. Two people saving the same page still means last write wins, as with local files.
- A branch that requires pull requests or status checks answers `409` `branch_protected`. Set `mode: 'pr'` to send edits as pull requests instead.
- Reads use ETags, so unchanged files cost no rate limit.
- Commit messages are `Update content/pages/about.json`, `Update 3 files`, `Upload photo-1a2b3c4d.jpg`. Pass `message` to change them.
- Not supported yet: video uploads, `git: true` (Commit changes) and the dev preview of uploaded images.

Errors reach the editor as `{ error, message }`: `github_auth` (`502`), `github_forbidden` (`502`), `github_not_found` (`502`), `github_rate_limited` (`429`), `github_unreachable` (`502`), `branch_protected` and `branch_moved` (`409`).

To try a token against a throwaway repository: `GITHUB_TOKEN=... node scripts/try-github-store.mjs owner/repo [branch]`, or add `--pr` to try pull request mode. It writes and deletes files in that repository.

#### Pull request mode

```ts
githubStore({ repo: 'acme/site', token: process.env.GITHUB_TOKEN!, mode: 'pr' })
```

Needs "Pull requests: Read and write" besides "Contents: Read and write". Nothing is written to the base branch, and no code path merges: a person merges on GitHub.

- Each entry being edited (`page:about`, `site`) gets a branch of its own, `bearminion/page-about`, and a pull request opened on its first save, titled `Edit page: about` and labelled `bearminion`. Later saves of the same entry add commits to that pull request. Change the text with `pullRequest({ scope, written, removed })`, or drop the label with `label: false`.
- The editor reads each entry from its pending edits, so a reload shows what was saved, not what is merged.
- Once a pull request is merged or closed, the next save starts a new branch (`bearminion/page-about`, then `-2`, `-3` if the host keeps merged branches) and a new pull request. A closed, unmerged branch is not read from any more.
- Batch saves go to `bearminion/edits`, images to `bearminion/uploads`. A page that uses an uploaded image saves fine, but its pull request builds only once the uploads pull request is merged first. Merge them in that order until uploads travel with the page (planned).
- The page list shows the base branch, so a page that exists only in an open pull request is not listed until it is merged.
- The store does not rebase or merge a branch that fell behind the base. GitHub shows that on the pull request.
- Several API calls per read: finding an entry's branch costs a few GETs, answered from the ETag cache when nothing changed.

Not part of the store: undo history (local editor state in `.editor/history/`), Commit changes (needs a local git work tree, so the `git` option only works with the default store), the live-reload watcher, the dev route that serves images for preview, and the build-time loaders (`loadContent`, `loadPages`, `loadSite`), which read the local content directory.

```ts
import { loadContent } from 'bearminion/astro'
import { sectionDefinitions } from './src/components/sections/definitions'
import { siteDefinition } from './src/components/organisms/site-definition'

const model = { sections: sectionDefinitions, site: siteDefinition }
const content = loadContent('/absolute/path/to/content', model) // { site, pages }
sectionDefinitions.hero.schema.parse(sectionDefinitions.hero.defaults)
```

## Hosted entry (experimental)

`bearminion/hosted` is the editor API for a Worker or a serverless function, where there is no developer machine. It uses web-standard APIs only (a test fails if the entry ever reaches a Node module or global), and it is the piece a hosted editor is built on. It is not a hosted editor by itself: signing people in and serving the editor page are yours to add.

```ts
import { createHostedContext, githubStore, handleHostedRequest } from 'bearminion/hosted'

const context = createHostedContext({
  ...contentModel, // sections and site, as for bearminion()
  store: githubStore({ repo: 'acme/site', token: env.GITHUB_TOKEN }),
})

export default {
  async fetch(request: Request) {
    // Sign the person in first. handleHostedRequest trusts that you did.
    const response = await handleHostedRequest(request, context)
    return response ?? new Response('Not found', { status: 404 })
  },
}
```

- `handleHostedRequest` replaces the localhost check of the dev editor with a same-origin check (`Sec-Fetch-Site` and `Origin`), because the caller has authenticated the request. Never call it on a route with no sign-in in front of it: anyone who can reach it can write the content.
- There is no undo history and no Commit changes in this entry. The repository is the history.
- Tried in the Cloudflare Workers runtime (workerd): reads, a page create and a commit through `githubStore` work, and a cross-site request is refused.

### Sign-in: `createHostedEditor`

`createHostedEditor` puts GitHub sign-in in front of the editor API. A person signs in with their own GitHub account, and every request then runs on **their** token: commits are authored by them, and the repository's own rules (branch protection, required reviews) apply to them as they would anywhere else. Access is decided by GitHub: only people with push access to `repo` may sign in.

```ts
import { createHostedEditor } from 'bearminion/hosted'

const editor = createHostedEditor({
  ...contentModel, // sections and site, as for bearminion()
  repo: 'acme/site',
  auth: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    secret: env.SESSION_SECRET, // 32+ characters: openssl rand -base64 32
    origin: 'https://admin.example.com',
  },
  store: { mode: 'pr' }, // or the default 'direct'; also branch, rootDir, contentDir
  // collections, pages, maxImageBytes, imageConvert: as for bearminion()
})

export default {
  async fetch(request: Request) {
    return (await editor.handle(request)) ?? new Response('Not found', { status: 404 })
  },
}
```

`editor.handle` answers `/__bearminion/auth/*` (`login`, `callback`, `session`, and `logout` by POST) and `/__bearminion/api/*`, which answers `401` with a `login` link until someone is signed in. Any other path returns `null`.

Set up a **GitHub App** (not an OAuth App, whose tokens do not expire and cannot be limited to one repository): Repository permissions Contents and Pull requests read and write, Metadata read; callback URL `<origin>/__bearminion/auth/callback`; "Expire user authorization tokens" on; install it on the repository. The client id and secret and your own session secret belong in the environment.

- The sign-in uses PKCE and a one-time `state`. A return address must be a path on your own site.
- The session is one cookie, encrypted and authenticated with AES-GCM (`HttpOnly`, `SameSite=Lax`, `Secure` on https, and the `__Host-` prefix). It holds the person's GitHub token, which never reaches the browser's JavaScript. Changing `secret` signs everyone out.
- A session ends after `sessionDays` (default 7). GitHub's user tokens last 8 hours; they are renewed with the refresh token, and push access is checked again each time, so a person removed from the repository loses access within hours.
- **Who may sign in.** Everyone with push access to `repo`: the owner, collaborators with Write, Maintain or Admin, and organization members or teams with those roles. Read and Triage do not count. The GitHub App must also be installed on the repository. To allow only some of them, list their GitHub logins: `auth: { allowedLogins: ['ann', 'bob'] }` (case does not matter). The list narrows push access and never widens it. It is checked at sign-in and on every request, so a login taken off the list (after a redeploy) is signed out at its next request. An empty list is refused. Set the GitHub App to "Only on this account" so other accounts cannot even start the authorization.
- Behind a proxy that rewrites the scheme or host, set `origin`: it is what the callback address, the cookie flags and the same-origin check use.
- **The overlay.** `overlay: overlaySource` (from `bearminion/hosted-overlay`, the editor as one self-contained browser script, about 180 KB gzipped) makes `editor.handle` serve it at `/__bearminion/editor.js` to signed-in people, and `editor.inject(request, response)` adds it to a page your site rendered, for signed-in people only. A page that got the overlay is `Cache-Control: private, no-store` with `Vary: Cookie`, so no cache can hand it to a visitor. Do not cache the editor deployment's HTML at an edge cache in front of the Worker, or a signed-in person may be served a cached page without the overlay.
- **Images.** `GET /__bearminion/assets?src=src/assets/...` (signed-in people only) serves an image straight from the repository, so the editor's previews and a page that uses a file the build does not hold yet (just uploaded) draw it at once, without waiting for the editor deployment to build again. Only image files under `src/assets/` are served, with a private five-minute cache and `ETag` revalidation (a `304` from GitHub does not count against the rate limit). In pull request mode it also looks at the uploads branch.
- **A page that cannot be drawn** (content that fails validation, a template error) answers `500` with a page that says why and carries the overlay, for signed-in people. It is never cached. Visitors never reach it.
- **Renewing the token.** GitHub accepts a refresh token once, and a page load asks for the page, the overlay and the API together, so requests that find the token about to expire share one renewal. A request that loses the race to renew carries on with the old token while it still works; after it expires the person signs in again. Not yet tried against GitHub for how long the old token lives after a renewal.
- Not done yet: the preview endpoint. Only tested against a fake GitHub and one real deployment so far.
- Each request builds its own GitHub client, so the ETag cache does not carry over between requests. Reading a page costs a few GitHub API calls per request.
- `editor.scope(request)` gives the signed-in person's `{ login, store, content }` for a request (`content.getSite()` and `content.getPage(slug)` read from their store with the build's migrate-and-validate checks). Use it to draw your own pages from the repository's current content.

### The editor deployment on Astro

The public site stays a static build with no editor code in it. The editor is a **second deployment of the same repository**, at its own address such as `admin.example.com`: a server-rendered build that signs people in and draws each page from the repository's current content, with the overlay on top. Edit `admin.example.com/about` to edit the page that `example.com/about` serves; the public site's normal deploy publishes the commit.

```ts
// astro.config.ts: the editor build only
import vercel from '@astrojs/vercel' // or @astrojs/cloudflare, ...
import { bearminionHostedEditor } from 'bearminion/astro'

export default defineConfig({
  adapter: vercel(),
  integrations: [bearminion({ /* as before */ }), bearminionHostedEditor({ module: './src/editor.ts' })],
})
```

```ts
// src/editor.ts
import { createHostedEditor } from 'bearminion/hosted'
import { overlaySource } from 'bearminion/hosted-overlay'
import { contentModel } from './lib/content-model'

const secret = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

// A function, so a host that hands over its secrets per request (Cloudflare) works the same way.
export default () =>
  createHostedEditor({
    ...contentModel,
    repo: secret('BEARMINION_REPO'), // 'owner/name'
    auth: {
      clientId: secret('GITHUB_CLIENT_ID'),
      clientSecret: secret('GITHUB_CLIENT_SECRET'),
      secret: secret('SESSION_SECRET'), // 32+ characters: openssl rand -base64 32
    },
    overlay: overlaySource,
  })
```

On Cloudflare Workers the secrets are not in `process.env`: read them from `import { env } from 'cloudflare:workers'` instead of `process.env`.

- `bearminionHostedEditor` switches the build to server output, needs an adapter, and registers a middleware that runs first: it answers `/__bearminion/*`, sends visitors to sign in (`signIn: 'required'`, the default; a page load is redirected, anything else gets 401), and for signed-in people sets `Astro.locals.bearminion` and injects the overlay. `signIn: 'optional'` shows visitors the site as it is.
- The default template's `[...slug].astro` and `404.astro` draw from `Astro.locals.bearminion` when it is set, and from the build's content otherwise, so the same pages serve both builds.
- The integration also sets `import.meta.env.BEARMINION_HOSTED`, which the template's components read (through `src/lib/editing.ts`) to show the editor's empty-slot hints and to serve images from the route above. The public build never has it, so its output has neither.
- Never add this integration to the public site's build: a test fails if the static build ever contains editor code.
- Tried against a fake GitHub, in two runtimes: the built `@astrojs/vercel` function (its fetch handler, on Node 22) and the built `@astrojs/cloudflare` Worker in workerd (miniflare). Both: sign-in, a page drawn from a commit made after the build, the overlay, and the 302, 401 and 404 paths. Not yet tried on a real host, and the Vercel run bypasses Vercel's own request launcher.

### Keeping the site's files current

`npm update bearminion` moves the library. The site's own files (`src/lib`, the image components, the page routes) were copied from the starter when the site was created and stay the site's, so a release that fixes one of them does not reach the site by itself. The hosted editor needs these in step with the library:

| File | Why |
| --- | --- |
| `src/lib/editing.ts` (new in 1.16) | The flag the components read to show editor hints and to serve images the build does not hold |
| `src/lib/image-url.ts`, `src/components/atoms/Image.astro`, `src/components/molecules/MediaFrame.astro`, `src/components/sections/media/Media.astro`, `src/components/sections/media/MediaPlayer.astro` | Without `editing`, an image uploaded in the editor makes the page answer 500 until the next build |
| `src/components/seo/Seo.astro`, `src/components/sections/logo-strip/LogoStrip.astro` | The same, for the share image and the logo strip (1.16.2) |
| `src/env.d.ts` | The types of `import.meta.env.BEARMINION_HOSTED` and `Astro.locals.bearminion` |
| `src/pages/[...slug].astro`, `src/pages/404.astro` | Draw from `Astro.locals.bearminion` when it is set. Add the `Site` and `Page` type imports with them |

To bring them up to date:

1. Commit first, so git is the undo.
2. `npx bearminion@latest status` lists the section files that differ. Sections that are only older (not edited by you) update with `npx bearminion@latest add media logo-strip`. A site with no `bearminion.lock.json` cannot tell old from edited and reports `differs`; look at `add <name> --diff`, and when the release only adds to your file, `--overwrite` replaces it and writes the lock file.
3. Copy the files that belong to no section (`Seo.astro`, `env.d.ts`, the two page routes) from the starter, `templates/default/src` in the repository, or merge their changes by hand if you edited them.
4. `npx astro check`, then build.

The editor build warns when `src/lib/editing.ts` is missing from a starter site, or when a page route never reads `Astro.locals.bearminion`. It does not fail the build, because a site with its own theme may do both differently.

## Build and package

The package ships compiled. `pnpm --filter bearminion build` runs [tsdown](https://tsdown.dev): one ESM bundle per entry point plus shared chunks, bundled `.d.ts` files, and the editor overlay as `dist/ui/mount.js` with its Preact JSX compiled and its stylesheet (`src/ui/editor.css`) inlined. Preact, zod and astro stay external. `@preact/signals`, which holds the overlay's state, is bundled into `mount.js`, so Vite never meets a new dependency mid-session (its optimizer would reload the page). The overlay's own images, such as the bear in the sidebar header, live in `src/ui/assets/` and are bundled too: the editor never reads the site's files. `files` limits the tarball to `dist`, the README, the changelog and the license, and `prepack` builds first, so `npm pack` and `npm publish` are safe from a clean checkout. CI runs `publint` and `@arethetypeswrong/cli` on the packed tarball. The tests import `src/` directly.

When working on BearMinion itself, the monorepo's template resolves `bearminion` to `dist/`, so rebuild after changing the library: `pnpm install` does it once, and `pnpm dev` runs `tsdown --watch` next to the template's `astro dev`.
