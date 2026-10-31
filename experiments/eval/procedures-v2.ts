/**
 * procedures-v2：做法的修改方向與經歷的關係（規格 experiments/specs/procedures-v2.md；算法見 lib/procedures.ts）。
 * 讀執行紀錄與歷史結束時的生命日誌快照；HP4 的盲測比對呼叫 judge（deepseek-v4-pro，thinking disabled），其餘不呼叫 API。
 *
 * 用法：
 *   source scripts/env.sh   # judge 需要 DEEPSEEK_API_KEY（本程式不印出、不寫入金鑰）
 *   node experiments/eval/procedures-v2.ts --runs <runId>… --out <目錄> [--describe <runId>…] [--judge deepseek|replay]
 *   --runs：判定用的個體（runId 的資料集決定它實際相處的對象）；--describe：只列入描述性的表（例如 procedures-v1 的三格）。
 * 輸出（--out 目錄）：summary.md、summary.json、judge-raw.jsonl。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { JudgeSpec } from './lib/contract.ts'
import { DeepSeekJudge, ReplayJudge, type Judge } from './lib/judge.ts'
import {
  PROCEDURE_KINDS,
  addedText,
  changesText,
  earlyStop,
  evolution,
  hp4,
  hp5,
  matchPrompt,
  noiseAuc,
  noisePoints,
  parseMatch,
  shuffledOrder,
  verdicts,
  type Evolution,
  type MatchResult,
} from './lib/procedures.ts'
import { render } from './procedures.ts'

/** 三種對象（資料集）；編號就是 MatchResult 的 history。 */
export const HISTORIES = ['procedures-v1-a', 'procedures-v1-b', 'procedures-v1-c'] as const

/** 與 v3 起的契約相同的 judge 設定（CLAUDE.md：評分的 judge 固定為 deepseek-v4-pro，thinking disabled）。 */
export const JUDGE: JudgeSpec = {
  model: 'deepseek-v4-pro',
  endpoint: 'https://api.deepseek.com/chat/completions',
  temperature: 0,
  maxTokens: 400,
  thinking: 'disabled',
  maxAttempts: 3,
  pricesUsdPerMillion: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
  maxUsdPerRun: 1,
}

interface Row {
  readonly id: string
  readonly kind: string
  readonly data: unknown
}

function rows(stateDir: string): Row[] {
  const file = join(stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(file)) throw new Error(`找不到生命日誌快照（${file}）`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const kinds = [...PROCEDURE_KINDS, 'self/procedure-probe']
    return (db.prepare(`select id, kind, data from events where kind in (${kinds.map(() => '?').join(', ')}) order by seq`).all(...kinds) as { id: string; kind: string; data: string }[]).map((r) => ({ id: r.id, kind: r.kind, data: JSON.parse(r.data) as unknown }))
  } finally {
    db.close()
  }
}

interface Individual {
  readonly id: string
  readonly history: number
  readonly rows: readonly Row[]
  readonly e: Evolution
}

function load(root: string, id: string): Individual {
  const config = JSON.parse(readFileSync(join(root, 'experiments/runs', id, 'config.json'), 'utf8')) as { stateDir: string; dataset: { id: string } }
  const history = (HISTORIES as readonly string[]).indexOf(config.dataset.id)
  if (history < 0) throw new Error(`${id} 的資料集 ${config.dataset.id} 不是 procedures-v1-a、-b、-c`)
  const r = rows(config.stateDir)
  return { id, history, rows: r, e: evolution(r) }
}

function rulesOf(root: string): string[] {
  return HISTORIES.map((h) => (JSON.parse(readFileSync(join(root, 'experiments/datasets', `${h}.json`), 'utf8')) as { meta: { simulatedUser: { rule: string } } }).meta.simulatedUser.rule)
}

const fmt = (x: number | undefined, d = 2) => (x === undefined ? '—' : x.toFixed(d))

