/**
 * 彙總：各 cell × 類別的正確數／總數與信賴區間、成對比較、預先登記驗收線的判定。
 */
import type { AcceptanceSpec, CellSpec, Contract, ContrastSpec } from './contract.ts'
import { cellKey, cellLabel } from './contract.ts'
import type { ScoredItem, ScoringResult } from './scoring.ts'
import {
  clopperPearson,
  clusterBootstrapMean,
  mcnemarExact,
  pairedBootstrap,
  signTest,
  type BootstrapResult,
  type Interval,
  type McNemarResult,
  type SignTestResult,
} from './stats.ts'

export interface CategorySummary {
  readonly category: string
  readonly items: number
  readonly samples: number
  /** 得分樣本數（score=1）。 */
  readonly correct: number
  /** 無法評的樣本數（needs-judge）。 */
  readonly pending: number
  readonly rate: number | null
  readonly interval: Interval | null
  readonly intervalMethod: 'clopper-pearson' | 'cluster-bootstrap' | 'none'
  readonly outcomes: Readonly<Record<string, number>>
  readonly statuses: Readonly<Record<string, number>>
}

export interface CellSummary {
  readonly cell: CellSpec
  readonly key: string
  readonly label: string
  /** 這個 cell 是否完全沒有紀錄（所有樣本都是 missing-record）。 */
  readonly notRun: boolean
  readonly categories: readonly CategorySummary[]
  readonly toolCalls: Readonly<Record<string, number>>
}

export interface ContrastSummary {
  readonly id: string
  readonly description: string
  readonly a: string
  readonly b: string
  readonly categories: readonly string[]
  readonly state: 'ok' | 'not-run' | 'incomplete'
  readonly n: number
  readonly rateA: number | null
  readonly rateB: number | null
  readonly diff: BootstrapResult | null
  readonly test: { readonly kind: 'mcnemar'; readonly result: McNemarResult } | { readonly kind: 'sign'; readonly result: SignTestResult } | null
  readonly failuresA: number
  readonly failuresB: number
  readonly outcomeCountsA: Readonly<Record<string, number>>
  readonly samplesA: number
}

export interface AcceptanceResult {
  readonly id: string
  readonly contrast: string
  readonly verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'
  readonly claim: string
  readonly negation: string
  readonly explanation: string
}

export interface Summary {
  readonly contract: string
  readonly dataset: string
  readonly datasetSha256: string
  readonly cells: readonly CellSummary[]
  readonly contrasts: readonly ContrastSummary[]
  readonly acceptance: readonly AcceptanceResult[]
  readonly crossCheck: { readonly total: number; readonly agree: number; readonly disagree: readonly string[] } | null
}

function count<T extends string>(xs: readonly T[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of xs) out[x] = (out[x] ?? 0) + 1
  return out
}

function isNotRun(items: readonly ScoredItem[]): boolean {
  return items.length > 0 && items.every((it) => it.samples.every((s) => s.status === 'missing-record'))
}

export function summarizeCategory(category: string, items: readonly ScoredItem[], contract: Contract): CategorySummary {
  const samples = items.flatMap((it) => it.samples)
  const pending = samples.filter((s) => s.score === null).length
  const correct = samples.filter((s) => s.score === 1).length
  const rate = pending > 0 || samples.length === 0 ? null : correct / samples.length
  const binary = items.every((it) => it.samples.length === 1)
  let interval: Interval | null = null
  let intervalMethod: CategorySummary['intervalMethod'] = 'none'
  if (rate !== null) {
    if (binary) {
      interval = clopperPearson(correct, samples.length)
      intervalMethod = 'clopper-pearson'
    } else {
      const b = clusterBootstrapMean(items.map((it) => it.score ?? 0), contract.bootstrap)
      interval = { low: Math.max(0, b.low), high: Math.min(1, b.high) }
      intervalMethod = 'cluster-bootstrap'
    }
  }
  return {
    category,
    items: items.length,
    samples: samples.length,
    correct,
    pending,
    rate,
    interval,
    intervalMethod,
    outcomes: count(samples.map((s) => s.outcome)),
    statuses: count(samples.map((s) => s.status)),
  }
}

