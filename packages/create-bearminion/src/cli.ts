#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { HELP, parseCliArgs, UsageError, type CliOptions } from './args.js'
import { normalizeUrl, toPackageName, toSiteName } from './names.js'
import { detectPackageManager, runCommand } from './package-manager.js'
import { blockingEntries, scaffold } from './scaffold.js'
import { initGit, insideGitRepository, install } from './steps.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DIRECTORY = 'my-site'

async function main(): Promise<number> {
  let options: CliOptions
  try {
    options = parseCliArgs(process.argv.slice(2))
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    console.error(`${error.message}\n\n${HELP}`)
    return 1
  }
  if (options.help) {
    console.log(HELP)
    return 0
  }
  if (options.version) {
    console.log((JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { version: string }).version)
    return 0
  }

  const interactive = !options.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY)
  p.intro("🐻 Oh, great. Another website. Let's make this quick.")

  const directory =
    options.directory ??
    (interactive
      ? await ask(
          p.text({
            message: 'Which folder? A new or empty one.',
            placeholder: `./${DEFAULT_DIRECTORY}`,
            defaultValue: DEFAULT_DIRECTORY,
          }),
        )
      : DEFAULT_DIRECTORY)
  if (directory === undefined) return cancelled()
  const targetDir = path.resolve(directory)
  const blocking = await blockingEntries(targetDir)
  if (blocking.length > 0) {
    p.cancel(`Grrr. ${directory} isn't empty (${preview(blocking)}). Pick another folder, or clean up your mess first.`)
    return 1
  }

  const siteName =
    options.name ??
    (interactive
      ? await ask(
          p.text({
            message: 'What are we calling this masterpiece?',
            placeholder: toSiteName(directory),
            defaultValue: toSiteName(directory),
          }),
        )
      : toSiteName(directory))
  if (siteName === undefined) return cancelled()

  let url: string | undefined
  if (options.url !== undefined) {
    const normalized = normalizeUrl(options.url)
    if (!normalized) {
      p.cancel(`"${options.url}" isn't a web address. Try something like https://example.com.`)
      return 1
    }
    url = normalized
  } else if (interactive) {
    const answer = await ask(
      p.text({
        message: "What's its web address?",
        placeholder: 'https://example.com  (Enter to skip. Set it later under Site → URL)',
        defaultValue: '',
        validate: (value) =>
          !value || normalizeUrl(value) ? undefined : "That's not a web address. Try https://example.com, or leave it empty.",
      }),
    )
    if (answer === undefined) return cancelled()
    url = answer ? (normalizeUrl(answer) ?? undefined) : undefined
  }

  const pm = options.packageManager ?? detectPackageManager(process.env.npm_config_user_agent)
  const spin = p.spinner()
  spin.start('Unpacking the template')
  await scaffold({
    templateDir: path.join(packageRoot, 'template'),
    targetDir,
    packageName: toPackageName(directory),
    siteName: siteName.trim() || toSiteName(directory),
    ...(url ? { url } : {}),
    storybook: options.storybook,
  })
  spin.stop(
    `Done. ${siteName} lives in ${path.relative(process.cwd(), targetDir) || '.'}${options.storybook ? ', Storybook included' : ''}`,
  )

  let installed = false
  if (options.install) {
    spin.start(`Fetching the bare minimum with ${pm}`)
    const result = await install(pm, targetDir)
    installed = result.ok
    if (result.ok) spin.stop('Dependencies installed. Could have been worse.')
    else {
      spin.error(`${pm} install failed`)
      p.log.message(result.output)
      p.log.warn(`Sort out whatever that is, then run ${pm} install in the folder.`)
    }
  }

  if (options.git) {
    if (insideGitRepository(path.dirname(targetDir))) {
      p.log.info("Already inside a git repository, so I didn't start another one.")
    } else {
      const git = initGit(targetDir)
      if (!git.initialized) p.log.warn(`Couldn't create a git repository: ${git.reason ?? 'git is not available'}`)
      else if (!git.committed)
        p.log.warn('Repository created, first commit failed. Set your name and email with git config, then commit. Not my department.')
    }
  }

  const steps = [`cd ${path.relative(process.cwd(), targetDir) || '.'}`, ...(installed ? [] : [`${pm} install`]), runCommand(pm, 'dev')]
  p.note(`${steps.join('\n')}\n\nOpen the address it prints, press Ctrl+E (Cmd+E on a Mac) and click on things.`, 'Next steps')
  p.outro(
    url
      ? `Ready to publish at ${url}. I'm going back to sleep.`
      : "Set your web address under Site → URL before you publish. I'll be asleep.",
  )
  return 0
}

/** Awaits a prompt; `undefined` when the person pressed Ctrl+C or Esc. */
async function ask(prompt: Promise<string | symbol>): Promise<string | undefined> {
  const value = await prompt
  return typeof value === 'string' ? value : undefined
}

function cancelled(): number {
  p.cancel('Nothing was created. Back to sleep.')
  return 1
}

function preview(entries: string[]): string {
  return entries.length > 3 ? `${entries.slice(0, 3).join(', ')} and ${entries.length - 3} more` : entries.join(', ')
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    p.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
    process.exitCode = 1
  },
)