export async function main(argv: readonly string[], root: string): Promise<string> {
  const values = (flag: string) => {
    const out: string[] = []
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] !== flag) continue
      for (let j = i + 1; j < argv.length && !argv[j]!.startsWith('--'); j++) out.push(argv[j]!)
    }
    return out
  }
  const runs = values('--runs')
  const describe = values('--describe')
  const outDir = values('--out')[0]
  const mode = values('--judge')[0] ?? 'deepseek'
  if (runs.length === 0 || !outDir) throw new Error('用法：node experiments/eval/procedures-v2.ts --runs <runId>… --out <目錄> [--describe <runId>…] [--judge deepseek|replay]')
  mkdirSync(outDir, { recursive: true })
  const cache = join(outDir, 'judge-raw.jsonl')
  const judge: Judge = mode === 'replay' ? new ReplayJudge(JUDGE, [cache]) : new DeepSeekJudge({ spec: JUDGE, cacheFile: cache, maxUsd: JUDGE.maxUsdPerRun })
  const rules = rulesOf(root)
  const judged = runs.map((id) => load(root, id))
  const described = describe.map((id) => load(root, id))

  // HP4：有採用過修改（最後的做法與第一版不同）的個體。
  const matches: (MatchResult & { readonly order: readonly number[]; readonly reason?: string; readonly status: string })[] = []
  for (const ind of judged) {
    const changes = changesText(ind.e)
    if (!changes) continue
    const order = shuffledOrder(ind.id, rules.length)
    const outcome = await judge.judge({ prompt: 'proc-match', pair: matchPrompt(rules, order, changes), parse: parseMatch, context: `procedures-v2/${ind.id}` })
    const chosen = outcome.status === 'ok' ? order[Number(outcome.value!['choice']) - 1] : undefined
    matches.push({ id: ind.id, history: ind.history, ...(chosen !== undefined ? { chosen } : {}), order, ...(outcome.value?.['reason'] ? { reason: outcome.value['reason'] } : {}), status: outcome.status })
  }
  const h4 = hp4(matches)
  const h5 = hp5(judged.filter((i) => addedText(i.e)).map((i) => ({ history: i.history, text: addedText(i.e) })))

  const all = [...described, ...judged]
  const points = all.flatMap((i) => noisePoints(i.rows))
  const auc = noiseAuc(points)
  const stop = all.map((i) => ({ id: i.id, ...earlyStop(i.rows) }))
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length === 0 ? undefined : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
  }
  const letter = (h: number) => 'ABC'[h]!

  const lines = [
    '# procedures-v2 摘要',
    '',
    `- judge：${JUDGE.model}（thinking ${JUDGE.thinking}、temperature ${JUDGE.temperature}）；${judge.provenance().calls} 次 API 呼叫，估計 US$${judge.provenance().spentUsd.toFixed(4)}`,
    '',
    '## 預先登記的判定',
    '',
    `- **HP4**（修改的方向來自經歷，盲測比對）：${h4.verdict}——有採用過修改的個體 ${h4.n} 個，judge 答對 ${h4.correct} 個（單尾二項檢定對 1/3，p＝${fmt(h4.p, 4)}；答對的來自 ${h4.histories} 段不同的歷史）。`,
    `- **HP5**（新增的句子，同一段歷史之內比之間相似）：${h5.verdict}——之內減之間 ${fmt(h5.observed, 3)}，置換檢定 p＝${fmt(h5.p, 4)}（${h5.permutations} 種排列）。`,
    '',
    '| 個體 | 實際的對象 | judge 選的 | 狀態 | 理由 |',
    '|---|---|---|---|---|',
    ...matches.map((m) => `| ${m.id} | ${letter(m.history)} | ${m.chosen === undefined ? '—' : letter(m.chosen)} | ${m.status} | ${(m.reason ?? '').replace(/\|/g, '｜')} |`),
    ...judged.filter((i) => !changesText(i.e)).map((i) => `| ${i.id} | ${letter(i.history)} | （沒有採用過修改，不列入） | — | — |`),
    '',
    '## 每個個體（HP1～HP3 的計數，描述性）',
    '',
    render([...described, ...judged].map((i) => ({ id: i.id, e: i.e }))),
    '',
    '## 雜訊的數值對照（描述性）',
    '',
    `- 處境 ${points.length} 個（大於雜訊 ${points.filter((p) => p.beyondNoise).length} 個）；現行做法兩個輸出之間的文字距離中位數 ${fmt(median(points.map((p) => p.reference)), 3)}。`,
    `- 個體判斷「大於雜訊」的處境，文字距離的超出量（提案與現行的距離 − 現行兩次之間的距離）比較大的機率（AUC）：${fmt(auc, 3)}（0.5＝與判斷無關）。`,
    `- 超出量大於 0 的比例：大於雜訊 ${fmt(ratio(points.filter((p) => p.beyondNoise)), 2)}、不大於 ${fmt(ratio(points.filter((p) => !p.beyondNoise)), 2)}。`,
    '',
    '## 閘門的成本（描述性）',
    '',
    '| 個體 | 有雜訊基準的判斷 | 呼叫 | 每個判斷的呼叫 | 只看第一個處境就停時會改變結論的判斷 |',
    '|---|---|---|---|---|',
    ...stop.map((s) => `| ${s.id} | ${s.decisions} | ${s.calls} | ${s.decisions ? (s.calls / s.decisions).toFixed(1) : '—'} | ${s.changed} |`),
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ hp4: h4, hp5: h5, matches, noise: { points: points.length, auc }, earlyStop: stop, verdictsHP1to3: verdicts(judged.map((i) => ({ id: i.id, e: i.e }))) }, null, 2)}\n`)
  return text
}

function ratio(points: readonly { readonly candidate: number; readonly reference: number }[]): number | undefined {
  return points.length === 0 ? undefined : points.filter((p) => p.candidate - p.reference > 0).length / points.length
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(await main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
