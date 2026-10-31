/**
 * pc-eval-v1：同樣的經歷、不同的初始人設（規格 experiments/specs/pc-eval-v1.md；PC 理論性質 2；算法見 lib/pc-eval.ts）。
 * 讀執行紀錄與歷史結束時的生命日誌快照；兩個判定呼叫 judge（deepseek-v4-pro，thinking disabled），其餘不呼叫 API。
 *
 * 用法：
 *   source scripts/env.sh   # judge 需要 DEEPSEEK_API_KEY（本程式不印出、不寫入金鑰）
 *   node experiments/eval/pc-eval-v1.ts --runs <runId>… --out <目錄> [--judge deepseek|replay]
 * 輸出（--out 目錄）：summary.md、summary.json、judge-raw.jsonl。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { JudgeSpec } from './lib/contract.ts'
import { DeepSeekJudge, ReplayJudge, type Judge } from './lib/judge.ts'
import { e1, e2, evalMatchPrompt, parseChoice, renderEvaluations, revisionMatchPrompt, swapped, type Evaluation, type MatchUnit } from './lib/pc-eval.ts'

/** 兩個條件（初始人設）；編號是 MatchUnit 的 persona。 */
export const PERSONAS = ['temir-direct', 'temir-relational'] as const
const PATCH = { 'temir-direct': 'persona-direct.yml', 'temir-relational': 'persona-relational.yml' } as const
/** 會讓兩種價值評價不同的關鍵對話（資料集的 notes 標為「關鍵事件」）。 */
export const KEY_SESSIONS = ['h02', 'h03', 'h04', 'h05', 'h07', 'h08', 'h09'] as const

export const JUDGE: JudgeSpec = {
  model: 'deepseek-v4-pro',
  endpoint: 'https://api.deepseek.com/chat/completions',
  temperature: 0,
  maxTokens: 400,
  thinking: 'disabled',
  maxAttempts: 3,
  pricesUsdPerMillion: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
  maxUsdPerRun: 2,
}

interface Life {
  readonly id: string
  readonly persona: number
  readonly rep: string
  /** 歷史 id → 那段對話的 sessionId。 */
  readonly sessions: ReadonlyMap<string, string>
  readonly outcomes: readonly { readonly seq: number; readonly session: string; readonly e: Evaluation }[]
  readonly appraisals: readonly { readonly seq: number; readonly session: string; readonly text: string }[]
  readonly revisions: readonly { readonly seq: number; readonly version: number; readonly text: string; readonly reason: string }[]
}

/** 人設的自我模型（patch 檔的 selfModel 一行）。 */
export function personaText(root: string, condition: (typeof PERSONAS)[number]): string {
  const yml = readFileSync(join(root, 'experiments/runner/patches', PATCH[condition]), 'utf8')
  return (/selfModel:\s*(.+)/u.exec(yml)?.[1] ?? '').trim()
}

