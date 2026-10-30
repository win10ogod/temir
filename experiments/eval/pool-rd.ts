/**
 * 多次歷史的合併判定（rd-v4 起；規格 experiments/specs/rd-v4.md）。條件、類別與門檻從契約的 replicates／pooled 區塊讀取。
 *
 * 用法：node experiments/eval/pool-rd.ts <資料集> <前綴,前綴,…> [--out <目錄>] [--no-life]
 *   例如 node experiments/eval/pool-rd.ts rd-v4 rdv4h1,rdv4h2,rdv4h3
 * 每一次歷史先以 score.ts 計分到 experiments/results/<資料集>-<前綴>/（items.jsonl）。
 * 結果寫到 --out（預設 experiments/results/<資料集>/）的 pooled.md 與 pooled.json。
 * 機制要讀每一次執行的生命日誌（config.json 的 stateDir，只在執行的機器上）；找不到（或 --no-life）時，機制記為 INCOMPLETE。
 *
 * - 行動（例如 R4A）：每一題在所有歷史、重複中的平均分數，兩條件逐題相減；以題為單位的成對 bootstrap 區間與精確符號檢定。
 * - 對照（例如 R4C）：所有歷史合計，a 比 b 多錯的樣本數。
 * - 機制（例如 R4M）：探針中某一類候選被扣除的比例（合計，從生命日誌的 rd/decision 計算；lib/rd-mechanism.ts）。
 * 歷史的次數少於契約的 replicates.count 時，三個判定都是 INCOMPLETE。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PooledSpec } from './lib/contract.ts'
import { validatePooled } from './lib/contract.ts'
import { EMPTY_MECHANISM, addMechanism, dataOf, excludedRate, lifeDecisions, mechanism, type DecisionRow, type Mechanism } from './lib/rd-mechanism.ts'
import { pairedBootstrap, signTest } from './lib/stats.ts'

export interface ItemRow {
  readonly condition: string
  readonly itemId: string
  readonly category: string
  readonly repeat: number
  readonly score: number | null
}

/** 每一題在所有歷史與重複中的平均分數（沒有分數的樣本算 0，與計分器一致）。 */
export function perItemMeans(rows: readonly ItemRow[], condition: string, category: string): Map<string, number> {
  const sums = new Map<string, { s: number; n: number }>()
  for (const r of rows) {
    if (r.condition !== condition || r.category !== category) continue
    const x = sums.get(r.itemId) ?? { s: 0, n: 0 }
    x.s += r.score ?? 0
    x.n += 1
    sums.set(r.itemId, x)
  }
  return new Map([...sums].map(([k, v]) => [k, v.s / v.n]))
}

export interface ActionVerdict {
  readonly items: number
  readonly a: number
  readonly b: number
  readonly diff: number
  readonly low: number
  readonly high: number
  readonly positive: number
  readonly negative: number
  readonly ties: number
  readonly pOneSided: number
  readonly pass: boolean
}

/** 行動：差 ≥ minDiff、區間下界 ≥ minLow、單尾 p ≤ maxP（三條都要成立）。 */
export function actionVerdict(a: Map<string, number>, b: Map<string, number>, rule: { minDiff: number; minLow: number; maxP: number }, seed: number): ActionVerdict {
  const ids = [...a.keys()].filter((k) => b.has(k)).sort()
  const xa = ids.map((k) => a.get(k)!)
  const xb = ids.map((k) => b.get(k)!)
  const boot = pairedBootstrap(xa, xb, { resamples: 10_000, seed })
  const sign = signTest(xa.map((x, i) => x - xb[i]!))
  const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const diff = mean(xa) - mean(xb)
  return {
    items: ids.length,
    a: mean(xa),
    b: mean(xb),
    diff,
    low: boot.low,
    high: boot.high,
    positive: sign.positive,
    negative: sign.negative,
    ties: sign.ties,
    pOneSided: sign.pOneSided,
    pass: diff >= rule.minDiff - 1e-12 && boot.low >= rule.minLow - 1e-12 && sign.pOneSided <= rule.maxP + 1e-12,
  }
}

