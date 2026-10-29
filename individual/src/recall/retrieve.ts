/**
 * 回憶的檢索與呈現（純函式，不依賴 DSH，可單獨測試）。
 *
 * - 兩條檢索路徑：原句的詞彙比對、模型擴充線索詞的詞彙比對。
 * - 以 Reciprocal Rank Fusion 合併（Cormack, Clarke & Büttcher, SIGIR 2009：score = Σ 1/(k + rank)，k = 60）；
 *   兩條路徑的 bm25 分數不可直接比較，所以只用名次合併。
 * - 命中「擷取的事實」（memory/facts）時，呈現它所描述的原始經歷，並附上事實。
 * - 對話以「回合」為單位：對方的一句話＋我在那一回合最後說出口的回覆。命中回合中任一則訊息都呈現整個回合。
 *   依據 LongMemEval（arXiv:2410.10813）§5.2〈Value〉：以 round 為單位存取優於整個 session。
 * - 取回的片段依時間先後排列（同上 §5.1 實驗設定：retrieved items are always sorted by their timestamp）。
 * - 我的回覆只呈現說出口的話，不含當時的推理；過長時保留開頭與結尾，因為結論常在最後一行。
 *   這兩點是本專案的延伸：v2 實驗中只截取開頭，模型看到的多半是推理的前幾句，看不到自己最後的選擇。
 * - 新 session 開頭另附「關於對方，我記得的長期事實」，見 personFacts（hypotheses.md H-M2）。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { SIGNIFICANCE_LABEL, formatDay, formatTime, type AppraisalData } from '../self/state.ts'

/**
 * 這些是記帳用的事件，不作為回憶內容。`memory/facts`、`memory/lesson` 不在此列：它們是可檢索的記憶。
 * `rd/`（行動前的思考與事後比對）只供經驗修正與整合期使用；`memory/outdated` 是過時事實的標記。
 */
export const EXCLUDED_KIND_PREFIXES = ['memory/recall', 'memory/aux', 'memory/outdated', 'rd/', 'body/', 'life/', 'dsh/system/'] as const

export const FACTS_KIND = 'memory/facts'
const HEARD = 'dsh/user/message'
const SAID = 'dsh/assistant/message'
/** ingest 為對方的話加上的前綴；其他來源的 user/message（DSH 注入的執行環境、時間）不是對方說的話。 */
const HEARD_PREFIX = '對方說：'

/** 對方真正說的話（排除 DSH 注入的 runtime-context、time-context 等內容）。 */
export function isHeard(event: LifeEvent): boolean {
  return event.kind === HEARD && (event.text ?? '').startsWith(HEARD_PREFIX)
}

export interface FactsData {
  readonly facts: readonly string[]
  /** heard＝從對方的話擷取；said＝從自己的回覆擷取。 */
  readonly from: 'heard' | 'said'
  /** facts 中幾週後仍然成立或仍然重要的那些（只有 heard 會有）。舊紀錄沒有這個欄位。 */
  readonly lasting?: readonly string[]
}

export interface Recalled {
  /** 代表事件：對話回合中對方的那句話；其他種類就是命中的事件本身。 */
  readonly event: LifeEvent
  /** 對話回合中我最後說出口的回覆。 */
  readonly reply?: LifeEvent | undefined
  /** 代表事件（與回合中對方的話）擷取的事實。 */
  readonly facts: readonly string[]
  /** 回合中我的回覆擷取的事實（我的立場與承諾）。 */
  readonly saidFacts: readonly string[]
  readonly via: readonly string[]
  readonly score: number
}

const RRF_K = 60

/** Reciprocal Rank Fusion。回傳依分數由高到低排序的 id。 */
export function fuse(lists: readonly { readonly name: string; readonly ids: readonly string[] }[]): { id: string; score: number; via: string[] }[] {
  const acc = new Map<string, { score: number; via: string[] }>()
  for (const list of lists) {
    const seen = new Set<string>()
    list.ids.forEach((id, rank) => {
      if (seen.has(id)) return
      seen.add(id)
      const entry = acc.get(id) ?? { score: 0, via: [] }
      entry.score += 1 / (RRF_K + rank + 1)
      entry.via.push(list.name)
      acc.set(id, entry)
    })
  }
  return [...acc.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.score - a.score)
}

