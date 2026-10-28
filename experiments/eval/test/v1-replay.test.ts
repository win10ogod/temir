/**
 * v1 結果不可變：以目前的評估器 `--judge replay` 重放 v1 的 judge 紀錄，輸出的 summary.md、summary.json、
 * items.jsonl 必須與 experiments/results/ 中的 v1 檔案逐位元組相同（不呼叫 API）。
 * 使用 repo 中的 v1 執行紀錄（experiments/runs/v1__*）；輸出寫到暫存目錄，不碰 v1 的結果。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const repo = join(root, '..')

const CASES = [
  { dataset: 'memory-v1', contract: 'memory-accuracy-v1' },
  { dataset: 'personality-v1', contract: 'personality-consistency-v1' },
] as const

for (const c of CASES) {
  test(`v1 重放逐位元組重現：${c.dataset}`, { skip: !existsSync(join(root, 'results', c.dataset)) && '沒有 v1 結果' }, () => {
    const runs = readdirSync(join(root, 'runs'))
      .filter((d) => d.startsWith(`v1__${c.dataset}__`))
      .sort()
      .flatMap((d) => ['--runs', join(root, 'runs', d)])
    assert.ok(runs.length > 0, '找不到 v1 的執行紀錄')
    const out = mkdtempSync(join(tmpdir(), `temir-replay-${c.dataset}-`))
    const r = spawnSync(
      process.execPath,
      [
        join(root, 'eval', 'score.ts'),
        '--dataset', join(root, 'datasets', `${c.dataset}.json`),
        '--contract', join(root, 'specs', `${c.contract}.contract.json`),
        ...runs,
        '--out', out,
        '--judge', 'replay',
        '--judge-cache', join(root, 'results', c.dataset, 'judge-raw.jsonl'),
        '--cross-check',
      ],
      { encoding: 'utf8', cwd: repo, env: { ...process.env, DEEPSEEK_API_KEY: '' } },
    )
    assert.equal(r.status, 0, r.stderr)
    for (const f of ['summary.md', 'summary.json', 'items.jsonl']) {
      const want = readFileSync(join(root, 'results', c.dataset, f))
      const got = readFileSync(join(out, f))
      assert.ok(got.equals(want), `${c.dataset}/${f} 與 v1 結果不同`)
    }
  })
}
