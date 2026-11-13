# Security policy

BearMinion's editor runs only during `astro dev`. While it runs, it reads and writes files in your project and, with `git: true`, creates local commits. A flaw in it can therefore reach your files. Please report vulnerabilities privately.

## Reporting

Use GitHub's private vulnerability reporting: the **Security** tab of this repository, then **Report a vulnerability**. Include the version, steps to reproduce, and the impact you expect. Please do not open a public issue for a security report.

You can expect an acknowledgement within a few days. Fixes ship as a patch release with a GitHub security advisory, and reporters are credited unless they prefer otherwise.

## Supported versions

Security fixes go to the latest `1.x` release.

## What the dev server protects

- The editor API (`/__bearminion/api`) and the dev image route answer only loopback TCP connections whose `Host` is local. A present `Origin` must be local too, and a browser's `Sec-Fetch-Site` must be `same-origin` or `none`. This blocks other machines, DNS rebinding, and cross-site requests from pages open in your browser.
- Every write is validated against the site's Zod schemas before anything touches disk. Paths are confined to the content and uploads directories.
- Uploads are limited to 5 MB. Their type is checked by file signature, not by name. They are stored under a random name, and SVG is not accepted.
- Git runs without a shell, commits only changed files under the content and uploads folders, and never pushes.
- Pasted rich text is parsed, never inserted. Only the markdown renderer's own tags reach the page.

## What the hosted editor protects

The hosted editor (`bearminion/hosted`, see [the integration guide](docs/integration.md#hosted-entry-experimental)) is a separate, internet-facing deployment, so its model is different from the dev server's.

- **Who may edit.** A person signs in with their own GitHub account through a GitHub App. Sign-in succeeds only when that account has push access to the configured repository and, if `allowedLogins` is set, is on the list. Everyone else gets a 403 page and no cookie.
- **No shared credential.** Every request runs on the signed-in person's own GitHub token. GitHub authors the commits as them and applies branch protection and required reviews to them. The deployment holds no write token of its own.
- **Session.** One AES-GCM sealed cookie (`HttpOnly`, `SameSite=Lax`, `Secure` and the `__Host-` prefix on https), at most 7 days, holding the person's token. Changing the session secret signs everyone out.
- **Sign-in flow.** OAuth with PKCE and a one-time `state`; a return address must be a path on the site.
- **Requests.** Every `/__bearminion/*` route except sign-in needs a session. Writes also need a same-origin request (`Sec-Fetch-Site`, `Origin`). A page with the editor overlay is never cacheable.
- **Writes** are validated against the same schemas as the dev editor before anything is committed.

Things to know: access follows GitHub, so removing a person's push access ends their writes at once but their cookie can keep loading the editor screens until the session ends (set `allowedLogins` and redeploy, or change the session secret, to cut it sooner). Anyone with push access can use the editor unless `allowedLogins` narrows it. A private GitHub App lets only its owner sign in; for a team, make it public and set `allowedLogins`. There is no rate limiting of sign-in beyond GitHub's own. This part of the package is experimental and has been exercised against a fake GitHub and one real Vercel deployment.

Out of scope: `astro dev --host` on an untrusted network (the editor refuses non-local hosts, but the rest of the dev server does not), and the security of the static site you build, which is plain Astro output.