function sourceId(hit: LifeEvent): string {
  return hit.kind === FACTS_KIND ? (hit.causes[0] ?? hit.id) : hit.id
}

interface BlockLike {
  readonly type: string
  readonly text?: string
}

/** 我在這則訊息中說出口的話（不含推理與工具呼叫）。 */
export function replyOf(event: LifeEvent): string {
  const content = (event.data as { data?: { message?: { content?: readonly BlockLike[] } } } | null)?.data?.message?.content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim()
  }
  // 沒有原始區塊時，依 ingest 寫入的格式（「我想：」「我說：」「我使用工具」各占一段）取出「我說」的部分。
  const said = /(?:^|\n)我說：([\s\S]*?)(?=\n我使用工具 |$)/.exec(event.text ?? '')
  return said?.[1]?.trim() ?? ''
}

/** 一個對話回合：對方的那句話，以及到對方下一句話之前我的所有訊息（中間 DSH 注入的內容略過）。 */
function roundOf(life: LifeStore, hit: LifeEvent): { heard: LifeEvent | undefined; said: LifeEvent[] } | undefined {
  if (!hit.session || !(isHeard(hit) || hit.kind === SAID)) return undefined
  const heard = hit.kind === SAID ? life.preceding(hit.session, HEARD, hit.seq, HEARD_PREFIX) : hit
  const said: LifeEvent[] = []
  const start = heard ?? hit
  if (start.kind === SAID) said.push(start)
  for (const event of life.following(hit.session, [HEARD, SAID], start.seq, 120)) {
    if (isHeard(event)) break
    if (event.kind === SAID) said.push(event)
  }
  return { heard, said }
}

function factsOf(life: LifeStore, id: string): string[] {
  return life.referencing(id, FACTS_KIND).flatMap((f) => (f.data as FactsData).facts)
}

export interface RecallOptions {
  readonly limit: number
  readonly excludeSession?: string | undefined
}

/** 混合回憶：原句＋擴充線索詞；事實命中對應回原始經歷，對話命中擴成整個回合。 */
export function hybridRecall(life: LifeStore, cue: string, keywords: readonly string[], options: RecallOptions): Recalled[] {
  const per = Math.max(options.limit * 4, 16)
  const search = (query: string) =>
    life.search(query, { limit: per, excludeSession: options.excludeSession, excludeKindPrefixes: EXCLUDED_KIND_PREFIXES })
  const lists = [{ name: 'lexical', ids: search(cue).map(sourceId) }]
  if (keywords.length > 0) lists.push({ name: 'expansion', ids: search(keywords.join(' ')).map(sourceId) })
  const out: Recalled[] = []
  const byKey = new Map<string, number>()
  for (const { id, score, via } of fuse(lists)) {
    const hit = life.get(id)
    if (!hit || (options.excludeSession && hit.session === options.excludeSession)) continue
    if (hit.kind === HEARD && !isHeard(hit)) continue // DSH 注入的內容不是經歷
    const round = roundOf(life, hit)
    const event = round?.heard ?? round?.said[0] ?? hit
    const index = byKey.get(event.id)
    if (index !== undefined) {
      const kept = out[index]!
      out[index] = { ...kept, via: [...new Set([...kept.via, ...via])] }
      continue
    }
    if (out.length >= options.limit) continue
    const replies = round?.said.filter((e) => replyOf(e) !== '') ?? []
    out.push({
      event,
      reply: replies.at(-1),
      facts: [...new Set(factsOf(life, event.id))],
      saidFacts: [...new Set((round?.said ?? []).flatMap((e) => factsOf(life, e.id)))],
      via,
      score,
    })
    byKey.set(event.id, out.length - 1)
  }
  return out
}

/** 依事件 id 取回一段回憶（對話事件擴成整個回合），供 recall 工具展開索引中的片段。 */
export function recalledOf(life: LifeStore, id: string): Recalled | undefined {
  const hit = life.get(id)
  if (!hit) return undefined
  const source = hit.kind === FACTS_KIND ? (life.get(hit.causes[0] ?? '') ?? hit) : hit
  const round = roundOf(life, source)
  const event = round?.heard ?? round?.said[0] ?? source
  const replies = round?.said.filter((e) => replyOf(e) !== '') ?? []
  return {
    event,
    reply: replies.at(-1),
    facts: [...new Set(factsOf(life, event.id))],
    saidFacts: [...new Set((round?.said ?? []).flatMap((e) => factsOf(life, e.id)))],
    via: ['id'],
    score: 0,
  }
}

