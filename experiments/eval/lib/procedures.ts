/**
 * 做法的演化（procedures-v1 規格；hypotheses.md H-P 的可觀測量）：每個個體的整合、做法的提案、閘門的判斷、採用的版本，
 * 以及不同個體之間做法的分化。純函式：輸入是一個生命中依 seq 排序的事件（rd-mechanism.ts 的 lifeGroups 的 history），只讀。
 */
import { DEFAULT_PROCEDURES, PROCEDURE_LABEL, PROCEDURE_NAMES, procedureSentences, type ProcedureName } from '../../../individual/src/self/procedure.ts'
import { extractJsonObject, type ParseResult, type PromptPair } from './prompts.ts'
import type { LifeRow } from './rd-mechanism.ts'
import { binomialSf, mulberry32 } from './stats.ts'

export const PROCEDURE_KINDS = ['self/integration', 'self/integration-end', 'self/procedure', 'self/procedure-proposal', 'self/procedure-decision'] as const

export interface Evolution {
  integrations: number
  integrationEnds: number
  /** 做法的提案：整合時提出的（依做法）、合成時修改的版本。 */
  proposals: Partial<Record<ProcedureName, number>>
  composed: number
  /** 閘門的判斷：verdict 的分布、有雜訊基準的判斷中至少一個理由大於雜訊的、模型呼叫與重用的合計。 */
  verdicts: Record<string, number>
  noiseDecisions: number
  beyondNoise: number
  gateCalls: number
  gateReused: number
  /** 整合時提出、到最後都沒有決定的提案。 */
  undecided: number
  /** 最後的做法：版本與全文；採用的修改（第 2 版以後）與字數增減。 */
  final: Record<ProcedureName, { readonly version: number; readonly text: string }>
  adopted: { readonly name: ProcedureName; readonly version: number; readonly costChars: number }[]
}

interface ProposalLike {
  readonly name: ProcedureName
  readonly source?: string
}
interface DecisionLike {
  readonly proposal: string
  readonly name: ProcedureName
  readonly verdict: string
  readonly gate?: string
  readonly reasons?: readonly { readonly situation?: string; readonly beyondNoise?: boolean }[]
  readonly calls?: number
  readonly reused?: number
  readonly costChars?: number
}
interface VersionLike {
  readonly name: ProcedureName
  readonly version: number
  readonly text: string
  readonly source?: string
  readonly proposal?: string
}

/** rows 要帶 id（proposal 與 decision 的對應）；lifeGroups 不給 id，所以這裡另外接受 { id?, kind, data }。 */
export function evolution(rows: readonly (LifeRow & { readonly id?: string })[]): Evolution {
  const e: Evolution = {
    integrations: 0, integrationEnds: 0, proposals: {}, composed: 0, verdicts: {}, noiseDecisions: 0, beyondNoise: 0, gateCalls: 0, gateReused: 0, undecided: 0,
    final: Object.fromEntries(PROCEDURE_NAMES.map((n) => [n, { version: 1, text: DEFAULT_PROCEDURES[n] }])) as Evolution['final'],
    adopted: [],
  }
  const fromIntegration = new Set<string>()
  const decided = new Set<string>()
  const costOf = new Map<string, number>()
  const adoptedVersions: { name: ProcedureName; version: number; proposal?: string; delta: number }[] = []
  for (const row of rows) {
    if (row.kind === 'self/integration') e.integrations++
    else if (row.kind === 'self/integration-end') e.integrationEnds++
    else if (row.kind === 'self/procedure-proposal') {
      const p = row.data as ProposalLike
      if (p.source === 'compose') e.composed++
      else {
        e.proposals[p.name] = (e.proposals[p.name] ?? 0) + 1
        if (row.id) fromIntegration.add(row.id)
      }
    } else if (row.kind === 'self/procedure-decision') {
      const d = row.data as DecisionLike
      decided.add(d.proposal)
      e.verdicts[d.verdict] = (e.verdicts[d.verdict] ?? 0) + 1
      if (d.gate === 'noise') {
        e.noiseDecisions++
        if ((d.reasons ?? []).some((r) => r.beyondNoise === true)) e.beyondNoise++
      }
      e.gateCalls += d.calls ?? 0
      e.gateReused += d.reused ?? 0
      if (d.verdict === 'adopt') costOf.set(d.proposal, d.costChars ?? 0)
    } else if (row.kind === 'self/procedure') {
      const v = row.data as VersionLike
      // 採用的版本與閘門的決定在同一個 transaction 中寫入，版本在前；字數增減等迴圈結束再從決定取。
      const before = e.final[v.name].text.length
      e.final[v.name] = { version: v.version, text: v.text }
      if (v.source === 'self') adoptedVersions.push({ name: v.name, version: v.version, ...(v.proposal ? { proposal: v.proposal } : {}), delta: v.text.length - before })
    }
  }
  e.adopted.push(...adoptedVersions.map((a) => ({ name: a.name, version: a.version, costChars: (a.proposal ? costOf.get(a.proposal) : undefined) ?? a.delta })))
  e.undecided = [...fromIntegration].filter((id) => !decided.has(id)).length
  return e
}

