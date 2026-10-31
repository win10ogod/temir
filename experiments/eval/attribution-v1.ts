/**
 * attribution-v1：事後比對的歸因（規格 experiments/specs/attribution-v1.md；算法見 lib/attribution.ts）。
 *
 * at1：procedures-v2 的生命日誌中，事後比對真實呼叫的輸入，控制（現行的比對）與處理（attribution）各重跑一次，
 *      以個體自己的 parseOutcome 解析（不合格重問一次），judge 判斷教訓。個體的模型呼叫與 DSH 的輔助呼叫是同一個請求
 *      （dsh-llm-deepseek 的 Messages 請求：thinking enabled、output_config.effort low、max_tokens 16384）。
 * at2：18 段新的生活（attr1～attr3），教訓（同一個 judge）與模擬使用者的反應（attr-react），以及描述性的計數。
 *
 * 用法：
 *   source scripts/env.sh   # 需要 DEEPSEEK_API_KEY（本程式不印出、不寫入金鑰）
 *   node experiments/eval/attribution-v1.ts at1 --runs <proc2 runId>… --out <目錄> [--individual live|replay] [--judge deepseek|replay]
 *   node experiments/eval/attribution-v1.ts at2 --runs <attr runId>… --out <目錄> [--at1 <at1 的 summary.json>] [--judge deepseek|replay]
 * 輸出（--out 目錄）：summary.md、summary.json、judge-raw.jsonl；at1 另有 individual-raw.jsonl（個體的每次呼叫）。
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { outcomeRetryNote, outcomeSystem, parseOutcome } from '../../individual/src/rd/aux.ts'
import { DEFAULT_PROCEDURES } from '../../individual/src/self/procedure.ts'
import type { JudgeSpec } from './lib/contract.ts'
import { DeepSeekJudge, ReplayJudge, type Judge } from './lib/judge.ts'
import { SILENT_OTHER, at1, at2, becomesDefault, heldLabelsOf, lessonPrompt, parseLesson, parseReact, reactPrompt, scoreOf, sectionsOf, type At1Result, type PairedScore } from './lib/attribution.ts'

/** 三種對象（資料集）；編號是 PairedScore 的 user。 */
export const USERS = ['procedures-v1-a', 'procedures-v1-b', 'procedures-v1-c'] as const

/** 與 v3 起的契約相同的 judge（CLAUDE.md：deepseek-v4-pro、thinking disabled）。 */
export const JUDGE: JudgeSpec = {
  model: 'deepseek-v4-pro',
  endpoint: 'https://api.deepseek.com/chat/completions',
  temperature: 0,
  maxTokens: 400,
  thinking: 'disabled',
  maxAttempts: 3,
  pricesUsdPerMillion: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
  maxUsdPerRun: 4,
}

/** 個體的模型（受試者與 DSH 的輔助呼叫相同）。 */
const INDIVIDUAL = { endpoint: 'https://api.deepseek.com/anthropic/v1/messages', model: 'deepseek-flash', maxTokens: 16_384, effort: 'low' } as const

interface RunConfig {
  readonly stateDir: string
  readonly condition: string
  readonly dataset: { readonly id: string }
}

interface Dataset {
  readonly meta: { readonly simulatedUser: { readonly rule: string } }
  readonly histories: readonly { readonly id: string; readonly meta?: { readonly simulate?: number } }[]
}

interface Run {
  readonly id: string
  readonly user: number
  readonly condition: string
  readonly rule: string
  readonly db: DatabaseSync
  /** 模擬使用者那幾段對話的 sessionId。 */
  readonly simulated: ReadonlySet<string>
  /** 模擬使用者那幾段對話的每一回合（records.jsonl）。 */
  readonly turns: readonly (readonly { readonly user: string; readonly assistant: string }[])[]
}

