// Decide whether a push to main must redeploy the `pluggy-sync` Edge Function.
//
//   pnpm exec tsx scripts/edge-function-changed.ts <base-sha> <head-sha>
//
// The function's real inputs are its module graph (it imports shared modules
// from src/features/bank-feed), so the list comes from Deno itself
// (`deno info --json`, the same graph the deploy bundles) instead of a
// hand-kept path filter that drifts when an import changes. Plus the files
// that shape the bundle without being imported: the function's deno.json /
// deno.lock and supabase/config.toml. Prints the decision and, on GitHub
// Actions, writes `deploy=true|false` to $GITHUB_OUTPUT. When the base is
// unknown (first push, workflow_dispatch), it deploys: never skip blindly.

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const FUNCTION_DIR = 'supabase/functions/pluggy-sync'
const ENTRY = 'index.ts'
const DENO = 'deno@2.1.4'
const ALWAYS = [`${FUNCTION_DIR}/`, 'supabase/config.toml']

const root = process.cwd()

const denoInfoSchema = z.object({ modules: z.array(z.object({ specifier: z.string() })) })

function functionModules(): string[] {
  const json = execFileSync('pnpm', ['dlx', DENO, 'info', '--json', ENTRY], {
    cwd: path.join(root, FUNCTION_DIR),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const { modules } = denoInfoSchema.parse(JSON.parse(json))
  const files = modules
    .map((mod) => mod.specifier)
    .filter((specifier) => specifier.startsWith('file://'))
    .map((specifier) => path.relative(root, new URL(specifier).pathname))
  if (files.length === 0) throw new Error('deno info returned no local modules for the function')
  return files
}

function changedFiles(base: string, head: string): string[] {
  return execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function needsDeploy(changed: readonly string[], modules: readonly string[]): string[] {
  const inputs = new Set(modules)
  return changed.filter(
    (file) =>
      inputs.has(file) || ALWAYS.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p)),
  )
}

function output(deploy: boolean, reason: string) {
  console.log(`${deploy ? 'deploy' : 'skip'}: ${reason}`)
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `deploy=${deploy}\n`)
}

const [base = '', head = 'HEAD'] = process.argv.slice(2)
if (base === '' || /^0+$/.test(base)) {
  output(true, 'no base commit to compare with')
} else {
  const hits = needsDeploy(changedFiles(base, head), functionModules())
  if (hits.length > 0) output(true, `function inputs changed: ${hits.join(', ')}`)
  else output(false, 'no file of pluggy-sync (module graph, deno.json/lock, config.toml) changed')
}
