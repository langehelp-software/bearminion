---
title: Edit online
description: "Give people a web address where they sign in with GitHub and edit the site in the browser. Who may edit is decided by access to the repository; every save is a commit under their own name."
---

By default the editor runs only on your computer, while `npm run dev` runs. The hosted editor is the same editor at a web address of its own, such as `admin.example.com`. A person opens it, signs in with GitHub, edits the page they see, and saves. The save is a commit in your repository, and your host publishes it like any other push.

Nobody clones anything, installs Node or opens a terminal. That makes it the way to let a client, a marketer or a colleague edit the site.

<!-- TODO: screenshots. docs/images/hosted-sign-in.webp (GitHub's Authorize screen for the App, from the admin address in a private window) under "Set it up" step 5, and docs/images/hosted-editor.webp (the editor open on the admin address, address bar in frame) here. -->

It is opt-in. A new site has no hosted editor and nothing of it in the public build. You add it with one command when you want it.

## How it fits together

| | Public site | Editor |
| --- | --- | --- |
| Address | `example.com` | `admin.example.com`, or any address that is not the public one |
| Build | Static, from `astro.config.ts`. No editor code, no server | Server-rendered, from `astro.editor.config.ts` |
| Who reaches it | Everyone | People signed in with GitHub who may push to the repository |
| Content | As of the last build | Read from the repository on every request |

Both are deployments of the same repository. Editing `admin.example.com/about` edits the page that `example.com/about` serves. The public site never loads the editor, a session cookie or any extra script; a test in BearMinion's own suite fails if editor code reaches a static build.

## Who can edit

**Access to the editor is access to the repository.** There are no BearMinion accounts, passwords or roles to manage.

| The person on GitHub | In the editor |
| --- | --- |
| Owner of the repository, or a collaborator with **Write**, **Maintain** or **Admin** | Can sign in and edit |
| Member of an organization team with one of those roles on the repository | Can sign in and edit |
| **Read** or **Triage** only, or no access | Sees "no access" after signing in. Nothing is written |
| Removed from the repository later | Their saves fail at once. Their session ends when GitHub's token is next renewed, within 8 hours |

- **To let someone in:** add them as a collaborator with the Write role (Settings → Collaborators on GitHub), and send them the editor's address.
- **To take access away:** remove them from the repository.
- **To allow only some of the people who can push**, list their GitHub logins as `allowedLogins` in `src/editor.ts` (see [Settings](#settings)). The list narrows repository access and never widens it.

Every request runs on the signed-in person's own GitHub token, so GitHub applies its rules to them, not to a shared robot account:

- A commit is authored by the person who saved.
- Branch protection and required reviews apply as they do for a push. A protected main branch refuses a direct save, and the editor says so; use [pull request mode](#what-a-save-does).

## Set it up

You need a site on GitHub and a Vercel account. Vercel is the host the hosted editor is tested on and the one the command sets up.

### 1. Prepare the repository

```sh
npx bearminion@latest add hosted --install
```

It writes `src/editor.ts` (the editor's settings, read from the environment), `astro.editor.config.ts` (the editor's build) and a `build:editor` script, installs the Vercel adapter, and brings the starter files the editor depends on up to date. Your `astro.config.ts` is not touched. Commit and push. [The command line](cli.md#set-up-the-hosted-editor) describes every file and flag.

### 2. Create the editor's Vercel project

In Vercel, add a **second** project from the same repository. The first one stays the public site.

- **Build Command:** `npm run build:editor`
- **Deployment Protection:** off for this project. The editor has its own sign-in; with protection on, Vercel asks editors for a Vercel login first.
- Note the project's address (`your-site-admin.vercel.app`, or a domain such as `admin.example.com` that you add). It must not be the public site's address.

### 3. Create a GitHub App

On GitHub: Settings → Developer settings → GitHub Apps → New GitHub App. Use a GitHub App, not an OAuth App: its tokens expire and it can be limited to one repository.

- **Redirect URI:** `https://<the editor's address>/__bearminion/auth/callback`
- **Expire user authorization tokens:** on
- **Repository permissions:** Contents and Pull requests, read and write. Metadata, read
- **Webhook:** off
- **Install** the App on this repository only
- **Visibility:** a private App can be authorized only by its owner, and everyone else gets a 404 from GitHub. If anyone but you edits, make the App public and name the people in `allowedLogins`

Generate a client secret and keep it with the client ID.

### 4. Set four environment variables

In the editor's Vercel project, then redeploy:

| Variable | Value |
| --- | --- |
| `BEARMINION_REPO` | `owner/name` of the repository |
| `GITHUB_CLIENT_ID` | The App's client ID |
| `GITHUB_CLIENT_SECRET` | The App's client secret |
| `SESSION_SECRET` | 32 or more random characters: `openssl rand -base64 32` |

None of them belongs in the repository or in the public site's project.

### 5. Sign in

Open the editor's address. GitHub asks you to authorize the App once, and you land on your site with the editor on top. Change a heading, save, and look at the repository: the commit carries your name, and the public site rebuilds.

## What a save does

By default a save is **one commit on the repository's main branch**, and the public site's normal deploy publishes it. Two people saving the same page at the same time is last write wins, as with any two pushes; the editor never loses a commit, and it reports a branch that moved under it.

For review before publishing, turn on **pull request mode** in `src/editor.ts`:

```ts
export default () =>
  createHostedEditor({
    ...contentModel,
    repo: secret('BEARMINION_REPO'),
    auth: { /* as written by the command */ },
    overlay: overlaySource,
    store: { mode: 'pr' },
  })
```

Each page then gets its own branch and pull request (`bearminion/page-about`), later saves to the same page join it, and nothing reaches main until someone merges on GitHub. The editor never merges. [Pull request mode](integration.md#pull-request-mode) lists what it changes, including one limit: a page that uses a newly uploaded image builds only after the uploads pull request is merged.

## What differs from the editor on your computer

Editing is the same: text on the page, sections, the sidebar tabs, images, drafts, and the live preview that redraws a section as you add it or switch its layout. These differ:

| | On your computer | Online |
| --- | --- | --- |
| A save | Writes files in your project | Commits to the repository |
| Version history and Restore | Kept by the editor | Not shown. The repository's commit history is the history |
| Commit changes (`git: true`) | Optional | Not needed: every save is a commit |
| Video uploads | Yes | Not yet. Link a video, or upload it locally |
| A just-uploaded image | Read from disk | Served from the repository to signed-in people until the next build holds it |

## Settings

Everything is in `src/editor.ts`, which is yours after the command writes it.

```ts
auth: {
  clientId: secret('GITHUB_CLIENT_ID'),
  clientSecret: secret('GITHUB_CLIENT_SECRET'),
  secret: secret('SESSION_SECRET'),
  allowedLogins: ['ann', 'bob'], // only these GitHub logins, of the people who can push
  sessionDays: 7,                // how long a sign-in lasts
},
```

- `allowedLogins` is checked at sign-in and on every request. Taking a login off the list (and redeploying) signs that person out at their next request. An empty list is refused.
- `store: { mode: 'pr' }` is described above. `store.branch` edits a branch other than the default one.
- `pages`, `collections`, `maxImageBytes` and `imageConvert` work as they do for [`bearminion()`](integration.md#astro-integration).

The [integration guide](integration.md#sign-in-createhostededitor) is the reference for every option, the session cookie, token renewal and running the editor outside Astro.

## Keeping it working

- **Changed the site's code?** The editor deployment draws pages with the components in its own build, so it has to rebuild when components or styles change. Vercel does that on every push, like the public project. Content edits need no rebuild of the editor: it reads content from the repository on each request.
- **Updated `bearminion`?** Run `npx bearminion@latest add hosted` again. `npm update` moves the library but not the starter files copied into your site; the command updates the ones the editor needs and leaves files you changed alone. See [Keeping the site's files current](integration.md#keeping-the-sites-files-current).
- **A page answers "This page could not be drawn"?** The content in the repository does not render, usually after a hand edit. The page says why and still carries the editor, so you can fix it there.

## Limits to know before you rely on it

- **Vercel is the tested host.** The same build runs in the Cloudflare Workers runtime in BearMinion's tests, but it has not been run on a Cloudflare account, and the command does not set Cloudflare up. The [integration guide](integration.md#the-editor-deployment-on-astro) has the pieces.
- **Screens can outlive access by a few hours.** A person removed from the repository cannot save from that moment, but pages they already have a session for keep loading until GitHub's token is renewed (at most 8 hours) or the session ends. To cut it short, change `SESSION_SECRET` and redeploy: that signs everyone out.
- **Each page view reads from GitHub.** That is a few API calls and a few hundred milliseconds. Fine for an editor, and the reason the public site stays a static build.
- **A page that exists only in an open pull request** is not in the page list (pull request mode).

Security model, in short: the editor lives on its own origin so that nothing on the public site can reach its session; the session is one encrypted, `HttpOnly` cookie; the GitHub token never reaches browser JavaScript; requests from other sites are refused. [SECURITY.md](../SECURITY.md) has the full statement.
