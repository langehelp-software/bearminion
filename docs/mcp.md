---
title: AI assistants (MCP)
description: "Let an AI assistant read and edit a site's pages through the BearMinion MCP server: how to start it, what it can do, what it cannot, and how its writes are checked."
---

`npx bearminion mcp` starts a local [MCP](https://modelcontextprotocol.io) server for the site in the current folder. An assistant that speaks MCP can then read how each section is meant to be filled, read pages, and save changes. **It is experimental**: the tool names and results may change in a minor release.

## Set it up

A new site has no MCP server. Add it when you want it, from the site's folder:

```sh
npx bearminion add mcp
```

It installs `@modelcontextprotocol/sdk` as a dev dependency with the package manager the site already uses (found from its lock file), after asking. `--yes` skips the question and `--dry-run` prints the command and runs nothing. It then prints how to connect an assistant, with this site's folder filled in. Run it again at any time to see that again. Nothing else in the project changes, and a site that never runs it never installs the SDK.

For Claude Code, run this in the site's folder:

```sh
claude mcp add bearminion -- npx bearminion mcp
```

For Claude Desktop, Cursor and other clients, add the server to the client's MCP settings. Use the absolute path of the site, because a desktop app does not start in your project:

```json
{
  "mcpServers": {
    "bearminion": { "command": "npx", "args": ["bearminion", "mcp", "--cwd", "/path/to/your/site"] }
  }
}
```

Restart the assistant's app after changing its settings. It starts the server itself.

`--cwd <dir>` points it at another folder, `--model <file>` at another content model (default `src/lib/content-model.ts`) and `--content <dir>` at another content folder (default `content`). `--uploads-from <dir>` lets the assistant upload images and videos from a folder outside the project, such as your Downloads folder. Repeat it for more folders. The server talks over standard input and output. It listens on no port until you ask the assistant to add a picture with `request_upload` (see below).

## What the assistant can do

| Tool | What it does |
| --- | --- |
| `list_sections`, `get_section_guide` | The sections this site has, and how to fill one: variants, options, fields, limits, defaults and guidance. The same text is served as the resources `bearminion://sections` and `bearminion://sections/{type}`, and printed by `npx bearminion guide`. |
| `list_pages`, `get_page` | Slugs, titles and anchors; one whole page. |
| `save_page`, `save_pages` | Replace a page with the document sent. `save_pages` saves a list one after another and is **not atomic**: it reports each page as saved or rejected. |
| `create_page`, `delete_page`, `rename_page`, `set_home_page` | As in the editor. `rename_page` does **not** update links that point at the old slug. |
| `get_site`, `save_site` | The header, footer and site-wide settings. |
| `list_images` | The images already in the project. |
| `request_upload`, `check_upload` | For a picture you have not given a path to. `request_upload` returns a one-time link; you open it in a browser on this computer, choose an image with an ordinary file picker, and `check_upload` returns the path once it arrives. The image never passes through the assistant. |
| `upload_image`, `upload_video` | Copy a picture or a video into the project and return the path to use. They take the path of a file on this machine, which must be inside the project or a `--uploads-from` folder. |

## How writes are checked

The tools call the same routes as the editor, in the same process, so a write goes through the same migration and schema check. A rejected write returns each field and the reason, and changes nothing. The assistant reads that and fixes the document. Saved pages appear in the editor's undo history.

## What it cannot do

- It cannot run commands, commit or push. It writes the content files in your project, and git shows what changed: review it as you would a pull request.
- `request_upload` starts a small web server the first time it is used. It binds to `127.0.0.1` only, answers only to that host name, serves nothing but one page per link, and a link works for one successful upload and for 15 minutes. The upload goes through the editor's own image route: the contents must be an image of up to 5 MB, whatever the file is called. The server stops when the assistant disconnects. A phone can open the link only while it is on this computer, so uploading from a phone needs the hosted editor.
- It reads files for upload only from the project and from folders you name with `--uploads-from`. A link inside the project that points outside it is refused. The file's contents must be an image (png, jpeg, webp, gif, avif; up to 5 MB) or a video (mp4, webm, mov, ogv), whatever its name says. An upload is a copy in a folder your site serves, so name only folders whose images you are willing to publish.
- It does not stop an assistant that already has file access from editing the JSON files directly. What the server adds is validation at write time, and the guides.
- It runs on the machine where the site's files are. A server for editing a deployed site is not part of this.

Keep the site's own `AGENTS.md` as it is: it tells an assistant never to read `.env` files or write a secret into a tracked file, which applies whatever tool it uses.
