/**
 * v2 資料集：與 v1 不重疊、日期人工核對、結構與覆蓋（注入缺陷）、v2 judge 驗證用例格式。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditCoverage } from '../coverage.ts'
import { loadContract } from '../lib/contract.ts'
import { loadDataset, type Dataset } from '../lib/dataset.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ds = (name: string) => loadDataset(join(root, 'datasets', `${name}.json`)).dataset
const contract = (name: string) => loadContract(join(root, 'specs', `${name}.contract.json`))

/** v2 資料集的全部文字（歷史、探針、黃金答案、meta）。 */
function allText(d: Dataset): string {
  return JSON.stringify({ histories: d.histories, probes: d.probes })
}

const squash = (s: string) => s.normalize('NFKC').replace(/\s+/gu, '')

/** v1 的人物、專名與選項（人工列出）：v2 不得沿用。 */
const V1_ENTITIES = [
  '溫予寧', '麻糬', '蕭以禾', '晴光苑', '青川植物園', '海岬水族館', '松濤音樂廳', '雪國', '沙丘', '百年孤寂', '函館', '釧路', '丹頂鶴',
  '豆花', '阿傑', 'K7-QX-219', '雲在青天水在瓶', '花生', '電鍋', '大提琴', '智齒', '琥珀', '靛青', '苔綠', '鉛灰', '珊瑚', '象牙', '墨黑',
  '霧紫', '冰島的漁村', '京都的町屋', '撒哈拉邊緣的綠洲', '阿根廷的牧場', '挪威的燈塔', '紐約的頂樓公寓', '善意的謊言', '動物實驗',
  '雨停之後', '暱稱', '當場說', '順著對方', '下午三點四十分', '17 乘以 23',
]

test('v2 與 v1 不重疊：v1 的人物／專名／選項、證據原文、題目與歷史原句都沒有出現在 v2', () => {
  const v2 = [ds('memory-v2'), ds('personality-v2')]
  const v2text = squash(v2.map(allText).join('\n'))
  for (const e of V1_ENTITIES) assert.ok(!v2text.includes(squash(e)), `v2 沿用了 v1 的「${e}」`)
  for (const v1 of [ds('memory-v1'), ds('personality-v1')]) {
    for (const p of v1.probes) {
      for (const ev of p.meta?.evidence ?? []) assert.ok(!v2text.includes(squash(ev.text)), `v2 含有 v1 的證據原文「${ev.text}」`)
      for (const t of p.turns) assert.ok(!v2text.includes(squash(t)), `v2 含有 v1 的題目「${t}」`)
    }
    for (const h of v1.histories) for (const t of h.turns) assert.ok(!v2text.includes(squash(t)), `v2 含有 v1 的歷史原句「${t.slice(0, 20)}…」`)
  }
})

test('v2 日期人工核對（與黃金答案一致）', () => {
  const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000
  assert.equal(day(2026, 12, 18) - day(2026, 12, 3), 15)
  assert.equal(day(2027, 1, 9) - day(2026, 12, 18), 22)
  assert.equal(day(2027, 1, 23) - day(2027, 1, 9), 14)
  assert.equal(new Date(Date.UTC(2027, 0, 23 - 7)).getUTCDate(), 16)
  assert.equal(new Date(Date.UTC(2026, 11, 3)).getUTCDay(), 4, '2026-12-03 是星期四')
  assert.equal(new Date(Date.UTC(2026, 5, 15)).getUTCDay(), 1, '2026-06-15 是星期一')
  assert.equal(new Date(Date.UTC(2026, 5, 15 + 20)).getUTCDay(), 0, '20 天後是星期日')
  const mem = ds('memory-v2')
  const gold = (id: string) => mem.probes.find((p) => p.id === id)!.gold.aliases
  assert.ok(gold('q19').includes('15天') && gold('q20').includes('22天') && gold('q24').includes('14天'))
  assert.ok(gold('q21').includes('1月16日') && gold('q23').includes('星期四'))
})

test('v2 結構：隱性運用記憶每題都有背景、證據與 c1 起的連續準則；人格除對照題外沒有預設答案', () => {
  const mem = ds('memory-v2')
  const implicit = mem.probes.filter((p) => p.category === 'implicit-memory-use')
  assert.equal(implicit.length, 15)
  for (const p of implicit) {
    assert.ok(p.meta?.background && p.meta.background.length > 0, p.id)
    assert.ok((p.meta?.evidence ?? []).length > 0, p.id)
    assert.deepEqual(p.meta!.criteria!.map((c) => c.id), p.meta!.criteria!.map((_, i) => `c${i + 1}`), p.id)
  }
  const pc = ds('personality-v2')
  for (const p of pc.probes) {
    if (p.category === 'control') assert.notEqual(p.gold.answer, '')
    else assert.equal(p.gold.answer, '', `${p.id} 不應該有預設答案`)
  }
  assert.equal(pc.probes.filter((p) => p.category === 'arbitrary-choice').every((p) => p.meta?.repeats === 2), true)
})

