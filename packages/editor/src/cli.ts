#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { run } from './command.js'

/** `npx bearminion`. The registry sits next to `dist/` in the installed package. */
const registryDir = fileURLToPath(new URL('../registry/default', import.meta.url))

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} (y/N) `)).trim())
  } finally {
    rl.close()
  }
}

process.exitCode = await run(process.argv.slice(2), { registryDir, ...(process.stdin.isTTY ? { confirm } : {}) })