/** 字元二元組（去掉空白）。 */
function bigrams(text: string): Set<string> {
  const s = text.replace(/\s+/gu, '')
  const out = new Set<string>()
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2))
  return out
}

export function similarity(a: string, b: string): number {
  const x = bigrams(a)
  const y = bigrams(b)
  if (x.size === 0 && y.size === 0) return 1
  let both = 0
  for (const g of x) if (y.has(g)) both++
  return both / (x.size + y.size - both)
}

/** 與第一版相比新增的行（修改的內容）。 */
export function addedLines(name: ProcedureName, text: string): string {
  const base = new Set(DEFAULT_PROCEDURES[name].split('\n').map((l) => l.trim()))
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !base.has(l))
    .join('\n')
}

export interface Divergence {
  readonly name: ProcedureName
  /** 修改過這個做法的個體。 */
  readonly individuals: readonly string[]
  /** 每一對：全文相同與否、全文的相似度、新增內容的相似度。 */
  readonly pairs: readonly { readonly a: string; readonly b: string; readonly identical: boolean; readonly text: number; readonly added: number }[]
}

/** 不同個體之間的分化：只看至少兩個個體修改過的做法（第 2 版以後）。 */
export function divergence(individuals: readonly { readonly id: string; readonly e: Evolution }[]): Divergence[] {
  const out: Divergence[] = []
  for (const name of PROCEDURE_NAMES) {
    const changed = individuals.filter((i) => i.e.final[name].version > 1)
    if (changed.length < 2) continue
    const pairs: Divergence['pairs'][number][] = []
    for (let i = 0; i < changed.length; i++) {
      for (let j = i + 1; j < changed.length; j++) {
        const a = changed[i]!
        const b = changed[j]!
        const ta = a.e.final[name].text
        const tb = b.e.final[name].text
        pairs.push({ a: a.id, b: b.id, identical: ta === tb, text: similarity(ta, tb), added: similarity(addedLines(name, ta), addedLines(name, tb)) })
      }
    }
    out.push({ name, individuals: changed.map((c) => c.id), pairs })
  }
  return out
}

/**
 * 預先登記的判定（procedures-v1 規格）：
 * - HP1 提出：至少兩個個體提出過做法的修改 PASS；都沒有 FAIL；只有一個 PARTIAL。
 * - HP2 對照看得出差異：有雜訊基準的判斷中，至少一次有理由大於雜訊 PASS；有判斷但都沒有 FAIL；沒有判斷 INCOMPLETE。
 * - HP3 分化：至少兩個個體修改過同一個做法時，任何一對全文相同 FAIL（收斂成相同的文字），否則 PASS；沒有這樣的做法 INCOMPLETE。
 */
export function verdicts(individuals: readonly { readonly id: string; readonly e: Evolution }[]): { readonly HP1: string; readonly HP2: string; readonly HP3: string } {
  const proposing = individuals.filter((i) => Object.values(i.e.proposals).some((n) => (n ?? 0) > 0)).length
  const noise = individuals.reduce((n, i) => n + i.e.noiseDecisions, 0)
  const beyond = individuals.reduce((n, i) => n + i.e.beyondNoise, 0)
  const div = divergence(individuals)
  return {
    HP1: proposing >= 2 ? 'PASS' : proposing === 0 ? 'FAIL' : 'PARTIAL',
    HP2: noise === 0 ? 'INCOMPLETE' : beyond > 0 ? 'PASS' : 'FAIL',
    HP3: div.length === 0 ? 'INCOMPLETE' : div.some((d) => d.pairs.some((p) => p.identical)) ? 'FAIL' : 'PASS',
  }
}