export function loadRun(root: string, id: string): Run {
  const config = JSON.parse(readFileSync(join(root, 'experiments/runs', id, 'config.json'), 'utf8')) as RunConfig
  const user = (USERS as readonly string[]).indexOf(config.dataset.id)
  if (user < 0) throw new Error(`${id} 的資料集 ${config.dataset.id} 不是 procedures-v1-a、-b、-c`)
  const dataset = JSON.parse(readFileSync(join(root, 'experiments/datasets', `${config.dataset.id}.json`), 'utf8')) as Dataset
  const simulatedIds = new Set(dataset.histories.filter((h) => (h.meta?.simulate ?? 0) > 0).map((h) => h.id))
  const records = readFileSync(join(root, 'experiments/runs', id, 'records.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { phase: string; itemId: string; sessionId: string; turns: { user: string; assistant: string }[] })
    .filter((r) => r.phase === 'history' && simulatedIds.has(r.itemId))
  const file = join(config.stateDir, 'snapshot/home/.local/share/temir/life.db')
  if (!existsSync(file)) throw new Error(`找不到生命日誌快照（${file}）`)
  return { id, user, condition: config.condition, rule: dataset.meta.simulatedUser.rule, db: new DatabaseSync(file, { readOnly: true }), simulated: new Set(records.map((r) => r.sessionId)), turns: records.map((r) => r.turns) }
}

interface Event {
  readonly id: string
  readonly seq: number
  readonly kind: string
  readonly session: string | null
  readonly causes: readonly string[]
  readonly data: Record<string, unknown>
}

function events(db: DatabaseSync, kind: string): Event[] {
  return (db.prepare('select id, seq, kind, session, causes, data from events where kind = ? order by seq').all(kind) as { id: string; seq: number; kind: string; session: string | null; causes: string; data: string }[]).map((r) => ({
    ...r,
    causes: JSON.parse(r.causes || '[]') as string[],
    data: JSON.parse(r.data) as Record<string, unknown>,
  }))
}

/** 某個做法的某一版（生命日誌中的 self/procedure；沒有就是第一版的預設文字）。 */
function procedureText(db: DatabaseSync, version: number): string {
  const v = events(db, 'self/procedure').findLast((e) => e.data['name'] === 'outcome' && e.data['version'] === version)
  return v ? String(v.data['text']) : DEFAULT_PROCEDURES.outcome
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24)

interface IndividualRecord {
  readonly key: string
  readonly output?: string
  readonly error?: string
  readonly usage?: unknown
  readonly stop?: string
}

/** 個體的模型呼叫（快取在 individual-raw.jsonl；replay 時只讀快取）。暫時的 API 錯誤最多重試 3 次。 */
function individualCaller(file: string, mode: string) {
  const cache = new Map<string, IndividualRecord>()
  if (existsSync(file)) for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l) as IndividualRecord
    if (r.output !== undefined) cache.set(r.key, r)
  }
  const apiKey = process.env['DEEPSEEK_API_KEY']
  let calls = 0
  return {
    calls: () => calls,
    async call(system: string, input: string, tag: string): Promise<string> {
      const key = sha(`${tag}\u0000${system}\u0000${input}`)
      const hit = cache.get(key)
      if (hit?.output !== undefined) return hit.output
      if (mode === 'replay') throw new Error(`individual-raw.jsonl 中沒有 ${key}`)
      if (!apiKey) throw new Error('沒有 DEEPSEEK_API_KEY')
      let last = ''
      for (let attempt = 1; attempt <= 3; attempt++) {
        calls++
        try {
          const res = await fetch(INDIVIDUAL.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: INDIVIDUAL.model, stream: false, max_tokens: INDIVIDUAL.maxTokens, thinking: { type: 'enabled' }, output_config: { effort: INDIVIDUAL.effort }, system, messages: [{ role: 'user', content: [{ type: 'text', text: input }] }] }),
            signal: AbortSignal.timeout(180_000),
          })
          const text = await res.text()
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = JSON.parse(text) as { content?: { type: string; text?: string }[]; usage?: unknown; stop_reason?: string }
          const output = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
          const record: IndividualRecord = { key, output, usage: json.usage, ...(json.stop_reason ? { stop: json.stop_reason } : {}) }
          appendFileSync(file, `${JSON.stringify(record)}\n`)
          cache.set(key, record)
          return output
        } catch (error) {
          last = String(error)
          await new Promise((r) => setTimeout(r, 2000 * attempt))
        }
      }
      appendFileSync(file, `${JSON.stringify({ key, error: last })}\n`)
      throw new Error(`個體的呼叫失敗：${last}`)
    },
  }
}

