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
 * - 記憶分區（ADR-0007）：短期記憶是這段對話（DSH 的上下文）與新 session 開頭的「最近的對話」（recentPages）；
 *   長期記憶是生命日誌，以檢索帶回。被 DSH 壓縮擠出上下文的部分照常可以檢索（shadowedIds）。
 */
import { indexTerms, type LifeEvent, type LifeStore } from '../life/store.ts'
import { appraisalLabel, formatDay, formatTime, type AppraisalData } from '../self/state.ts'

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

/** 對方那句話的原文（去掉 ingest 加上的前綴）。 */
export function heardText(event: LifeEvent): string {
  return (event.text ?? '').slice(HEARD_PREFIX.length).trim()
}

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
  /** excludeSession 中已被 DSH 壓縮擠出上下文的事件（shadowedIds）：不在上下文中了，照常可以回憶。 */
  readonly shadowed?: ReadonlySet<string> | undefined
  /** 已經另外呈現的回合（例如短期記憶中的回合），不再重複。 */
  readonly excludeIds?: ReadonlySet<string> | undefined
}

/** 混合回憶：原句＋擴充線索詞；事實命中對應回原始經歷，對話命中擴成整個回合。 */
export function hybridRecall(life: LifeStore, cue: string, keywords: readonly string[], options: RecallOptions): Recalled[] {
  const per = Math.max(options.limit * 4, 16)
  const search = (query: string) => {
    const other = life.search(query, { limit: per, excludeSession: options.excludeSession, excludeKindPrefixes: EXCLUDED_KIND_PREFIXES })
    const shadowed = options.shadowed
    if (!options.excludeSession || !shadowed || shadowed.size === 0) return other
    const evicted = life
      .search(query, { limit: per, onlySession: options.excludeSession, excludeKindPrefixes: EXCLUDED_KIND_PREFIXES })
      .filter((h) => shadowed.has(sourceId(h)))
    // 同一個查詢、同一個索引上的 bm25 可以互相比較（越小越相關），所以合併後依分數排序。
    return [...other, ...evicted].sort((a, b) => a.score - b.score).slice(0, per)
  }
  const lists = [{ name: 'lexical', ids: search(cue).map(sourceId) }]
  if (keywords.length > 0) lists.push({ name: 'expansion', ids: search(keywords.join(' ')).map(sourceId) })
  const out: Recalled[] = []
  const byKey = new Map<string, number>()
  for (const { id, score, via } of fuse(lists)) {
    const hit = life.get(id)
    if (!hit || (options.excludeSession && hit.session === options.excludeSession && !options.shadowed?.has(hit.id))) continue
    if (hit.kind === HEARD && !isHeard(hit)) continue // DSH 注入的內容不是經歷
    const round = roundOf(life, hit)
    const event = round?.heard ?? round?.said[0] ?? hit
    if (options.excludeIds?.has(event.id)) continue
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

/** 短期記憶的回合數：MemoryOS 的 STM 是固定長度的對話頁佇列，實驗設定為 7（papers/2506.06326 tex/latex/acl_latex.tex〈Experimental Settings〉）。 */
export const STM_PAGES = 7

/** 一個對話頁：對方的一句話，以及我在那一回合最後說出口的回覆（MemoryOS 的 page = {Q, R, T}）。 */
export interface Page {
  readonly heard: LifeEvent
  readonly reply: LifeEvent | undefined
}

/**
 * 短期記憶：目前 session 之前最近的 n 個對話頁，依時間先後，跨越 session 的邊界。
 * MemoryOS〈Memory Storage Module〉的 STM「stores real-time conversation data in units called dialogue pages」，
 * 回應時「All dialogue pages are retrieved」（〈Memory Retrieval Module〉）。本專案只在新 session 開頭帶入；
 * session 之內，這段對話本身就在 DSH 的上下文中。
 */
export function recentPages(life: LifeStore, currentSession: string | undefined, n = STM_PAGES): Page[] {
  return life
    .latestElsewhere(HEARD, currentSession, HEARD_PREFIX, n)
    .reverse()
    .map((heard) => ({ heard, reply: roundOf(life, heard)?.said.filter((e) => replyOf(e) !== '').at(-1) }))
}

/** DSH 的上下文壓縮（dsh-compaction-basic）留下的摘要事件。 */
export const COMPACTION_KIND = 'dsh/compaction/summary'

/**
 * 這個 session 中被 DSH 壓縮、以摘要取代而不在上下文中的事件 id。
 * `shadowedSeqs` 是「all shadowed surface nodes」（dsh-compaction types.d.ts）；生命日誌的 id 是 `${session}#${seq}`（life/ingest.ts）。
 * MemGPT〈Queue Manager〉：被擠出的訊息「are no longer in-context …, however they are stored indefinitely in recall storage
 * and readable」（papers/2310.08560 tex/sections/method_rewrite.tex）。
 */
export function shadowedIds(life: LifeStore, session: string): Set<string> {
  const ids = new Set<string>()
  for (const e of life.allInSession(session, COMPACTION_KIND)) {
    const seqs = (e.data as { data?: { shadowedSeqs?: unknown } } | null)?.data?.shadowedSeqs
    if (Array.isArray(seqs)) for (const seq of seqs) if (Number.isInteger(seq)) ids.add(`${session}#${seq}`)
  }
  return ids
}

/**
 * 這一步要不要帶入工作記憶（關於對方的長期事實）：新 session 的第一句，或這個 session 在上次帶入之後被 DSH 壓縮過。
 * 帶入過的 memory/recall 事件記有 `working: true`。
 */
export function workingSetDue(life: LifeStore, session: string, first: boolean): { readonly working: boolean; readonly afterCompaction: boolean; readonly compacted: boolean } {
  if (first) return { working: true, afterCompaction: false, compacted: false }
  const compactions = life.allInSession(session, COMPACTION_KIND)
  if (compactions.length === 0) return { working: false, afterCompaction: false, compacted: false }
  const lastWorking = life
    .allInSession(session, 'memory/recall')
    .filter((e) => (e.data as { working?: boolean } | null)?.working === true)
    .at(-1)
  const afterCompaction = !lastWorking || compactions.at(-1)!.seq > lastWorking.seq
  return { working: afterCompaction, afterCompaction, compacted: true }
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

/**
 * 目前這段對話到目前為止（RD 的思考用）：對方說的話與我說出口的回覆，依時間排列，取最後 limit 則。
 * 自動回憶排除目前的 session，因為主模型的上下文本來就有；但思考的輔助呼叫因此看不到這段對話。
 * 對方只回「嗯。」時，思考只能猜：rd-v1 試驗 2 寫出「對方的意圖：不明」，還把對方寫成「伴侶」。
 * 正要思考的那句話另外呈現，所以最後一則如果就是它，就略過。
 */
export function sessionSoFar(life: LifeStore, session: string, cue: string, limit = 8): string[] {
  const heard = life.inSession(session, HEARD, 'desc', limit + 1).filter(isHeard)
  const said = life.inSession(session, SAID, 'desc', limit * 4).filter((e) => replyOf(e).trim() !== '')
  const lines = [
    ...heard.map((e) => ({ seq: e.seq, heard: true, text: heardText(e) })),
    ...said.map((e) => ({ seq: e.seq, heard: false, text: replyOf(e).trim() })),
  ].sort((a, b) => a.seq - b.seq)
  const last = lines.at(-1)
  if (last?.heard && last.text === cue.trim()) lines.pop()
  return lines.slice(-limit).map((l) => `${l.heard ? '對方' : '我'}：${clipEnds(l.text, 400)}`)
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
 * 這裡不做摘要，只列出原本擷取的句子：同一句只保留最新一次，依最後一次聽到的時間排列。
 * 淘汰過時的事實由整合期標記（memory/outdated）。目前假設對話的對方是同一個人。
 */
export function knownFacts(life: LifeStore): PersonFact[] {
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
  return [...latest.values()]
}

/**
 * 每次都附上的事實要有上限，否則生命越長，這一節就越大（按需披露，ADR-0002 D1）。
 * budget（字元數）的前一半先給與目前線索有共同檢索詞的事實（共同詞多的優先），其餘依新到舊補滿，最後依時間排列。
 * 沒放進去的由呈現端告訴個體還有幾條，需要時用 recall 找。沒有線索時就是單純的新到舊。
 */
export function selectFacts(facts: readonly PersonFact[], budget: number, cue = ''): PersonFact[] {
  const cost = (f: PersonFact) => f.text.length + 14
  const cueTerms = new Set(indexTerms(cue))
  const chosen = new Set<PersonFact>()
  let used = 0
  const relevant = facts
    .map((f, i) => ({ f, i, shared: cueTerms.size === 0 ? 0 : new Set(indexTerms(f.text).filter((t) => cueTerms.has(t))).size }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.i - a.i)
  for (const { f } of relevant) {
    if (used + cost(f) > budget / 2) continue
    chosen.add(f)
    used += cost(f)
  }
  for (const f of [...facts].reverse()) {
    if (chosen.has(f)) continue
    if (used + cost(f) > budget) break
    chosen.add(f)
    used += cost(f)
  }
  return facts.filter((f) => chosen.has(f))
}

export function personFacts(life: LifeStore, budget = 2400, cue = ''): PersonFact[] {
  return selectFacts(knownFacts(life), budget, cue)
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
  'self/opinion': '看法',
  'self/thought': '念頭',
  'self/initiative': '主動開口',
  'skill/decision': '技能',
  'skill/proposal': '技能提案',
  appraisal: '感受',
}

/**
 * 顯示用的短 id：`session-<uuid>#<seq>` → `<uuid 前 8 碼>#<seq>`，`l:<uuid>` → `l:<前 8 碼>`；其他原樣。
 * dev2 中每次回憶約有 980 字花在完整的 id 上（佔 15%），而個體幾乎不用 id 展開（63 題中 1 次）。LifeStore.resolveId 可以解析回來。
 */
export function shortId(id: string): string {
  const session = /^session-([0-9a-f]{8})[0-9a-f-]*#(\d+)$/.exec(id)
  if (session) return `${session[1]}#${session[2]}`
  const life = /^l:([0-9a-f]{8})[0-9a-f-]*$/.exec(id)
  return life ? `l:${life[1]}` : id
}

/** 解析一組模型寫的 id；解析不到的保留原字串，讓呼叫端照原規則判斷為不存在。 */
export function resolveIds(life: LifeStore, refs: readonly string[]): string[] {
  return refs.map((ref) => life.resolveId(ref) ?? ref)
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/** 過長時保留開頭與結尾（約 6:4），中間以「……」代替；保留換行（輔助呼叫的輸入要能原樣重跑，ADR-0008 §3）。 */
export function clipKeepLines(text: string, max: number): string {
  const chars = [...text]
  if (chars.length <= max) return text
  const head = Math.ceil(max * 0.6)
  return `${chars.slice(0, head).join('')}……${chars.slice(chars.length - (max - head)).join('')}`
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
  return `- [${shortId(event.id)}｜${formatTime(event.ts)}｜${KIND_LABEL[event.kind] ?? event.kind}] ${clipEnds(body, max)}`
}

export interface RenderOptions {
  /** 相關片段的總長上限；超過時先捨去分數最低的片段。 */
  readonly maxChars?: number
  /**
   * 按需披露（ADR-0002 D1）：只有分數最高的 expand 筆呈現全文，其餘只列一行索引，
   * 由個體用 recall 工具的 ids 參數展開。省略則全部呈現全文。
   */
  readonly expand?: number
  /** 長期事實中因為上限而沒有列出的條數（見 selectFacts）。 */
  readonly omittedFacts?: number
  /** 短期記憶：最近的對話頁（recentPages）；給了就取代「最近一次對話」。 */
  readonly recent?: readonly Page[]
}

/** 索引行的要點：擷取的第一條事實，沒有就取事件文字的開頭與結尾。 */
function gist(r: Recalled): string {
  const fact = r.facts[0] ?? r.saidFacts[0]
  if (fact) return clip(fact, 80)
  return clipEnds(r.event.kind === SAID ? replyOf(r.event) : (r.event.text ?? ''), 80)
}

/** 回憶的呈現：關於對方的長期事實（若有）＋短期記憶或最近一次對話（若有）＋相關片段（依時間排列），各自附上事實與感受。 */
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
    lines.push('', '## 關於對方，我記得的長期事實', '（從過去的對話中擷取，依聽到的日期分組；舊的可能已經改變，以較新的為準。）')
    // 同一天聽到的事實共用一個日期標題（dev2：每行重複日期約佔這一節的兩成）。
    let day = ''
    for (const fact of person) {
      if (formatDay(fact.ts) !== day) lines.push(`（${(day = formatDay(fact.ts))}）`)
      lines.push(`- ${fact.text}`)
    }
    if (options.omittedFacts) lines.push(`（另有 ${options.omittedFacts} 條較早、和現在的話題比較無關的事實沒有列出；需要時用 recall 找。）`)
  }
  if (options.recent && options.recent.length > 0) {
    lines.push('', `## 最近的對話（短期記憶：這段對話之前最近的 ${options.recent.length} 個回合，依時間先後）`)
    let session: string | null = null
    for (const [i, p] of options.recent.entries()) {
      if (i > 0 && p.heard.session !== session) lines.push('（以下是另一段對話）')
      session = p.heard.session
      lines.push(line(p.heard, 240))
      if (p.reply) lines.push(`    ↳ [${shortId(p.reply.id)}] 我當時的回答：${clipEnds(replyOf(p.reply), 300)}`)
    }
  } else if (last && (last.heard || last.said)) {
    lines.push('', '## 最近一次對話')
    if (last.heard) lines.push(line(last.heard, 240))
    if (last.said) lines.push(line(last.said, 300))
  }
  const byScore = [...recalled].sort((a, b) => b.score - a.score)
  const progressive = options.expand !== undefined
  const full = progressive ? byScore.slice(0, options.expand) : byScore
  // 索引不再重複「關於對方」已經列出的事實（dev2：索引行常常就是那些事實）。
  const known = new Set(person.map((f) => f.text))
  const indexed = progressive ? byScore.slice(options.expand).filter((r) => !known.has(gist(r))) : []
  const blocks = full.map((r) => ({ r, text: fragment(life, r, progressive) }))
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
      lines.push(`- [${shortId(r.event.id)}｜${formatTime(r.event.ts)}｜${KIND_LABEL[r.event.kind] ?? r.event.kind}] ${gist(r)}`)
    }
  }
  return lines.join('\n')
}

/**
 * 一個回憶片段：事件本身（對話回合附上我當時的回答）、擷取的要點與感受。
 * 按需披露時，「我當時表達的立場與承諾」只留第一條：擷取時規定先寫結論，其餘多半與回答本身重複（dev2）。
 */
function fragment(life: LifeStore, r: Recalled, concise = false): string {
  const lines = [line(r.event, r.event.kind === SAID ? 360 : 300)]
  if (r.facts.length > 0) lines.push(`    ↳ 當時記下的要點：${clipEnds(r.facts.join('；'), 300)}`)
  if (r.reply && r.reply.id !== r.event.id) lines.push(`    ↳ [${shortId(r.reply.id)}] 我當時的回答：${clipEnds(replyOf(r.reply), 360)}`)
  if (r.saidFacts.length > 0) {
    lines.push(concise ? `    ↳ 我當時的結論：${clip(r.saidFacts[0]!, 200)}` : `    ↳ 我當時表達的立場與承諾：${clipEnds(r.saidFacts.join('；'), 300)}`)
  }
  for (const id of new Set([r.event.id, ...(r.reply ? [r.reply.id] : [])])) {
    for (const appraisal of life.referencing(id, 'appraisal').slice(-2)) {
      const a = appraisal.data as AppraisalData
      lines.push(
        `    ↳ ${formatTime(appraisal.ts)} 我記下的感受${appraisalLabel(a) ? `（${appraisalLabel(a)}）` : ''}：${clip(a.feeling, 200)}`,
      )
    }
  }
  return lines.join('\n')
}
