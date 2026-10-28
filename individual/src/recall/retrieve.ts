/**
 * 回憶的檢索與呈現（純函式，不依賴 DSH，可單獨測試）。
 *
 * - 兩條檢索路徑：原句的詞彙比對、模型擴充線索詞的詞彙比對。
 * - 以 Reciprocal Rank Fusion 合併（Cormack, Clarke & Büttcher, SIGIR 2009：score = Σ 1/(k + rank)，k = 60）；
 *   兩條路徑的 bm25 分數不可直接比較，所以只用名次合併。
 * - 命中「擷取的事實」（memory/facts）時，呈現它所描述的原始經歷，並附上事實。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { SIGNIFICANCE_LABEL, formatTime, type AppraisalData } from '../self/state.ts'

/** 這些是記帳用的事件，不作為回憶內容。`memory/facts` 不在此列：它是可檢索的記憶。 */
export const EXCLUDED_KIND_PREFIXES = ['memory/recall', 'memory/aux', 'body/', 'life/', 'dsh/system/'] as const

export const FACTS_KIND = 'memory/facts'

export interface FactsData {
  readonly facts: readonly string[]
  /** heard＝從對方的話擷取；said＝從自己的回覆擷取。 */
  readonly from: 'heard' | 'said'
}

export interface Recalled {
  readonly event: LifeEvent
  readonly facts: readonly string[]
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

export interface RecallOptions {
  readonly limit: number
  readonly excludeSession?: string | undefined
}

/** 混合回憶：原句＋擴充線索詞，事實命中對應回原始經歷。 */
export function hybridRecall(life: LifeStore, cue: string, keywords: readonly string[], options: RecallOptions): Recalled[] {
  const per = Math.max(options.limit * 3, 12)
  const search = (query: string) =>
    life.search(query, { limit: per, excludeSession: options.excludeSession, excludeKindPrefixes: EXCLUDED_KIND_PREFIXES })
  const lists = [{ name: 'lexical', ids: search(cue).map(sourceId) }]
  if (keywords.length > 0) lists.push({ name: 'expansion', ids: search(keywords.join(' ')).map(sourceId) })
  const out: Recalled[] = []
  for (const { id, score, via } of fuse(lists)) {
    const event = life.get(id)
    if (!event || (options.excludeSession && event.session === options.excludeSession)) continue
    const facts = [...new Set(life.referencing(id, FACTS_KIND).flatMap((f) => (f.data as FactsData).facts))]
    out.push({ event, facts, via, score })
    if (out.length >= options.limit) break
  }
  return out
}

export interface LastConversation {
  readonly session: string
  readonly heard: LifeEvent | undefined
  readonly said: LifeEvent | undefined
}

/** 最近一次（目前 session 以外）對話的第一句與最後的回覆。 */
export function lastConversation(life: LifeStore, currentSession: string | undefined): LastConversation | undefined {
  const session = life.latestOtherSession('dsh/user/message', currentSession)
  if (!session) return undefined
  return {
    session,
    heard: life.inSession(session, 'dsh/user/message', 'asc', 1)[0],
    said: life.inSession(session, 'dsh/assistant/message', 'desc', 1)[0],
  }
}

const KIND_LABEL: Record<string, string> = {
  'dsh/user/message': '對話',
  'dsh/assistant/message': '我的回應',
  'dsh/tool/result': '工具',
  'self/revision': '自我修訂',
  'goal/change': '目標',
  appraisal: '感受',
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

function line(event: LifeEvent, max: number): string {
  return `- [${event.id}｜${formatTime(event.ts)}｜${KIND_LABEL[event.kind] ?? event.kind}] ${clip(event.text ?? '', max)}`
}

/** 回憶的呈現：最近一次對話（若有）＋相關片段，各自附上事實與感受。 */
export function renderRecall(life: LifeStore, recalled: readonly Recalled[], last: LastConversation | undefined, header: string): string {
  const lines = [header]
  if (last && (last.heard || last.said)) {
    lines.push('', '## 最近一次對話')
    if (last.heard) lines.push(line(last.heard, 240))
    if (last.said) lines.push(line(last.said, 240))
  }
  if (recalled.length > 0) {
    lines.push('', '## 相關的過往片段')
    for (const r of recalled) {
      lines.push(line(r.event, 300))
      if (r.facts.length > 0) lines.push(`    ↳ 當時記下的要點：${clip(r.facts.join('；'), 300)}`)
      for (const appraisal of life.referencing(r.event.id, 'appraisal').slice(-2)) {
        const a = appraisal.data as AppraisalData
        lines.push(
          `    ↳ ${formatTime(appraisal.ts)} 我記下的感受（${SIGNIFICANCE_LABEL[a.significance]}${a.reappraisal ? '，重新評價' : ''}）：${clip(a.feeling, 200)}`,
        )
      }
    }
  }
  return lines.join('\n')
}