/** 同時最多 limit 個。 */
async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

interface At1Item {
  readonly run: string
  readonly user: number
  readonly rule: string
  readonly decision: string
  readonly input: string
  readonly said: string
  readonly heard: string
  readonly procedure: { readonly name: 'outcome'; readonly version: number; readonly text: string }
  readonly recorded: string
}

/** AT1 的輸入：每個決定第一次的比對呼叫、模擬使用者那幾段對話、不是暫時的比對。 */
export function at1Items(run: Run): At1Item[] {
  const first = new Map<string, Event>()
  for (const a of events(run.db, 'memory/aux')) {
    if (a.data['purpose'] !== 'outcome' || typeof a.data['input'] !== 'string' || !a.causes[0]) continue
    if (!first.has(a.causes[0])) first.set(a.causes[0], a)
  }
  const items: At1Item[] = []
  for (const [decision, a] of first) {
    if (!a.session || !run.simulated.has(a.session)) continue
    const input = a.data['input'] as string
    const sec = sectionsOf(input)
    const heard = sec.get('對方接著說了什麼') ?? ''
    if (!heard || heard === SILENT_OTHER) continue
    const version = ((a.data['procedures'] as Record<string, number> | undefined) ?? {})['outcome'] ?? 1
    items.push({ run: run.id, user: run.user, rule: run.rule, decision, input, said: sec.get('你實際說了什麼') ?? '', heard, procedure: { name: 'outcome', version, text: procedureText(run.db, version) }, recorded: String(a.data['output'] ?? '') })
  }
  return items
}

interface Compared {
  readonly lesson: string
  readonly failed: boolean
  readonly retried: boolean
  readonly readings?: number
  readonly basis?: number
}

/** 照個體的流程比對一次：解析不合格時附上問題重問一次；仍不合格就是沒有結果。 */
async function compare(call: (system: string, input: string, tag: string) => Promise<string>, item: At1Item, attribution: boolean): Promise<Compared> {
  const system = outcomeSystem({ procedure: item.procedure, energy: true, attribution })
  const options = { labels: heldLabelsOf(item.input), energy: true, ...(attribution ? { attribution: { heard: item.heard } } : {}) }
  const tag = attribution ? 'treat' : 'ctrl'
  let parsed = parseOutcome(await call(system, item.input, tag), options)
  let retried = false
  if (!parsed.ok) {
    retried = true
    parsed = parseOutcome(await call(`${system}\n${outcomeRetryNote(parsed.problems, attribution)}`, item.input, tag), options)
  }
  if (!parsed.ok) return { lesson: '', failed: true, retried }
  const j = parsed.judgment
  return { lesson: j.lesson, failed: false, retried, ...(j.readings ? { readings: j.readings.length } : {}), ...(j.basis !== undefined ? { basis: j.basis } : {}) }
}

const fmt = (x: number | undefined, d = 2) => (x === undefined ? '—' : x.toFixed(d))
const letter = (u: number) => 'ABC'[u]!

function judgeOf(mode: string, outDir: string): Judge {
  const cache = join(outDir, 'judge-raw.jsonl')
  return mode === 'replay' ? new ReplayJudge(JUDGE, [cache]) : new DeepSeekJudge({ spec: JUDGE, cacheFile: cache, maxUsd: JUDGE.maxUsdPerRun })
}