test('注入缺陷：刪掉隱性運用記憶類別、拿掉一題的判定準則、回想題缺 requiresReason → 覆蓋稽核失敗', () => {
  const mem = JSON.parse(JSON.stringify(ds('memory-v2'))) as { -readonly [K in keyof Dataset]: Dataset[K] }
  mem.probes = mem.probes.filter((p) => p.category !== 'implicit-memory-use')
  assert.ok(auditCoverage(mem, contract('memory-accuracy-v2')).errors.some((e) => e.includes('implicit-memory-use')))
  const mem2 = JSON.parse(JSON.stringify(ds('memory-v2'))) as { probes: { id: string; meta?: Record<string, unknown> }[] }
  delete mem2.probes.find((p) => p.id === 'q41')!.meta!['criteria']
  assert.ok(auditCoverage(mem2 as unknown as Dataset, contract('memory-accuracy-v2')).errors.some((e) => e.includes('q41') && e.includes('criteria')))
  const pc = JSON.parse(JSON.stringify(ds('personality-v2'))) as { probes: { id: string; meta?: Record<string, unknown> }[] }
  delete pc.probes.find((p) => p.id === 'q19')!.meta!['requiresReason']
  assert.ok(auditCoverage(pc as unknown as Dataset, contract('personality-consistency-v2')).errors.some((e) => e.includes('q19') && e.includes('requiresReason')))
  assert.deepEqual(auditCoverage(ds('memory-v2'), contract('memory-accuracy-v2')).errors, [])
  assert.deepEqual(auditCoverage(ds('personality-v2'), contract('personality-consistency-v2')).errors, [])
})

test('v2 judge 驗證用例：手寫、id 不重複、v2-dev／v2-test 都有、提示詞合法', () => {
  const file = JSON.parse(readFileSync(join(root, 'eval', 'judge-validation', 'cases-v2.json'), 'utf8')) as {
    cases: { id: string; prompt: string; split: string; expected: Record<string, string> }[]
  }
  const ids = new Set<string>()
  const prompts = new Set(['mem-criteria-v2', 'pc-recall-v2', 'pc-narrate-v2', 'mem-default', 'mem-temporal', 'mem-knowledge-update', 'mem-abstention'])
  for (const c of file.cases) {
    assert.ok(!ids.has(c.id), c.id)
    ids.add(c.id)
    assert.ok(['v2-dev', 'v2-test'].includes(c.split), c.id)
    assert.ok(prompts.has(c.prompt), c.id)
    assert.ok(Object.keys(c.expected).length > 0, c.id)
  }
  for (const p of ['mem-criteria-v2', 'pc-recall-v2', 'pc-narrate-v2']) {
    assert.ok(file.cases.some((c) => c.prompt === p && c.split === 'v2-dev') && file.cases.some((c) => c.prompt === p && c.split === 'v2-test'), p)
  }
  assert.ok(file.cases.some((c) => c.prompt === 'pc-recall-v2' && c.expected['outcome'] === 'rederived'), '必須驗證能分辨重新推導')
})

test('v2 規格文件與契約一致：類別、驗收線、必要 cell 的模型、資料集 sha256 都寫在規格 Markdown 中', () => {
  for (const [spec, name, dataset] of [
    ['memory-accuracy-v2.md', 'memory-accuracy-v2', 'memory-v2'],
    ['personality-consistency-v2.md', 'personality-consistency-v2', 'personality-v2'],
  ] as const) {
    const md = readFileSync(join(root, 'specs', spec), 'utf8')
    const k = contract(name)
    for (const cat of k.categories) assert.ok(md.includes(`\`${cat.id}\``), `${spec} 沒有提到類別 ${cat.id}`)
    for (const a of k.acceptance) assert.ok(md.includes(a.id), `${spec} 沒有提到驗收線 ${a.id}`)
    for (const cell of k.requiredCells) assert.ok(md.includes(cell.historyModel), `${spec} 沒有提到必要 cell 的模型 ${cell.historyModel}`)
    const sha = createHash('sha256').update(readFileSync(join(root, 'datasets', `${dataset}.json`))).digest('hex')
    assert.ok(md.includes(sha), `${spec} 寫的資料集 sha256 與 ${dataset}.json 不同`)
  }
})

test('v2 模型安排：Nemotron（:free）的 baseline／temir 是必要 cell，EVE-27B 只在選用 cell', () => {
  const NEMO = 'nvidia/nemotron-3.5-super-vl:free'
  for (const name of ['memory-accuracy-v2', 'personality-consistency-v2']) {
    const k = contract(name)
    for (const condition of ['baseline', 'temir'] as const) {
      assert.ok(
        k.requiredCells.some((c) => c.condition === condition && c.historyModel === NEMO && c.probeModel === NEMO),
        `${name}：${condition} × Nemotron 必須是必要 cell`,
      )
    }
    assert.ok(k.requiredCells.every((c) => c.historyModel !== 'EVE-27B' && c.probeModel !== 'EVE-27B'), `${name}：EVE-27B 不得列為必要`)
    assert.ok(k.optionalCells.some((c) => c.historyModel === 'EVE-27B'), `${name}：EVE-27B 應保留為選用`)
    assert.equal(k.protocol?.layout, 'home')
  }
})