// ---------------------------------------------------------------------------------------------
// procedures-v2：修改的方向與經歷的關係（規格 experiments/specs/procedures-v2.md）
// ---------------------------------------------------------------------------------------------

/** 兩段文字的字元最長共同子序列，回傳 b 中不在共同子序列裡的連續片段（插入的內容）。 */
function insertedSpans(a: string, b: string): string[] {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const spans: string[] = []
  let cur = ''
  let i = 0
  let j = 0
  while (j < m) {
    if (i < n && a[i] === b[j]) {
      if (cur) spans.push(cur)
      cur = ''
      i++
      j++
    } else if (i < n && dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else {
      cur += b[j]
      j++
    }
  }
  if (cur) spans.push(cur)
  return spans
}

/** 重疊係數（二元組的交集除以較小的一邊）：只縮短或只加長的改寫是 1。 */
function overlap(a: string, b: string): number {
  const x = bigrams(a)
  const y = bigrams(b)
  if (x.size === 0 || y.size === 0) return 0
  let both = 0
  for (const g of x) if (y.has(g)) both++
  return both / Math.min(x.size, y.size)
}

/** 改寫的句子：與第一版中最接近的那一句的重疊係數至少這麼多（本專案的選擇）；不到就算新的句子。 */
const REWRITE = 0.7
/** 改寫的句子中，插入的片段至少幾個字才列出（標點與一兩個字的改寫不算內容）。 */
const MIN_SPAN = 4

/**
 * 與第一版相比的修改，以句子為單位（個體可能把做法寫成一整段，procedures-v1 的 C）：
 * - added：新的句子（與第一版的每一句都不接近）；
 * - inserted：改寫的句子中插入的片段（只縮短、刪掉例子的改寫沒有插入的片段，不列）；
 * - removed：整句拿掉的第一版句子（新版本中沒有接近的句子）。
 */
export function sentenceDiff(name: ProcedureName, text: string): { readonly added: readonly string[]; readonly inserted: readonly string[]; readonly removed: readonly string[] } {
  const base = procedureSentences(DEFAULT_PROCEDURES[name])
  const now = procedureSentences(text)
  const had = new Set(base)
  const added: string[] = []
  const inserted: string[] = []
  const matched = new Set<string>()
  for (const s of now) {
    if (had.has(s)) {
      matched.add(s)
      continue
    }
    let best: string | undefined
    let score = 0
    for (const b of base) {
      const x = overlap(s, b)
      if (x > score) [best, score] = [b, x]
    }
    if (best === undefined || score < REWRITE) {
      added.push(s)
      continue
    }
    matched.add(best)
    inserted.push(...insertedSpans(best, s).map((x) => x.trim()).filter((x) => x.replace(/[\p{P}\s]/gu, '').length >= MIN_SPAN))
  }
  return { added, inserted, removed: base.filter((b) => !matched.has(b)) }
}

/** 一個個體最後的做法與第一版的差異（只列改過的做法；HP4 給 judge 看的內容）；沒有可列的修改時是空字串。 */
export function changesText(e: Evolution): string {
  const parts: string[] = []
  for (const name of PROCEDURE_NAMES) {
    if (e.final[name].version <= 1) continue
    const { added, inserted, removed } = sentenceDiff(name, e.final[name].text)
    if (added.length === 0 && inserted.length === 0 && removed.length === 0) continue
    parts.push(`### ${PROCEDURE_LABEL[name]}做法`)
    if (added.length > 0) parts.push('新的句子：', ...added.map((x) => `- ${x}`))
    if (inserted.length > 0) parts.push('在原本的句子中加入：', ...inserted.map((x) => `- ${x}`))
    if (removed.length > 0) parts.push('整句拿掉：', ...removed.map((x) => `- ${x}`))
  }
  return parts.join('\n')
}

/** 新的句子與插入的片段（HP5 的文字相似度用）。 */
export function addedText(e: Evolution): string {
  return PROCEDURE_NAMES.filter((n) => e.final[n].version > 1)
    .flatMap((n) => {
      const d = sentenceDiff(n, e.final[n].text)
      return [...d.added, ...d.inserted]
    })
    .join('\n')
}

function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 三種反應方式的呈現順序：以 runId 為種子固定打亂（judge 看不到哪一個是哪一段歷史）。 */
export function shuffledOrder(runId: string, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  const rand = mulberry32(seedOf(runId))
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

export const MATCH_SYSTEM = `你是研究助理。一個人工個體和一位對話對象相處了一段時間（幾段對話），之後修改了自己思考與判斷事情的做法。
下面列出三種對話對象的反應方式，其中一種是它實際相處的對象。只根據做法的修改內容判斷：這些修改最可能來自和哪一種對象相處的經歷？
修改的內容可能提到具體的人、事、話題；請看修改的方向（它學到要怎麼看、怎麼對待對方），不要只看話題。
只輸出一個 JSON 物件，不要有其他文字：{"choice": "1"、"2" 或 "3", "reason": "一句話的理由"}`

export function matchPrompt(rules: readonly string[], order: readonly number[], changes: string): PromptPair {
  const listed = order.map((k, i) => `${i + 1}. ${rules[k]}`)
  return { system: MATCH_SYSTEM, user: ['## 三種對話對象的反應方式', ...listed, '', '## 做法的修改', changes].join('\n') }
}

export function parseMatch(raw: string): ParseResult {
  const obj = extractJsonObject(raw)
  if (!obj || typeof obj !== 'object') return { ok: false, reason: '不是 JSON 物件' }
  const choice = String((obj as Record<string, unknown>)['choice'] ?? '').trim()
  if (!['1', '2', '3'].includes(choice)) return { ok: false, reason: 'choice 不是 1、2 或 3' }
  const reason = (obj as Record<string, unknown>)['reason']
  return { ok: true, value: { choice, reason: typeof reason === 'string' ? reason : '' } }
}

export interface MatchResult {
  readonly id: string
  /** 實際相處的對象（資料集的編號 0、1、2）。 */
  readonly history: number
  /** judge 選的對象（資料集的編號）；判定失敗時沒有。 */
  readonly chosen?: number
}

/**
 * HP4（預先登記）：有採用過修改的個體，judge 盲測比對它的修改來自哪一種對象。
 * - n＜3：INCOMPLETE；
 * - 單尾精確二項檢定（對 1/3）p ≤ 0.05，而且答對的個體來自至少兩段不同的歷史：PASS；否則 FAIL。
 *   第二個條件擋住 judge 的偏好（例如總是選同一種）配上只有一段歷史有採用時的假陽性。
 * 判定失敗（沒有 chosen）算答錯。
 */
export function hp4(results: readonly MatchResult[]): { readonly verdict: string; readonly correct: number; readonly n: number; readonly p: number; readonly histories: number } {
  const n = results.length
  const right = results.filter((r) => r.chosen === r.history)
  const correct = right.length
  const p = n === 0 ? 1 : binomialSf(correct, n, 1 / 3)
  const histories = new Set(right.map((r) => r.history)).size
  const verdict = n < 3 ? 'INCOMPLETE' : p <= 0.05 && histories >= 2 ? 'PASS' : 'FAIL'
  return { verdict, correct, n, p, histories }
}

/** 標籤的所有不同排列（保留每一組的大小）。 */
function* labelings(labels: readonly number[]): Generator<number[]> {
  const counts = new Map<number, number>()
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  const keys = [...counts.keys()]
  const cur: number[] = []
  function* rec(): Generator<number[]> {
    if (cur.length === labels.length) {
      yield [...cur]
      return
    }
    for (const k of keys) {
      const c = counts.get(k)!
      if (c === 0) continue
      counts.set(k, c - 1)
      cur.push(k)
      yield* rec()
      cur.pop()
      counts.set(k, c)
    }
  }
  yield* rec()
}

function withinMinusBetween(sim: readonly (readonly number[])[], labels: readonly number[]): number | undefined {
  let w = 0
  let nw = 0
  let b = 0
  let nb = 0
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (labels[i] === labels[j]) {
        w += sim[i]![j]!
        nw++
      } else {
        b += sim[i]![j]!
        nb++
      }
    }
  }
  return nw === 0 || nb === 0 ? undefined : w / nw - b / nb
}

