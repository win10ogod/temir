/**
 * 覆蓋稽核與構造檢查：注入已知缺陷，確認稽核會失敗（含 CLI 的非零結束碼）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditCoverage } from '../coverage.ts'
import { loadContract } from '../lib/contract.ts'
import { loadDataset, type Dataset } from '../lib/dataset.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const memPath = join(root, 'datasets', 'memory-v1.json')
const pcPath = join(root, 'datasets', 'personality-v1.json')
const memContractPath = join(root, 'specs', 'memory-accuracy-v1.contract.json')
const pcContractPath = join(root, 'specs', 'personality-consistency-v1.contract.json')

function clone(ds: Dataset): { -readonly [K in keyof Dataset]: Dataset[K] } {
  return JSON.parse(JSON.stringify(ds)) as Dataset
}

test('正式資料集通過覆蓋稽核（必要類別來自契約）', () => {
  const mem = auditCoverage(loadDataset(memPath).dataset, loadContract(memContractPath))
  assert.deepEqual(mem.errors, [])
  const pc = auditCoverage(loadDataset(pcPath).dataset, loadContract(pcContractPath))
  assert.deepEqual(pc.errors, [])
})

test('刪掉一個必要類別 → 稽核失敗，CLI 結束碼 1', () => {
  const ds = clone(loadDataset(memPath).dataset)
  ds.probes = ds.probes.filter((p) => p.category !== 'abstention')
  const report = auditCoverage(ds, loadContract(memContractPath))
  assert.equal(report.ok, false)
  assert.ok(report.errors.some((e) => e.includes('「abstention」沒有任何題目')))
  const dir = mkdtempSync(join(tmpdir(), 'temir-coverage-'))
  const file = join(dir, 'broken.json')
  writeFileSync(file, JSON.stringify(ds))
  const cli = spawnSync(process.execPath, [join(root, 'eval', 'coverage.ts'), file, memContractPath], { encoding: 'utf8' })
  assert.equal(cli.status, 1, cli.stderr)
  assert.match(cli.stderr, /abstention/)
  const ok = spawnSync(process.execPath, [join(root, 'eval', 'coverage.ts'), memPath, memContractPath], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)
})

test('人格資料集刪掉 (c) self-recall → 失敗', () => {
  const ds = clone(loadDataset(pcPath).dataset)
  ds.probes = ds.probes.filter((p) => p.category !== 'self-recall')
  const report = auditCoverage(ds, loadContract(pcContractPath))
  assert.equal(report.ok, false)
  assert.ok(report.errors.some((e) => e.includes('self-recall')))
})

test('類別題數低於契約最低值 → 失敗；未定義的類別 → 失敗', () => {
  const ds = clone(loadDataset(memPath).dataset)
  ds.probes = ds.probes.filter((p) => p.id !== 'q01' && p.id !== 'q02')
  const r = auditCoverage(ds, loadContract(memContractPath))
  assert.ok(r.errors.some((e) => e.includes('information-extraction') && e.includes('至少 6 題')))
  const ds2 = clone(loadDataset(memPath).dataset)
  ds2.probes = ds2.probes.map((p) => (p.id === 'q01' ? { ...p, category: 'mystery' } : p))
  assert.ok(auditCoverage(ds2, loadContract(memContractPath)).errors.some((e) => e.includes('mystery')))
})

test('洩漏：把黃金答案寫進提問 → 失敗', () => {
  const ds = clone(loadDataset(memPath).dataset)
  ds.probes = ds.probes.map((p) => (p.id === 'q02' ? { ...p, turns: ['我家那隻叫麻糬的貓叫什麼名字？'] } : p))
  const r = auditCoverage(ds, loadContract(memContractPath))
  assert.ok(r.errors.some((e) => e.includes('q02') && e.includes('黃金答案')))
})

test('拒答題被問的東西其實出現在歷史中 → 失敗', () => {
  const ds = clone(loadDataset(memPath).dataset)
  ds.histories = ds.histories.map((h) => (h.id === 'h06' ? { ...h, turns: [...h.turns.slice(0, 1), '我妹妹也想一起跑步，她適合嗎？'] } : h))
  const r = auditCoverage(ds, loadContract(memContractPath))
  assert.ok(r.errors.some((e) => e.includes('q22') && e.includes('妹妹')))
})

test('知識更新題的新答案提早出現 → 失敗；證據原文不存在 → 失敗', () => {
  const ds = clone(loadDataset(memPath).dataset)
  ds.histories = ds.histories.map((h) => (h.id === 'h02' ? { ...h, turns: ['我在青川植物園當導覽員，也常去海岬水族館。', ...h.turns.slice(1)] } : h))
  const r = auditCoverage(ds, loadContract(memContractPath))
  assert.ok(r.errors.some((e) => e.includes('q12') && e.includes('更新之前')))
  const ds2 = clone(loadDataset(memPath).dataset)
  ds2.histories = ds2.histories.map((h) => (h.id === 'h04' ? { ...h, turns: ['我住在一間小套房。', h.turns[1]!] } : h))
  assert.ok(auditCoverage(ds2, loadContract(memContractPath)).errors.some((e) => e.includes('q05') && e.includes('晴光苑')))
})

test('人格探針的 comparesWith 指向不存在的回合 → 失敗', () => {
  const ds = clone(loadDataset(pcPath).dataset)
  ds.probes = ds.probes.map((p) => (p.id === 'q01' ? { ...p, comparesWith: [{ history: 'h01', turn: 9 }] } : p))
  assert.ok(auditCoverage(ds, loadContract(pcContractPath)).errors.some((e) => e.includes('q01') && e.includes('超出範圍')))
})

test('規格文件與契約一致：契約的每個必要類別與驗收線都寫在規格 Markdown 中', () => {
  for (const [spec, contractPath] of [
    ['memory-accuracy-v1.md', memContractPath],
    ['personality-consistency-v1.md', pcContractPath],
  ] as const) {
    const md = readFileSync(join(root, 'specs', spec), 'utf8')
    const contract = loadContract(contractPath)
    for (const cat of contract.categories) assert.ok(md.includes(`\`${cat.id}\``), `${spec} 沒有提到類別 ${cat.id}`)
    for (const a of contract.acceptance) assert.ok(md.includes(a.id), `${spec} 沒有提到驗收線 ${a.id}`)
  }
})