/** 對照：a 比 b 多錯的樣本數不超過 maxExtraFailures。 */
export function controlVerdict(failuresA: number, failuresB: number, rule: { maxExtraFailures: number }): { readonly extra: number; readonly pass: boolean } {
  const extra = failuresA - failuresB
  return { extra, pass: extra <= rule.maxExtraFailures }
}

export type MechanismVerdict = 'PASS' | 'FAIL' | 'INCOMPLETE'

/** 機制：b 的扣除比例減 a 的至少 minDrop；任一條件的這類候選少於 minCandidates 個時為 INCOMPLETE。 */
export function mechanismVerdict(a: Mechanism, b: Mechanism, rule: { minDrop: number; minCandidates: number }): MechanismVerdict {
  if (a.advice < rule.minCandidates || b.advice < rule.minCandidates) return 'INCOMPLETE'
  return excludedRate(b) - excludedRate(a) >= rule.minDrop - 1e-12 ? 'PASS' : 'FAIL'
}

/** pooled.json 中的機制統計（只留合併判定用到的欄位，與 2026-10-30 之前的輸出相同）。 */
type PooledMechanism = Pick<Mechanism, 'advice' | 'excluded' | 'chosen' | 'required' | 'failed' | 'lift' | 'keep'>
const pick = (m: Mechanism): PooledMechanism => ({ advice: m.advice, excluded: m.excluded, chosen: m.chosen, required: m.required, failed: m.failed, lift: m.lift, keep: m.keep })

export interface Pooled {
  readonly prefixes: readonly string[]
  readonly action: ActionVerdict
  readonly control: Readonly<Record<string, number>>
  readonly extraControl: number
  /** 生命日誌不在這台機器上時為 null。 */
  readonly mechanism: Readonly<Record<string, PooledMechanism>> | null
  readonly mechanismVerdict: MechanismVerdict
}

export interface Contracted {
  readonly bootstrap: { readonly seed: number }
  readonly categories: readonly { readonly id: string }[]
  readonly replicates?: { readonly count: number }
  readonly pooled?: PooledSpec
}

/** 讀契約並檢查 replicates／pooled 區塊。 */
export function pooledContract(root: string, dataset: string): Contracted & { readonly pooled: PooledSpec; readonly replicates: { readonly count: number } } {
  const contract = JSON.parse(readFileSync(join(root, 'experiments/specs', `${dataset}.contract.json`), 'utf8')) as Contracted
  const errors = contract.pooled ? validatePooled(contract) : [`契約 ${dataset} 沒有 pooled 區塊`]
  if (errors.length > 0) throw new Error(errors.join('\n'))
  return contract as Contracted & { readonly pooled: PooledSpec; readonly replicates: { readonly count: number } }
}