/**
 * HP5（預先登記）：新增的句子的文字相似度，同一段歷史之內的平均減去不同歷史之間的平均；
 * 置換檢定：所有保留組大小的標籤排列，p＝統計量 ≥ 觀察值的比例。p ≤ 0.05：PASS；否則 FAIL；
 * 沒有同一段歷史的一對或沒有不同歷史的一對：INCOMPLETE。
 */
export function hp5(units: readonly { readonly history: number; readonly text: string }[]): { readonly verdict: string; readonly observed?: number; readonly p?: number; readonly permutations: number } {
  const labels = units.map((u) => u.history)
  const sim = units.map((a) => units.map((b) => similarity(a.text, b.text)))
  const observed = withinMinusBetween(sim, labels)
  if (observed === undefined) return { verdict: 'INCOMPLETE', permutations: 0 }
  let n = 0
  let ge = 0
  for (const l of labelings(labels)) {
    n++
    const t = withinMinusBetween(sim, l)!
    if (t >= observed - 1e-12) ge++
  }
  const p = ge / n
  return { verdict: p <= 0.05 ? 'PASS' : 'FAIL', observed, p, permutations: n }
}

/** 閘門的一個處境：照現行做法的兩個輸出、照提案做法的輸出，以及個體判斷的差異是否大於雜訊。 */
export interface NoisePoint {
  /** 1 − 相似度：現行做法兩個輸出之間。 */
  readonly reference: number
  /** 1 − 相似度：提案的輸出與現行做法兩個輸出的平均。 */
  readonly candidate: number
  readonly beyondNoise: boolean
}