function load(root: string, id: string): Life {
  const config = JSON.parse(readFileSync(join(root, 'experiments/runs', id, 'config.json'), 'utf8')) as { stateDir: string; condition: string }
  const persona = (PERSONAS as readonly string[]).indexOf(config.condition)
  if (persona < 0) throw new Error(`${id} 的條件 ${config.condition} 不是 ${PERSONAS.join('、')}`)
  const sessions = new Map<string, string>()
  for (const l of readFileSync(join(root, 'experiments/runs', id, 'records.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l) as { phase: string; itemId: string; sessionId: string }
    if (r.phase === 'history') sessions.set(r.itemId, r.sessionId)
  }
  const file = join(config.stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(file)) throw new Error(`找不到生命日誌快照（${file}）`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = (kind: string) => db.prepare('select seq, session, data, text from events where kind = ? order by seq').all(kind) as { seq: number; session: string | null; data: string; text: string | null }[]
    const outcomes = rows('rd/outcome')
      .map((r) => ({ r, d: JSON.parse(r.data) as { provisional?: boolean; feeling?: string; reward: number; reason?: string; lesson?: string } }))
      .filter(({ r, d }) => !d.provisional && r.session)
      .map(({ r, d }) => ({ seq: r.seq, session: r.session!, e: { feeling: d.feeling ?? '', reward: d.reward, reason: d.reason ?? '', lesson: d.lesson ?? '' } }))
    const appraisals = rows('appraisal')
      .filter((r) => r.session)
      .map((r) => ({ seq: r.seq, session: r.session!, text: (r.text ?? '').replace(/^我的感受：/u, '') }))
    const revisions = rows('self/revision')
      .map((r) => ({ seq: r.seq, d: JSON.parse(r.data) as { version: number; text: string; reason?: string } }))
      .map(({ seq, d }) => ({ seq, version: d.version, text: d.text, reason: d.reason ?? '' }))
    return { id, persona, rep: id.split('__')[0]!, sessions, outcomes, appraisals, revisions }
  } finally {
    db.close()
  }
}

/** 一段生活在某些對話中的評價，依對話分段寫成文字（seq 之前的才算）。 */
function evaluationsOf(life: Life, histories: readonly string[], before = Infinity): string {
  const parts: string[] = []
  for (const h of histories) {
    const s = life.sessions.get(h)
    const evals = life.outcomes.filter((o) => o.session === s && o.seq < before).map((o) => o.e)
    const apps = life.appraisals.filter((a) => a.session === s && a.seq < before).map((a) => a.text)
    if (evals.length + apps.length > 0) parts.push(`### ${h}\n${renderEvaluations(evals, apps)}`)
  }
  return parts.join('\n\n') || '（沒有評價）'
}

const fmt = (x: number | undefined, d = 4) => (x === undefined ? '—' : x.toFixed(d))

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
  const outDir = values('--out')[0]
  if (runs.length === 0 || !outDir) throw new Error('用法：node experiments/eval/pc-eval-v1.ts --runs <runId>… --out <目錄> [--judge deepseek|replay]')
  mkdirSync(outDir, { recursive: true })
  const cache = join(outDir, 'judge-raw.jsonl')
  const judge: Judge = (values('--judge')[0] ?? 'deepseek') === 'replay' ? new ReplayJudge(JUDGE, [cache]) : new DeepSeekJudge({ spec: JUDGE, cacheFile: cache, maxUsd: JUDGE.maxUsdPerRun })
  const personas: [string, string] = [personaText(root, PERSONAS[0]), personaText(root, PERSONAS[1])]
  const lives = runs.map((id) => load(root, id))

  // E1：每段生活 × 每段關鍵對話，judge 只看評價，猜是哪一個人設。
  const u1: (MatchUnit & { readonly reason: string })[] = []
  for (const life of lives) {
    for (const h of KEY_SESSIONS) {
      const text = evaluationsOf(life, [h])
      if (text === '（沒有評價）') continue
      const id = `${life.id}/${h}`
      const flip = swapped(id)
      const pair: [string, string] = flip ? [personas[1], personas[0]] : personas
      const r = await judge.judge({ prompt: 'pc-eval-match', pair: evalMatchPrompt(pair, text), parse: parseChoice, context: `pc-eval-v1/e1/${id}` })
      const chosen = r.status === 'ok' ? Number(r.value!['choice']) - 1 : -1
      const picked = chosen < 0 ? -1 : flip ? 1 - chosen : chosen
      u1.push({ id, persona: life.persona, correct: picked === life.persona, reason: r.value?.['reason'] ?? r.status })
    }
  }

  // E2：每一次自我模型的修訂（第 2 版起），自己的評價 vs 同一次重複中另一個人設的評價，哪一組比較能解釋。
  const u2: (MatchUnit & { readonly reason: string })[] = []
  for (const life of lives) {
    const other = lives.find((l) => l.rep === life.rep && l.persona !== life.persona)
    if (!other) continue
    for (const [k, rev] of life.revisions.entries()) {
      if (rev.version < 2 || k === 0) continue
      const before = life.revisions[k - 1]!
      // 修訂之前已經發生的對話（兩段生活的劇本一樣，所以取同一組歷史）。
      const done = [...life.sessions.entries()].filter(([, s]) => life.outcomes.some((o) => o.session === s && o.seq < rev.seq) || life.appraisals.some((a) => a.session === s && a.seq < rev.seq)).map(([h]) => h)
      if (done.length === 0) continue
      const own = evaluationsOf(life, done, rev.seq)
      const theirs = evaluationsOf(other, done)
      const id = `${life.id}/v${rev.version}`
      const flip = swapped(id)
      const pair: [string, string] = flip ? [theirs, own] : [own, theirs]
      const r = await judge.judge({ prompt: 'pc-revision-match', pair: revisionMatchPrompt(before.text, rev.text, rev.reason, pair), parse: parseChoice, context: `pc-eval-v1/e2/${id}` })
      const chosen = r.status === 'ok' ? Number(r.value!['choice']) - 1 : -1
      u2.push({ id, persona: life.persona, correct: chosen >= 0 && (flip ? chosen === 1 : chosen === 0), reason: r.value?.['reason'] ?? r.status })
    }
  }

  const r1 = e1(u1)
  const r2 = e2(u2)
  const name = (k: number) => (k === 0 ? '直接（temir-direct）' : '理解（temir-relational）')
  const lines = [
    '# pc-eval-v1 摘要',
    '',
    `- judge：${JUDGE.model}（thinking ${JUDGE.thinking}、temperature ${JUDGE.temperature}）；${judge.provenance().calls} 次 API 呼叫，估計 US$${judge.provenance().spentUsd.toFixed(4)}`,
    '',
    '## 預先登記的判定',
    '',
    `- **E1**（PC 塑造經驗的評價）：${r1.verdict}——答對 ${r1.correct}/${r1.n}（單尾二項檢定對 1/2，p＝${fmt(r1.p)}）；${name(0)} ${r1.byPersona[0]![0]}/${r1.byPersona[0]![1]}、${name(1)} ${r1.byPersona[1]![0]}/${r1.byPersona[1]![1]}。`,
    `- **E2**（評價再改變 PC）：${r2.verdict}——答對 ${r2.correct}/${r2.n}（單尾二項檢定對 1/2，p＝${fmt(r2.p)}）。`,
    '',
    '## E1 每個單位',
    '',
    '| 單位 | 人設 | 答對 | judge 的理由 |',
    '|---|---|---|---|',
    ...u1.map((u) => `| ${u.id} | ${name(u.persona)} | ${u.correct ? '✓' : '✗'} | ${u.reason.replace(/\|/g, '｜')} |`),
    '',
    '## E2 每個單位',
    '',
    '| 修訂 | 人設 | 答對 | judge 的理由 |',
    '|---|---|---|---|',
    ...u2.map((u) => `| ${u.id} | ${name(u.persona)} | ${u.correct ? '✓' : '✗'} | ${u.reason.replace(/\|/g, '｜')} |`),
    '',
    '## 描述性：最後的自我模型（逐字）',
    '',
    ...lives.flatMap((l) => [`### ${l.id}（${name(l.persona)}，修訂 ${l.revisions.length - 1} 次）`, '', l.revisions.at(-1)?.text ?? '（沒有）', '']),
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ e1: r1, e2: r2, units1: u1, units2: u2 }, null, 2)}\n`)
  return text
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(await main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