function itemsFor(result: ScoringResult, cell: CellSpec, categories?: readonly string[]): ScoredItem[] {
  const key = cellKey(cell)
  return result.items.filter((it) => cellKey(it.cell) === key && (!categories || categories.includes(it.category)))
}

function summarizeContrast(spec: ContrastSpec, result: ScoringResult, contract: Contract): ContrastSummary {
  const ia = itemsFor(result, spec.a, spec.categories)
  const ib = itemsFor(result, spec.b, spec.categories)
  const base = {
    id: spec.id,
    description: spec.description,
    a: cellLabel(spec.a),
    b: cellLabel(spec.b),
    categories: spec.categories,
  }
  const samplesA = ia.flatMap((it) => it.samples)
  const samplesB = ib.flatMap((it) => it.samples)
  const failuresA = samplesA.filter((s) => s.score === 0).length
  const failuresB = samplesB.filter((s) => s.score === 0).length
  const outcomeCountsA = count(samplesA.map((s) => s.outcome))
  if (ia.length === 0 || ib.length === 0 || isNotRun(ia) || isNotRun(ib)) {
    return { ...base, state: 'not-run', n: 0, rateA: null, rateB: null, diff: null, test: null, failuresA, failuresB, outcomeCountsA, samplesA: samplesA.length }
  }
  const byId = new Map(ib.map((it) => [it.itemId, it]))
  const pairs = ia.filter((it) => byId.has(it.itemId)).map((it) => [it, byId.get(it.itemId)!] as const)
  if (pairs.some(([x, y]) => x.score === null || y.score === null)) {
    return { ...base, state: 'incomplete', n: pairs.length, rateA: null, rateB: null, diff: null, test: null, failuresA, failuresB, outcomeCountsA, samplesA: samplesA.length }
  }
  const a = pairs.map(([x]) => x.score!)
  const b = pairs.map(([, y]) => y.score!)
  // 比率以「題」為單位（每題權重相同，題分數＝該題樣本平均），與成對檢定、bootstrap 的單位一致。
  const itemMean = (xs: readonly number[]) => (xs.length === 0 ? null : xs.reduce((s, v) => s + v, 0) / xs.length)
  const binary = pairs.every(([x, y]) => x.samples.length === 1 && y.samples.length === 1)
  const test = binary
    ? { kind: 'mcnemar' as const, result: mcnemarExact(a.map((v, i) => [v, b[i]!] as const)) }
    : { kind: 'sign' as const, result: signTest(a.map((v, i) => v - b[i]!)) }
  return {
    ...base,
    state: 'ok',
    n: pairs.length,
    rateA: itemMean(a),
    rateB: itemMean(b),
    diff: pairedBootstrap(a, b, contract.bootstrap),
    test,
    failuresA,
    failuresB,
    outcomeCountsA,
    samplesA: samplesA.length,
  }
}

function pValue(c: ContrastSummary, sided: 'one' | 'two'): number | null {
  if (!c.test) return null
  return sided === 'one' ? c.test.result.pOneSided : c.test.result.pTwoSided
}

function fmt(x: number | null | undefined, digits = 3): string {
  return x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(digits)
}