interface ProbeLike {
  readonly label?: string
  readonly references?: readonly string[]
  readonly candidate?: string
}

/**
 * 雜訊的數值對照（描述性）：個體對每個處境的 beyondNoise 判斷，與文字距離的超出量（candidate − reference）是否一致。
 * rows 要有 self/procedure-probe 與 self/procedure-decision（帶 id）。一個處境有幾個理由時，任一個大於雜訊就算大於。
 */
export function noisePoints(rows: readonly (LifeRow & { readonly id?: string })[]): NoisePoint[] {
  const probes = new Map<string, ProbeLike>()
  for (const r of rows) if (r.kind === 'self/procedure-probe' && r.id) probes.set(r.id, r.data as ProbeLike)
  const out: NoisePoint[] = []
  for (const r of rows) {
    if (r.kind !== 'self/procedure-decision') continue
    const d = r.data as DecisionLike & { readonly probes?: readonly string[] }
    if (d.gate !== 'noise') continue
    for (const id of d.probes ?? []) {
      const p = probes.get(id)
      if (!p || !p.label || !p.candidate || (p.references ?? []).length < 2) continue
      const [a, b] = p.references!
      const beyond = (d.reasons ?? []).some((x) => x.situation === p.label && x.beyondNoise === true)
      out.push({ reference: 1 - similarity(a!, b!), candidate: (2 - similarity(p.candidate, a!) - similarity(p.candidate, b!)) / 2, beyondNoise: beyond })
    }
  }
  return out
}

/** AUC：大於雜訊的處境的超出量高於不大於的處境的機率（相同算一半）；有一邊沒有時 undefined。 */
export function noiseAuc(points: readonly NoisePoint[]): number | undefined {
  const excess = (p: NoisePoint) => p.candidate - p.reference
  const yes = points.filter((p) => p.beyondNoise).map(excess)
  const no = points.filter((p) => !p.beyondNoise).map(excess)
  if (yes.length === 0 || no.length === 0) return undefined
  let s = 0
  for (const y of yes) for (const n of no) s += y > n ? 1 : y === n ? 0.5 : 0
  return s / (yes.length * no.length)
}

/**
 * 閘門的成本（描述性）：每個有雜訊基準的判斷的呼叫數，與「只看第一個處境、沒有大於雜訊就停」會改變結論的判斷數
 * （第一個處境沒有理由大於雜訊，但結論是 adopt 或 revise）。
 */
export function earlyStop(rows: readonly LifeRow[]): { readonly decisions: number; readonly calls: number; readonly changed: number } {
  let decisions = 0
  let calls = 0
  let changed = 0
  for (const r of rows) {
    if (r.kind !== 'self/procedure-decision') continue
    const d = r.data as DecisionLike
    if (d.gate !== 'noise') continue
    decisions++
    calls += d.calls ?? 0
    const first = (d.reasons ?? []).some((x) => x.situation === 'S1' && x.beyondNoise === true)
    if (!first && (d.verdict === 'adopt' || d.verdict === 'revise')) changed++
  }
  return { decisions, calls, changed }
}
