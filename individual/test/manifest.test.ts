import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : []
  })
}

test('every DSH package imported at runtime is a declared peer: integration packs resolve only declared peers (TW pack, 2026-11-01: temir-plugin failed to import dsh-cordis-host-runner)', () => {
  const peers = Object.keys((JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { peerDependencies: Record<string, string> }).peerDependencies)
  const runtime = new Set<string>()
  for (const file of sources(join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8')
    // 型別匯入會被剝除，執行期不需要；其餘（含多行的 import 與動態 import）都要宣告。
    for (const m of text.matchAll(/^import\s+(?!type\s)[^;]*?from\s+'(@deepseek-ai\/[a-z0-9-]+)/gmsu)) runtime.add(m[1]!)
    for (const m of text.matchAll(/import\('(@deepseek-ai\/[a-z0-9-]+)/gu)) runtime.add(m[1]!)
  }
  assert.ok(runtime.size > 0)
  assert.deepEqual([...runtime].filter((p) => !peers.includes(p)).sort(), [])
})