export function evaluateAcceptance(spec: AcceptanceSpec, contrasts: readonly ContrastSummary[]): AcceptanceResult {
  const c = contrasts.find((x) => x.id === spec.contrast)
  const base = { id: spec.id, contrast: spec.contrast, claim: spec.claim, negation: spec.negation }
  if (!c) return { ...base, verdict: 'INCOMPLETE', explanation: '找不到比較' }
  if (c.state === 'not-run') return { ...base, verdict: 'INCOMPLETE', explanation: '至少一個 cell 沒有執行紀錄' }
  const rule = spec.rule
  if (rule.kind === 'no-harm') {
    if (c.state === 'incomplete') return { ...base, verdict: 'INCOMPLETE', explanation: '有樣本尚未評分（judge 未執行）' }
    const ok = c.failuresA <= c.failuresB + rule.maxExtraFailures
    return { ...base, verdict: ok ? 'PASS' : 'FAIL', explanation: `A 失敗 ${c.failuresA}、B 失敗 ${c.failuresB}，容許 A 比 B 多 ${rule.maxExtraFailures}` }
  }
  if (rule.kind === 'max-rate') {
    if (c.state === 'incomplete') return { ...base, verdict: 'INCOMPLETE', explanation: '有樣本尚未評分（judge 未執行）' }
    const outcome = rule.metric === 'fabrication' ? 'incorrect' : 'unexplained-different'
    const k = c.outcomeCountsA[outcome] ?? 0
    const rate = c.samplesA === 0 ? 0 : k / c.samplesA
    return { ...base, verdict: rate <= rule.max ? 'PASS' : 'FAIL', explanation: `A 的 ${outcome} 比率 ${k}/${c.samplesA}＝${fmt(rate)}，上限 ${rule.max}` }
  }
  if (c.state === 'incomplete' || !c.diff || c.rateA === null || c.rateB === null) {
    return { ...base, verdict: 'INCOMPLETE', explanation: '有樣本尚未評分（judge 未執行）' }
  }
  const p = pValue(c, rule.sided)!
  const checks: [boolean, string][] = [
    [c.diff.estimate >= rule.minDiff, `差 ${fmt(c.diff.estimate)} ≥ ${rule.minDiff}`],
    [c.diff.low >= rule.minCiLow, `95% 區間下界 ${fmt(c.diff.low)} ≥ ${rule.minCiLow}`],
    [p <= rule.maxP, `${c.test!.kind === 'mcnemar' ? '精確 McNemar' : '精確符號檢定'}（${rule.sided === 'one' ? '單尾' : '雙尾'}）p=${p.toPrecision(3)} ≤ ${rule.maxP}`],
  ]
  if (rule.minRateA !== undefined) checks.push([c.rateA >= rule.minRateA, `A 比率 ${fmt(c.rateA)} ≥ ${rule.minRateA}`])
  if (rule.maxRateB !== undefined) checks.push([c.rateB <= rule.maxRateB, `B 比率 ${fmt(c.rateB)} ≤ ${rule.maxRateB}`])
  const pass = checks.every(([ok]) => ok)
  return { ...base, verdict: pass ? 'PASS' : 'FAIL', explanation: checks.map(([ok, text]) => `${ok ? '✓' : '✗'} ${text}`).join('；') }
}

export function summarize(
  result: ScoringResult,
  contract: Contract,
  datasetSha256: string,
  cells: readonly CellSpec[],
  toolCallsByCell: ReadonlyMap<string, Readonly<Record<string, number>>> = new Map(),
): Summary {
  const cellSummaries: CellSummary[] = cells.map((cell) => {
    const items = itemsFor(result, cell)
    return {
      cell,
      key: cellKey(cell),
      label: cellLabel(cell),
      notRun: isNotRun(items),
      categories: contract.categories.map((cat) => summarizeCategory(cat.id, items.filter((it) => it.category === cat.id), contract)),
      toolCalls: toolCallsByCell.get(cellKey(cell)) ?? {},
    }
  })
  const contrasts = contract.contrasts.map((c) => summarizeContrast(c, result, contract))
  const acceptance = contract.acceptance.map((a) => evaluateAcceptance(a, contrasts))
  const crossCheck =
    result.crossChecks.length === 0
      ? null
      : {
          total: result.crossChecks.length,
          agree: result.crossChecks.filter((x) => x.judge === 'yes').length,
          disagree: result.crossChecks.filter((x) => x.judge !== 'yes').map((x) => `${cellKey(x.cell)}|${x.itemId}|r${x.repeat}→${x.judge}`),
        }
  return { contract: contract.id, dataset: contract.dataset, datasetSha256, cells: cellSummaries, contrasts, acceptance, crossCheck }
}

function pct(k: number, n: number): string {
  return n === 0 ? '—' : `${k}/${n}`
}

