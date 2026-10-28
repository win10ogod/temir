/**
 * 資料集產生器可重現；資料集內容的幾個人工核對（例如日期計算）與 judge 驗證用例的格式。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TARGETS, serialize } from '../../datasets/build.ts'
import { loadDataset } from '../lib/dataset.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('build.ts --check：現有 JSON 與重新產生的結果逐位元組相同', () => {
  const r = spawnSync(process.execPath, [join(root, 'datasets', 'build.ts'), '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  for (const t of TARGETS) assert.equal(readFileSync(t.file, 'utf8'), serialize(t.dataset))
})

test('產生兩次結果相同（不含隨機或時間）', () => {
  for (const t of TARGETS) assert.equal(serialize(t.dataset), serialize(t.dataset))
})

test('人工核對：時間推理題的黃金答案與日曆一致', () => {
  const day = (m: number, d: number) => Date.UTC(2026, m - 1, d) / 86_400_000
  assert.equal(day(11, 23) - day(11, 9), 14)
  assert.equal(day(12, 13) - day(11, 23), 20)
  assert.equal(new Date(Date.UTC(2026, 2, 30)).getUTCDay(), 1, '2026-03-30 是星期一')
  assert.equal(new Date(Date.UTC(2026, 3, 9)).getUTCDay(), 4, '10 天後 4 月 9 日是星期四')
  const mem = loadDataset(join(root, 'datasets', 'memory-v1.json')).dataset
  const q17 = mem.probes.find((p) => p.id === 'q17')!
  assert.ok(q17.gold.aliases.includes('14天'))
  const q18 = mem.probes.find((p) => p.id === 'q18')!
  assert.ok(q18.gold.aliases.includes('20天'))
})

test('人格資料集沒有固定的「正確人格」：除對照題外 gold.answer 一律為空', () => {
  const pc = loadDataset(join(root, 'datasets', 'personality-v1.json')).dataset
  for (const p of pc.probes) {
    if (p.category === 'control') assert.notEqual(p.gold.answer, '')
    else assert.equal(p.gold.answer, '', `${p.id} 不應該有預設答案`)
  }
})

test('judge 驗證用例：手寫、標籤合法、dev／test／test2 都有', () => {
  const cases = JSON.parse(readFileSync(join(root, 'eval', 'judge-validation', 'cases.json'), 'utf8')) as {
    cases: { id: string; prompt: string; split: string; expected: Record<string, string> }[]
  }
  const ids = new Set<string>()
  for (const c of cases.cases) {
    assert.ok(!ids.has(c.id), `重複 id ${c.id}`)
    ids.add(c.id)
    assert.ok(['dev', 'test', 'test2'].includes(c.split))
    assert.ok(Object.keys(c.expected).length > 0)
  }
  for (const split of ['dev', 'test', 'test2']) assert.ok(cases.cases.some((c) => c.split === split), split)
})