export interface LastConversation {
  readonly session: string
  readonly heard: LifeEvent | undefined
  readonly said: LifeEvent | undefined
}

/** 最近一次（目前 session 以外）對話的第一句與最後說出口的回覆。 */
export function lastConversation(life: LifeStore, currentSession: string | undefined): LastConversation | undefined {
  const session = life.latestOtherSession(HEARD, currentSession)
  if (!session) return undefined
  return {
    session,
    heard: life.inSession(session, HEARD, 'asc', 10).find(isHeard),
    said: life.inSession(session, SAID, 'desc', 10).find((e) => replyOf(e) !== ''),
  }
}

/** 整合期標記某條長期事實已不再成立（見 integrate/）。 */
export const OUTDATED_KIND = 'memory/outdated'

export interface OutdatedData {
  readonly fact: string
  readonly replacedBy: string
  readonly evidence: readonly string[]
}

export interface PersonFact {
  readonly text: string
  readonly ts: number
  /** 這條事實所在的 memory/facts 事件。 */
  readonly id: string
}

/**
 * 關於對方，我記得的長期事實：從對方的話擷取、標為長期的事實（hypotheses.md H-M2）。
 * Hindsight（arXiv:2512.12818）§4〈The Observation Paradigm〉以模型把某個實體的全部事實摘要成 observation；
 * 這裡不做摘要，只列出原本擷取的句子：同一句只保留最新一次，較新的優先放進 budget（字元數），再依時間排列。
 * 摘要、合併與淘汰過時的事實留給之後的整合期。目前假設對話的對方是同一個人。
 */
export function personFacts(life: LifeStore, budget = 2400): PersonFact[] {
  const latest = new Map<string, PersonFact>()
  for (const event of life.all(FACTS_KIND)) {
    const data = event.data as FactsData
    if (data.from !== 'heard') continue
    for (const text of data.lasting ?? []) {
      latest.delete(text)
      latest.set(text, { text, ts: event.ts, id: event.id })
    }
  }
  // 整合期標為過時的事實，在標記之後不再列出（之後又聽到同一句話時，會以新的時間重新列出）。
  for (const event of life.all(OUTDATED_KIND)) {
    const fact = latest.get((event.data as OutdatedData).fact)
    if (fact && fact.ts <= event.ts) latest.delete(fact.text)
  }
  const chosen: PersonFact[] = []
  let used = 0
  for (const fact of [...latest.values()].reverse()) {
    used += fact.text.length + 14
    if (used > budget) break
    chosen.push(fact)
  }
  return chosen.reverse()
}