export function renderMarkdown(summary: Summary, contract: Contract, extra: { readonly judgeLine: string; readonly issues: readonly string[] }): string {
  const lines: string[] = []
  lines.push(`# 評估摘要：${summary.contract}`, '')
  lines.push(`- 資料集：${summary.dataset}（sha256 ${summary.datasetSha256}）`)
  lines.push(`- ${extra.judgeLine}`)
  lines.push('- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。', '')
  lines.push('## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）', '')
  const header = ['類別', ...summary.cells.map((c) => c.label + (c.notRun ? '（未執行）' : ''))]
  lines.push(`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`)
  for (const cat of contract.categories) {
    const row = [cat.id]
    for (const cell of summary.cells) {
      const s = cell.categories.find((x) => x.category === cat.id)!
      if (cell.notRun) row.push('—')
      else if (s.rate === null) row.push(`${pct(s.correct, s.samples)}（${s.pending} 筆待 judge）`)
      else row.push(`${pct(s.correct, s.samples)}＝${fmt(s.rate, 2)} [${fmt(s.interval?.low, 2)}, ${fmt(s.interval?.high, 2)}]`)
    }
    lines.push(`| ${row.join(' | ')} |`)
  }
  lines.push('', '## 結果類型（每個 cell 的樣本結果計數）', '')
  for (const cell of summary.cells) {
    if (cell.notRun) continue
    lines.push(`### ${cell.label}`, '')
    for (const s of cell.categories) {
      const outcomes = Object.entries(s.outcomes).map(([k, v]) => `${k}=${v}`).join('、')
      lines.push(`- ${s.category}：${outcomes}`)
    }
    const tools = Object.entries(cell.toolCalls).map(([k, v]) => `${k}=${v}`).join('、')
    lines.push(`- 工具呼叫（歷史＋探針，描述性）：${tools || '無'}`)
    lines.push('')
  }
  lines.push('## 成對比較（同一題在兩個條件下）', '')
  lines.push('| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const c of summary.contrasts) {
    const test = c.test
      ? c.test.kind === 'mcnemar'
        ? `McNemar b=${c.test.result.b} c=${c.test.result.c}`
        : `符號 +${c.test.result.positive}/−${c.test.result.negative}/=${c.test.result.ties}`
      : '—'
    const p = c.test ? `${c.test.result.pTwoSided.toPrecision(3)} / ${c.test.result.pOneSided.toPrecision(3)}` : '—'
    const diff = c.diff ? `${fmt(c.diff.estimate)} [${fmt(c.diff.low)}, ${fmt(c.diff.high)}]` : '—'
    lines.push(`| ${c.id}：${c.a} vs ${c.b} | ${c.categories.join('、')} | ${c.n} | ${fmt(c.rateA)} | ${fmt(c.rateB)} | ${diff} | ${test} | ${p} | ${c.state} |`)
  }
  lines.push('', '## 預先登記的驗收線', '')
  for (const a of summary.acceptance) {
    lines.push(`- **${a.id} ${a.verdict}**：${a.claim}`)
    lines.push(`  - 判定依據：${a.explanation}`)
    lines.push(`  - 否定條件：${a.negation}`)
  }
  if (summary.crossCheck) {
    lines.push('', '## 確定性命中 vs judge 交叉檢查', '')
    lines.push(`- 確定性命中 ${summary.crossCheck.total} 筆，其中 judge 也判 yes 的 ${summary.crossCheck.agree} 筆。`)
    for (const d of summary.crossCheck.disagree.slice(0, 50)) lines.push(`  - 不一致：${d}`)
  }
  if (extra.issues.length > 0) {
    lines.push('', '## 紀錄與協定問題（全部已按契約計入分母）', '')
    for (const i of extra.issues.slice(0, 200)) lines.push(`- ${i}`)
    if (extra.issues.length > 200) lines.push(`- ……另有 ${extra.issues.length - 200} 筆，見 summary.json`)
  }
  lines.push('')
  return lines.join('\n')
}
