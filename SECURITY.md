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

Out of scope: `astro dev --host` on an untrusted network (the editor refuses non-local hosts, but the rest of the dev server does not), and the security of the static site you build, which is plain Astro output.