const KIND_LABEL: Record<string, string> = {
  [HEARD]: '對話',
  [SAID]: '我的回應',
  'dsh/tool/result': '工具',
  'self/revision': '自我修訂',
  'self/narrative': '人生敘事',
  'self/integration': '整合',
  'memory/lesson': '教訓',
  'goal/change': '目標',
  appraisal: '感受',
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/** 過長時保留開頭與結尾（約 6:4），中間以「……」代替。 */
export function clipEnds(text: string, max: number): string {
  const chars = [...text.replace(/\s+/g, ' ').trim()]
  if (chars.length <= max) return chars.join('')
  const head = Math.ceil(max * 0.6)
  return `${chars.slice(0, head).join('')}……${chars.slice(chars.length - (max - head)).join('')}`
}

function line(event: LifeEvent, max: number): string {
  const body = event.kind === SAID ? `我說：${replyOf(event) || '（沒有說出口的話）'}` : (event.text ?? '')
  return `- [${event.id}｜${formatTime(event.ts)}｜${KIND_LABEL[event.kind] ?? event.kind}] ${clipEnds(body, max)}`
}

export interface RenderOptions {
  /** 相關片段的總長上限；超過時先捨去分數最低的片段。 */
  readonly maxChars?: number
  /**
   * 按需披露（ADR-0002 D1）：只有分數最高的 expand 筆呈現全文，其餘只列一行索引，
   * 由個體用 recall 工具的 ids 參數展開。省略則全部呈現全文。
   */
  readonly expand?: number
}

/** 索引行的要點：擷取的第一條事實，沒有就取事件文字的開頭與結尾。 */
function gist(r: Recalled): string {
  const fact = r.facts[0] ?? r.saidFacts[0]
  if (fact) return clip(fact, 80)
  return clipEnds(r.event.kind === SAID ? replyOf(r.event) : (r.event.text ?? ''), 80)
}

/** 回憶的呈現：關於對方的長期事實（若有）＋最近一次對話（若有）＋相關片段（依時間排列），各自附上事實與感受。 */
export function renderRecall(
  life: LifeStore,
  recalled: readonly Recalled[],
  last: LastConversation | undefined,
  header: string,
  person: readonly PersonFact[] = [],
  options: RenderOptions = {},
): string {
  const maxChars = options.maxChars ?? 9000
  const lines = [header]
  if (person.length > 0) {
    lines.push('', '## 關於對方，我記得的長期事實', '（從過去的對話中擷取；舊的可能已經改變，以較新的為準。）')
    for (const fact of person) lines.push(`- ${formatDay(fact.ts)}｜${fact.text}`)
  }
  if (last && (last.heard || last.said)) {
    lines.push('', '## 最近一次對話')
    if (last.heard) lines.push(line(last.heard, 240))
    if (last.said) lines.push(line(last.said, 300))
  }
  const byScore = [...recalled].sort((a, b) => b.score - a.score)
  const full = options.expand === undefined ? byScore : byScore.slice(0, options.expand)
  const indexed = options.expand === undefined ? [] : byScore.slice(options.expand)
  const blocks = full.map((r) => ({ r, text: fragment(life, r) }))
  let total = blocks.reduce((n, b) => n + b.text.length, 0)
  for (const b of [...blocks].sort((x, y) => x.r.score - y.r.score)) {
    if (total <= maxChars || blocks.length <= 1) break
    blocks.splice(blocks.indexOf(b), 1)
    total -= b.text.length
  }
  const byTime = (a: Recalled, b: Recalled) => a.event.ts - b.event.ts || a.event.seq - b.event.seq
  if (blocks.length > 0) {
    lines.push('', '## 相關的過往片段（依時間先後）')
    blocks.sort((a, b) => byTime(a.r, b.r))
    for (const b of blocks) lines.push(b.text)
  }
  if (indexed.length > 0) {
    lines.push('', '## 其他可能相關的片段（只列要點，依時間先後；需要細節時，用 recall 工具的 ids 參數展開）')
    for (const r of [...indexed].sort(byTime)) {
      lines.push(`- [${r.event.id}｜${formatTime(r.event.ts)}｜${KIND_LABEL[r.event.kind] ?? r.event.kind}] ${gist(r)}`)
    }
  }
  return lines.join('\n')
}

/** 一個回憶片段：事件本身（對話回合附上我當時的回答）、擷取的要點與感受。 */
function fragment(life: LifeStore, r: Recalled): string {
  const lines = [line(r.event, r.event.kind === SAID ? 360 : 300)]
  if (r.facts.length > 0) lines.push(`    ↳ 當時記下的要點：${clipEnds(r.facts.join('；'), 300)}`)
  if (r.reply && r.reply.id !== r.event.id) lines.push(`    ↳ [${r.reply.id}] 我當時的回答：${clipEnds(replyOf(r.reply), 360)}`)
  if (r.saidFacts.length > 0) lines.push(`    ↳ 我當時表達的立場與承諾：${clipEnds(r.saidFacts.join('；'), 300)}`)
  for (const id of new Set([r.event.id, ...(r.reply ? [r.reply.id] : [])])) {
    for (const appraisal of life.referencing(id, 'appraisal').slice(-2)) {
      const a = appraisal.data as AppraisalData
      lines.push(
        `    ↳ ${formatTime(appraisal.ts)} 我記下的感受（${SIGNIFICANCE_LABEL[a.significance]}${a.reappraisal ? '，重新評價' : ''}）：${clip(a.feeling, 200)}`,
      )
    }
  }
  return lines.join('\n')
}
