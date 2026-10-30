/**
 * Telegram 通道的純函式（plan v2 M4「Telegram／LINE／Discord 作為插件」；ADR-0006）。可單獨測試；橋接程式見 telegram.ts。
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Answer, Question } from './harness.ts'

/** Telegram 單則訊息的上限是 4096 字；留一點餘裕。 */
export const TELEGRAM_LIMIT = 4000

/** 依段落、行切開過長的文字，每段不超過 max；切不開的長行硬切。內容不增不減（只去掉段落之間的換行）。 */
export function chunkText(text: string, max = TELEGRAM_LIMIT): string[] {
  const chunks: string[] = []
  let current = ''
  const push = () => {
    if (current) chunks.push(current)
    current = ''
  }
  for (const line of text.split('\n')) {
    if (line.length > max) {
      push()
      for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max))
      continue
    }
    if (current && current.length + 1 + line.length > max) push()
    current = current ? `${current}\n${line}` : line
  }
  push()
  return chunks.filter((c) => c.trim().length > 0)
}

/** 白名單：逗號分隔的聊天 id（群組是負數）。沒有設定就是空的，橋接程式一律不回應。 */
export function parseAllowed(raw: string | undefined): Set<number> {
  const out = new Set<number>()
  for (const part of (raw ?? '').split(',')) {
    const t = part.trim()
    if (/^-?\d+$/.test(t)) out.add(Number(t))
  }
  return out
}

/** 對工具核准的回覆；看不懂時回傳 undefined（呼叫端當作拒絕）。 */
export function approvalReply(text: string): 'allowed-once' | 'rejected' | undefined {
  const t = text.trim().toLowerCase()
  if (/^(允許|允许|好|可以|同意|y|yes|ok)$/u.test(t)) return 'allowed-once'
  if (/^(拒絕|拒绝|不|不要|不行|n|no)$/u.test(t)) return 'rejected'
  return undefined
}

/** 把個體的提問寫成一則訊息：題目、說明與編號的選項。 */
export function formatQuestion(q: Question): string {
  const lines = [q.header ? `【${q.header}】${q.question}` : q.question]
  if (q.detail) lines.push(q.detail)
  q.options?.forEach((o, i) => lines.push(`${i + 1}. ${o.label}${o.description ? `：${o.description}` : ''}`))
  if (q.options?.length) lines.push(q.multiSelect ? '（回覆選項編號，可以多個，用逗號分開；也可以直接回答）' : '（回覆選項編號，或直接回答）')
  return lines.join('\n')
}

/** 依回覆組成答案：回覆是選項編號時選那些選項，否則當作自己寫的回答。 */
export function answerFor(q: Question, reply: string): Answer {
  const options = q.options ?? []
  const picks = reply.split(/[,，、\s]+/u).filter(Boolean)
  if (options.length > 0 && picks.length > 0 && picks.every((p) => /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= options.length)) {
    const selected = [...new Set(picks.map((p) => options[Number(p) - 1]!.label))]
    return { id: q.id, selected: q.multiSelect ? selected : selected.slice(0, 1) }
  }
  return { id: q.id, selected: [], custom: reply }
}

/** 聊天 → DSH session 的對應，存在個體的生命資料目錄（同一個聊天一直是同一段對話）。 */
export class SessionMap {
  readonly #path: string
  readonly #map: Map<number, string>
  constructor(path: string) {
    this.#path = path
    const raw = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>) : {}
    this.#map = new Map(Object.entries(raw).map(([k, v]) => [Number(k), v]))
  }
  get(chat: number): string | undefined {
    return this.#map.get(chat)
  }
  chatOf(session: string): number | undefined {
    for (const [chat, s] of this.#map) if (s === session) return chat
    return undefined
  }
  set(chat: number, session: string): void {
    this.#map.set(chat, session)
    const tmp = `${this.#path}.tmp`
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.#map), null, 2), { mode: 0o600 })
    renameSync(tmp, this.#path)
  }
}