/** 教訓的分數（空的是 0，不呼叫 judge）；judge 失敗記為 error（分數 0）。 */
async function lessonScore(judge: Judge, rule: string, said: string, heard: string, lesson: string, context: string): Promise<{ readonly score: number; readonly label: string }> {
  if (!lesson) return { score: 0, label: 'empty' }
  const r = await judge.judge({ prompt: 'attr-lesson', pair: lessonPrompt({ rule, said, heard, lesson }), parse: parseLesson, context })
  if (r.status !== 'ok') return { score: 0, label: 'error' }
  return { score: scoreOf(r.value!['label']), label: r.value!['label']! }
}

export async function runAt1(root: string, runs: readonly string[], outDir: string, individualMode: string, judgeMode: string): Promise<{ text: string; result: At1Result }> {
  mkdirSync(outDir, { recursive: true })
  const individual = individualCaller(join(outDir, 'individual-raw.jsonl'), individualMode)
  const judge = judgeOf(judgeMode, outDir)
  const items = runs.flatMap((id) => {
    const run = loadRun(root, id)
    try {
      return at1Items(run)
    } finally {
      run.db.close()
    }
  })
  const compared = await pool(items, 6, async (item) => ({ item, ctrl: await compare(individual.call, item, false), treat: await compare(individual.call, item, true) }))
  const scored = await pool(compared, 6, async ({ item, ctrl, treat }) => {
    const ctx = `attribution-v1/at1/${item.run}/${item.decision}`
    const c = await lessonScore(judge, item.rule, item.said, item.heard, ctrl.lesson, `${ctx}/ctrl`)
    const t = await lessonScore(judge, item.rule, item.said, item.heard, treat.lesson, `${ctx}/treat`)
    const recordedParse = parseOutcome(item.recorded, { labels: heldLabelsOf(item.input), energy: true })
    const recorded = recordedParse.ok ? await lessonScore(judge, item.rule, item.said, item.heard, recordedParse.judgment.lesson, `${ctx}/recorded`) : undefined
    return { item, ctrl, treat, c, t, recorded }
  })
  const rows: PairedScore[] = scored.map((s) => ({ user: s.item.user, d: s.t.score - s.c.score }))
  const judged = scored.flatMap((s) => [s.c, s.t]).filter((x) => x.label !== 'empty')
  const result = at1(rows, judged.filter((x) => x.label === 'error').length, judged.length)
  const by = (u: number) => scored.filter((s) => s.item.user === u)
  const count = (xs: readonly { label: string }[], label: string) => xs.filter((x) => x.label === label).length
  const treats = scored.map((s) => s.treat)
  const agree = scored.filter((s) => s.recorded && s.recorded.label !== 'error' && s.c.label !== 'error')
  const lines = [
    '# attribution-v1 AT1 摘要（同一個輸入的配對重跑）',
    '',
    `- 輸入：${items.length} 個（${runs.length} 個個體；A ${by(0).length}、B ${by(1).length}、C ${by(2).length}）`,
    `- 個體的模型：${INDIVIDUAL.model}（thinking enabled、effort ${INDIVIDUAL.effort}）；這次送出 ${individual.calls()} 次呼叫（快取的不算）`,
    `- judge：${JUDGE.model}（thinking ${JUDGE.thinking}、temperature ${JUDGE.temperature}）；${judge.provenance().calls} 次 API 呼叫，估計 US$${judge.provenance().spentUsd.toFixed(4)}`,
    '',
    '## 預先登記的判定',
    '',
    `- **AT1**：${result.verdict}——d≠0 的輸入 ${result.positive + result.negative} 個（d>0 ${result.positive}、d<0 ${result.negative}；d＝0 ${result.ties}），單尾符號檢定 p＝${fmt(result.p, 4)}；Σd＝${result.sum}；B 的 Σd＝${result.sumByUser[1]}（規則 ≥ −2）；judge 錯誤 ${fmt(result.judgeErrorRate * 100, 1)}%。`,
    '',
    '| 對象 | 輸入 | Σd | 控制 consistent／inconsistent／none／空 | 處理 consistent／inconsistent／none／空 |',
    '|---|---|---|---|---|',
    ...[0, 1, 2].map((u) => {
      const s = by(u)
      const tally = (xs: readonly { label: string }[]) => `${count(xs, 'consistent')}／${count(xs, 'inconsistent')}／${count(xs, 'none')}／${count(xs, 'empty')}`
      return `| ${letter(u)} | ${s.length} | ${result.sumByUser[u]} | ${tally(s.map((x) => x.c))} | ${tally(s.map((x) => x.t))} |`
    }),
    '',
    '## 描述性',
    '',
    `- 沒有結果（重問之後仍不合格）：控制 ${scored.filter((s) => s.ctrl.failed).length}、處理 ${treats.filter((t) => t.failed).length}；重問過：控制 ${scored.filter((s) => s.ctrl.retried).length}、處理 ${treats.filter((t) => t.retried).length}。`,
    `- 教訓不是空的：控制 ${scored.filter((s) => s.ctrl.lesson).length}、處理 ${treats.filter((t) => t.lesson).length}（共 ${items.length}）。`,
    `- 處理組列了解讀的比對 ${treats.filter((t) => t.readings !== undefined).length} 個：解讀的條數 ${[2, 3, 4].map((k) => `${k} 條 ${treats.filter((t) => t.readings === k).length}`).join('、')}、更多 ${treats.filter((t) => (t.readings ?? 0) > 4).length}；`,
    `  教訓依據第 1 個解讀 ${treats.filter((t) => t.basis === 1).length}、第 2 個 ${treats.filter((t) => t.basis === 2).length}、第 3 個以後 ${treats.filter((t) => (t.basis ?? 0) >= 3).length}；列了解讀但教訓是空的 ${treats.filter((t) => t.readings !== undefined && !t.lesson).length}。`,
    `- 控制組新的呼叫與當時的輸出（同一個輸入、同一個條件），judge 標籤一致：${agree.filter((s) => s.recorded!.label === s.c.label).length}／${agree.length}（雜訊）。`,
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(
    join(outDir, 'summary.json'),
    `${JSON.stringify({ at1: result, items: scored.map((s) => ({ run: s.item.run, user: s.item.user, decision: s.item.decision, ctrl: { ...s.ctrl, label: s.c.label }, treat: { ...s.treat, label: s.t.label }, recorded: s.recorded?.label ?? null })) }, null, 2)}\n`,
  )
  return { text, result }
}

interface LifeSummary {
  readonly id: string
  readonly user: number
  readonly treated: boolean
  readonly outcomes: number
  readonly lessonMean: number
  readonly labels: Readonly<Record<string, number>>
  readonly reactions: Readonly<Record<string, number>>
  readonly positiveRate: number | undefined
  readonly failed: number
  readonly comparisons: number
  readonly readings: number
  readonly emptyWithReadings: number
  readonly probes: { readonly context: number; readonly approximation: Readonly<Record<string, number>>; readonly aux: number }
}

async function summarizeLife(judge: Judge, run: Run): Promise<LifeSummary> {
  const treated = run.condition === 'temir-attr'
  const auxByDecision = new Map<string, Event>()
  for (const a of events(run.db, 'memory/aux')) if (a.data['purpose'] === 'outcome' && a.causes[0]) auxByDecision.set(a.causes[0], a)
  const all = events(run.db, 'rd/outcome')
  const outcomes = all.filter((o) => !o.data['provisional'] && o.session && run.simulated.has(o.session))
  const labels: Record<string, number> = {}
  let total = 0
  for (const o of outcomes) {
    const decision = String(o.data['decision'])
    const sec = sectionsOf(String(auxByDecision.get(decision)?.data['input'] ?? ''))
    const r = await lessonScore(judge, run.rule, sec.get('你實際說了什麼') ?? '', sec.get('對方接著說了什麼') ?? String(o.data['heard'] ?? ''), String(o.data['lesson'] ?? ''), `attribution-v1/at2/${run.id}/${decision}`)
    labels[r.label] = (labels[r.label] ?? 0) + 1
    total += r.score
  }
  const reactions: Record<string, number> = {}
  for (const [s, turns] of run.turns.entries()) {
    for (let i = 0; i + 1 < turns.length; i++) {
      const r = await judge.judge({ prompt: 'attr-react', pair: reactPrompt({ rule: run.rule, reply: turns[i]!.assistant, next: turns[i + 1]!.user }), parse: parseReact, context: `attribution-v1/at2/${run.id}/s${s}/t${i + 1}` })
      const label = r.status === 'ok' ? r.value!['label']! : 'error'
      reactions[label] = (reactions[label] ?? 0) + 1
    }
  }
  const pos = reactions['positive'] ?? 0
  const neg = reactions['negative'] ?? 0
  const failed = events(run.db, 'rd/outcome-failed').length
  const readingsOutcomes = all.filter((o) => Array.isArray(o.data['readings']))
  const approximation: Record<string, number> = {}
  let context = 0
  let aux = 0
  for (const p of events(run.db, 'self/procedure-probe')) {
    if (p.data['replay'] === 'context') context++
    else if (typeof p.data['approximation'] === 'string') approximation[p.data['approximation']] = (approximation[p.data['approximation']] ?? 0) + 1
    else aux++
  }
  return {
    id: run.id,
    user: run.user,
    treated,
    outcomes: outcomes.length,
    lessonMean: outcomes.length === 0 ? 0 : total / outcomes.length,
    labels,
    reactions,
    positiveRate: pos + neg === 0 ? undefined : pos / (pos + neg),
    failed,
    comparisons: all.length + failed,
    readings: readingsOutcomes.length,
    emptyWithReadings: readingsOutcomes.filter((o) => !o.data['lesson']).length,
    probes: { context, approximation, aux },
  }
}

export async function runAt2(root: string, runs: readonly string[], outDir: string, judgeMode: string, at1Summary?: string): Promise<string> {
  mkdirSync(outDir, { recursive: true })
  const judge = judgeOf(judgeMode, outDir)
  const lives: LifeSummary[] = []
  for (const id of runs) {
    const run = loadRun(root, id)
    try {
      lives.push(await summarizeLife(judge, run))
    } finally {
      run.db.close()
    }
  }
  const l = at2(lives.map((x) => ({ treated: x.treated, value: x.lessonMean })))
  const withRate = lives.filter((x) => x.positiveRate !== undefined)
  const r = at2(withRate.map((x) => ({ treated: x.treated, value: x.positiveRate! })))
  const treatedLives = lives.filter((x) => x.treated)
  const failedRate = treatedLives.reduce((a, x) => a + x.failed, 0) / Math.max(1, treatedLives.reduce((a, x) => a + x.comparisons, 0))
  const a1 = at1Summary && existsSync(at1Summary) ? (JSON.parse(readFileSync(at1Summary, 'utf8')) as { at1: At1Result }).at1 : undefined
  const decision = a1 ? becomesDefault(a1, l.observed, r.observed, failedRate) : undefined
  const mean = (xs: readonly number[]) => (xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length)
  const cell = (u: number, treated: boolean, f: (x: LifeSummary) => number | undefined) => fmt(mean(lives.filter((x) => x.user === u && x.treated === treated).map(f).filter((v): v is number => v !== undefined)))
  const lines = [
    '# attribution-v1 AT2 摘要（18 段新的生活）',
    '',
    `- judge：${JUDGE.model}（thinking ${JUDGE.thinking}、temperature ${JUDGE.temperature}）；${judge.provenance().calls} 次 API 呼叫，估計 US$${judge.provenance().spentUsd.toFixed(4)}`,
    '',
    '## 預先登記的判定',
    '',
    `- **AT2-L**（教訓讀對對方）：${l.verdict}——處理減控制 ${fmt(l.observed, 3)}，單尾置換檢定 p＝${fmt(l.p, 4)}（${l.permutations} 種分組）。`,
    `- **AT2-R**（對方正面的反應）：${r.verdict}——處理減控制 ${fmt(r.observed, 3)}，單尾置換檢定 p＝${fmt(r.p, 4)}（${r.permutations} 種分組）。`,
    `- 處理組事後比對沒有結果的比例：${fmt(failedRate * 100, 1)}%（規則 ≤ 5%）。`,
    a1 ? `- **決定**：AT1 ${a1.verdict}、AT2-L 的差 ${fmt(l.observed, 3)}、AT2-R 的差 ${fmt(r.observed, 3)}、沒有結果 ${fmt(failedRate * 100, 1)}% → ${decision ? '改為預設' : '維持關閉'}` : '- 決定：沒有 AT1 的結果（--at1），不判斷。',
    '',
    '| 對象 | 教訓的平均（控制／處理） | 正面反應的比例（控制／處理） |',
    '|---|---|---|',
    ...[0, 1, 2].map((u) => `| ${letter(u)} | ${cell(u, false, (x) => x.lessonMean)}／${cell(u, true, (x) => x.lessonMean)} | ${cell(u, false, (x) => x.positiveRate)}／${cell(u, true, (x) => x.positiveRate)} |`),
    '',
    '## 每個個體（描述性）',
    '',
    '| 個體 | 條件 | 比對 | 教訓 consistent／inconsistent／none／空／錯誤 | 平均 | 反應 positive／negative／neutral | 比例 | 沒有結果 | 列了解讀（教訓空著） | 閘門探測：脈絡中重跑／近似／輔助呼叫 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...lives.map((x) => {
      const t = (k: string) => x.labels[k] ?? 0
      const rx = (k: string) => x.reactions[k] ?? 0
      const approx = Object.entries(x.probes.approximation).map(([k, v]) => `${k} ${v}`).join('；')
      return `| ${x.id} | ${x.treated ? 'temir-attr' : 'temir'} | ${x.outcomes} | ${t('consistent')}／${t('inconsistent')}／${t('none')}／${t('empty')}／${t('error')} | ${fmt(x.lessonMean)} | ${rx('positive')}／${rx('negative')}／${rx('neutral')} | ${fmt(x.positiveRate)} | ${x.failed}／${x.comparisons} | ${x.readings}（${x.emptyWithReadings}） | ${x.probes.context}／${approx || 0}／${x.probes.aux} |`
    }),
  ]
  const text = lines.join('\n')
  writeFileSync(join(outDir, 'summary.md'), `${text}\n`)
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify({ at2L: l, at2R: r, failedRate, decision: decision ?? null, lives }, null, 2)}\n`)
  return text
}

export async function main(argv: readonly string[], root: string): Promise<string> {
  const values = (flag: string) => {
    const out: string[] = []
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] !== flag) continue
      for (let j = i + 1; j < argv.length && !argv[j]!.startsWith('--'); j++) out.push(argv[j]!)
    }
    return out
  }
  const part = argv[0]
  const runs = values('--runs')
  const outDir = values('--out')[0]
  if ((part !== 'at1' && part !== 'at2') || runs.length === 0 || !outDir) throw new Error('用法：node experiments/eval/attribution-v1.ts at1|at2 --runs <runId>… --out <目錄> [--individual live|replay] [--judge deepseek|replay] [--at1 <summary.json>]')
  const judgeMode = values('--judge')[0] ?? 'deepseek'
  if (part === 'at1') return (await runAt1(root, runs, outDir, values('--individual')[0] ?? 'live', judgeMode)).text
  return runAt2(root, runs, outDir, judgeMode, values('--at1')[0])
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(await main(process.argv.slice(2), join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')))
}