/** 合併判定：只讀 items.jsonl、執行紀錄的 config.json 與（life＝true 時）生命日誌，不呼叫 API。 */
export function pool(root: string, dataset: string, prefixes: readonly string[], options: { readonly life?: boolean } = {}): { readonly pooled: Pooled; readonly spec: PooledSpec; readonly complete: boolean } {
  const contract = pooledContract(root, dataset)
  const spec = contract.pooled
  const conditions = [spec.a, spec.b]
  const rows: ItemRow[] = []
  const control: Record<string, number> = {}
  const mech: Record<string, Mechanism> = {}
  let lifeMissing = options.life === false
  for (const p of prefixes) {
    const items = readFileSync(join(root, 'experiments/results', `${dataset}-${p}`, 'items.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as ItemRow)
    rows.push(...items)
    for (const cond of conditions) {
      control[cond] = (control[cond] ?? 0) + items.filter((r) => r.condition === cond && r.category === spec.control.category && (r.score ?? 0) < 1).length
      if (lifeMissing) continue
      const cfg = JSON.parse(readFileSync(join(root, 'experiments/runs', `${p}__${dataset}__${cond}__${spec.runModel}__${spec.runModel}`, 'config.json'), 'utf8')) as { stateDir: string }
      const life = existsSync(cfg.stateDir) ? lifeDecisions(cfg.stateDir) : undefined
      if (!life) {
        lifeMissing = true
        continue
      }
      mech[cond] = addMechanism(mech[cond] ?? EMPTY_MECHANISM, mechanism(dataOf<DecisionRow>(life.probes, 'rd/decision'), spec.mechanism.kind))
    }
  }
  const complete = prefixes.length >= contract.replicates.count
  const action = actionVerdict(perItemMeans(rows, spec.a, spec.action.category), perItemMeans(rows, spec.b, spec.action.category), { minDiff: spec.action.minDiff, minLow: spec.action.minCiLow, maxP: spec.action.maxP }, contract.bootstrap.seed)
  const ctl = controlVerdict(control[spec.a]!, control[spec.b]!, spec.control)
  const mv = lifeMissing || !complete ? 'INCOMPLETE' : mechanismVerdict(mech[spec.a]!, mech[spec.b]!, spec.mechanism)
  return {
    pooled: {
      prefixes,
      action,
      control,
      extraControl: ctl.extra,
      mechanism: lifeMissing ? null : Object.fromEntries(conditions.map((c) => [c, pick(mech[c]!)])),
      mechanismVerdict: mv,
    },
    spec,
    complete,
  }
}

/** pooled.md 的內容。 */
export function renderPooled(dataset: string, result: ReturnType<typeof pool>): string[] {
  const { pooled, spec, complete } = result
  const { action, control, extraControl } = pooled
  const f = (x: number) => x.toFixed(3)
  const verdict = (pass: boolean) => (complete ? (pass ? 'PASS' : 'FAIL') : 'INCOMPLETE')
  const on = pooled.mechanism?.[spec.a]
  const off = pooled.mechanism?.[spec.b]
  const rate = (m: PooledMechanism) => f(excludedRate({ ...EMPTY_MECHANISM, ...m }))
  const lines = [
    `# ${dataset}：三次歷史合併的判定（${pooled.prefixes.join('、')}）`,
    '',
    `| id | 判定 | 依據 |`,
    `|---|---|---|`,
    `| ${spec.action.id} | ${verdict(action.pass)} | D20 開 ${f(action.a)}、關 ${f(action.b)}，差 ${f(action.diff)} [${f(action.low)}, ${f(action.high)}]；${action.items} 題中較好 ${action.positive}、較差 ${action.negative}、相同 ${action.ties}；單尾 p＝${action.pOneSided.toFixed(4)} |`,
    `| ${spec.control.id} | ${verdict(extraControl <= spec.control.maxExtraFailures)} | 對照題三次合計：開錯 ${control[spec.a]}、關錯 ${control[spec.b]}，多錯 ${extraControl}（容許 ${spec.control.maxExtraFailures}） |`,
    on && off
      ? `| ${spec.mechanism.id} | ${pooled.mechanismVerdict} | 探針中「給${spec.mechanism.kind}」被扣除：開 ${on.excluded}/${on.advice}（${rate(on)}）、關 ${off.excluded}/${off.advice}（${rate(off)}） |`
      : `| ${spec.mechanism.id} | ${pooled.mechanismVerdict} | 生命日誌不在這台機器上，沒有計算 |`,
    '',
    ...(on && off ? [`- 強制判斷（D20 開）：需要判斷 ${on.required} 個扣除，判斷不合格 ${on.failed} 次；lift ${on.lift}、keep ${on.keep}。`, `- 「給${spec.mechanism.kind}」被選中：開 ${on.chosen}、關 ${off.chosen}。`] : []),
    ...(complete ? [] : [`- 歷史只有 ${pooled.prefixes.length} 次，少於契約的次數，判定為 INCOMPLETE。`]),
  ]
  return lines
}

function main(argv: readonly string[]): number {
  const args = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out')
  const [dataset, prefixList] = args
  if (!dataset || !prefixList) {
    console.error('用法：node experiments/eval/pool-rd.ts <資料集> <前綴,前綴,…> [--out <目錄>] [--no-life]')
    return 2
  }
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
  const result = pool(root, dataset, prefixList.split(','), { life: !argv.includes('--no-life') })
  const lines = renderPooled(dataset, result)
  const outIndex = argv.indexOf('--out')
  const out = outIndex >= 0 ? argv[outIndex + 1]! : join(root, 'experiments/results', dataset)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'pooled.md'), lines.join('\n') + '\n')
  writeFileSync(join(out, 'pooled.json'), JSON.stringify(result.pooled, null, 2) + '\n')
  console.log(lines.join('\n'))
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error((error as Error).stack ?? String(error))
    process.exitCode = 1
  }
}
