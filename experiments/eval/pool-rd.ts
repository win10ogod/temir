/**
 * rd-v4 的預先登記判定：每個條件 3 次歷史，合併之後判定（規格 experiments/specs/rd-v4.md）。
 *
 * 用法：node experiments/eval/pool-rd.ts <資料集> <前綴,前綴,…>
 *   例如 node experiments/eval/pool-rd.ts rd-v4 rdv4h1,rdv4h2,rdv4h3
 * 每一次歷史先以 score.ts 計分到 experiments/results/<資料集>-<前綴>/（items.jsonl）。
 *
 * - R4A（行動）：每一題在三次歷史、兩次重複中的平均分數，兩條件逐題相減；以題為單位的成對 bootstrap 區間與精確符號檢定。
 * - R4C（對照）：三次合計，D20 開比關多錯的題數。
 * - R4M（機制）：探針中「給建議」候選被扣除的比例（三次合計，從生命日誌的 rd/decision 計算）。
 * 判定的門檻寫在規格中，這裡照著計算。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

/** R4A：差 ≥ minDiff、區間下界 ≥ minLow、單尾 p ≤ maxP（三條都要成立）。 */
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

interface Mechanism {
  advice: number
  excluded: number
  chosen: number
  required: number
  failed: number
  lift: number
  keep: number
}

/** 一次執行的探針中，「給建議」候選與強制判斷的統計（rd/decision，快照之後）。 */
function mechanism(stateDir: string): Mechanism {
  const m: Mechanism = { advice: 0, excluded: 0, chosen: 0, required: 0, failed: 0, lift: 0, keep: 0 }
  const snap = join(stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(snap)) return m
  const base = (new DatabaseSync(snap, { readOnly: true }).prepare('select max(seq) as s from events').get() as { s: number }).s
  const root = join(stateDir, 'probes')
  if (!existsSync(root)) return m
  for (const q of readdirSync(root)) {
    for (const r of readdirSync(join(root, q))) {
      const file = join(root, q, r, 'home/.local/share/temir/life.db')
      if (!existsSync(file)) continue
      const db = new DatabaseSync(file, { readOnly: true })
      for (const { data } of db.prepare("select data from events where kind = 'rd/decision' and seq > ?").all(base) as { data: string }[]) {
        const d = JSON.parse(data) as { chosen: number; review?: { required: number; failed?: string }; candidates: { kind: string; excluded?: boolean; judgment?: { decision: string } }[] }
        m.required += d.review?.required ?? 0
        if (d.review?.failed) m.failed++
        d.candidates.forEach((c, i) => {
          if (c.judgment?.decision === 'lift') m.lift++
          if (c.judgment?.decision === 'keep') m.keep++
          if (c.kind !== '建議') return
          m.advice++
          if (c.excluded) m.excluded++
          if (i === d.chosen) m.chosen++
        })
      }
    }
  }
  return m
}

async function main(): Promise<number> {
  const [dataset, prefixList] = process.argv.slice(2)
  if (!dataset || !prefixList) {
    console.error('用法：node experiments/eval/pool-rd.ts <資料集> <前綴,前綴,…>')
    return 2
  }
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
  const prefixes = prefixList.split(',')
  const contract = JSON.parse(readFileSync(join(root, 'experiments/specs', `${dataset}.contract.json`), 'utf8')) as { bootstrap: { seed: number } }
  const rows: ItemRow[] = []
  const mech: Record<string, Mechanism> = {}
  const control: Record<string, number> = {}
  for (const p of prefixes) {
    const items = readFileSync(join(root, 'experiments/results', `${dataset}-${p}`, 'items.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as ItemRow)
    rows.push(...items)
    for (const cond of ['temir', 'temir-no-revision']) {
      control[cond] = (control[cond] ?? 0) + items.filter((r) => r.condition === cond && r.category === 'control' && (r.score ?? 0) < 1).length
      const cfg = JSON.parse(readFileSync(join(root, 'experiments/runs', `${p}__${dataset}__${cond}__deepseek__deepseek`, 'config.json'), 'utf8')) as { stateDir: string }
      const m = mechanism(cfg.stateDir)
      const acc = (mech[cond] ??= { advice: 0, excluded: 0, chosen: 0, required: 0, failed: 0, lift: 0, keep: 0 })
      for (const k of Object.keys(m) as (keyof Mechanism)[]) acc[k] += m[k]
    }
  }
  const action = actionVerdict(perItemMeans(rows, 'temir', 'practical'), perItemMeans(rows, 'temir-no-revision', 'practical'), { minDiff: 0.25, minLow: 0, maxP: 0.05 }, contract.bootstrap.seed)
  const rate = (m: Mechanism) => (m.advice > 0 ? m.excluded / m.advice : Number.NaN)
  const on = mech['temir']!
  const off = mech['temir-no-revision']!
  const mechanismVerdict = on.advice < 4 || off.advice < 4 ? 'INCOMPLETE' : rate(off) - rate(on) >= 0.25 - 1e-12 ? 'PASS' : 'FAIL'
  const extraControl = control['temir']! - control['temir-no-revision']!
  const f = (x: number) => x.toFixed(3)
  const lines = [
    `# ${dataset}：三次歷史合併的判定（${prefixes.join('、')}）`,
    '',
    `| id | 判定 | 依據 |`,
    `|---|---|---|`,
    `| R4A-flash | ${action.pass ? 'PASS' : 'FAIL'} | D20 開 ${f(action.a)}、關 ${f(action.b)}，差 ${f(action.diff)} [${f(action.low)}, ${f(action.high)}]；${action.items} 題中較好 ${action.positive}、較差 ${action.negative}、相同 ${action.ties}；單尾 p＝${action.pOneSided.toFixed(4)} |`,
    `| R4C-flash | ${extraControl <= 2 ? 'PASS' : 'FAIL'} | 對照題三次合計：開錯 ${control['temir']}、關錯 ${control['temir-no-revision']}，多錯 ${extraControl}（容許 2） |`,
    `| R4M-flash | ${mechanismVerdict} | 探針中「給建議」被扣除：開 ${on.excluded}/${on.advice}（${f(rate(on))}）、關 ${off.excluded}/${off.advice}（${f(rate(off))}） |`,
    '',
    `- 強制判斷（D20 開）：需要判斷 ${on.required} 個扣除，判斷不合格 ${on.failed} 次；lift ${on.lift}、keep ${on.keep}。`,
    `- 「給建議」被選中：開 ${on.chosen}、關 ${off.chosen}。`,
  ]
  const out = join(root, 'experiments/results', dataset)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'pooled.md'), lines.join('\n') + '\n')
  writeFileSync(join(out, 'pooled.json'), JSON.stringify({ prefixes, action, control, extraControl, mechanism: mech, mechanismVerdict }, null, 2) + '\n')
  console.log(lines.join('\n'))
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      console.error((error as Error).stack ?? String(error))
      process.exitCode = 1
    },
  )
}
