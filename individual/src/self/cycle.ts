/**
 * PC 循環的投影（hypotheses.md H0），從生命日誌推導，不另外寫事件：衍生資料都可以從事件重建。
 *
 * 一個 DSH 回合（turn/start 到 turn/end）是一次循環：
 * - E：對方的話（外部刺激）與自動回憶（內部刺激：被喚起的經歷）；
 * - ST／RD：行動前的思考與準備（rd/decision：處境、候選、預期後果、經驗修正、選擇）；
 * - A：實際的行動（說出口的回覆、使用的工具）；
 * - PC：思考時的自我模型與人生敘事版本（記在 rd/decision）；
 * - 回饋：下一回合對這個決定的事後比對（rd/outcome）。
 * H0 的可觀測量「每次循環的四段紀錄是否齊全」就是 complete。
 *
 * 沒有人說話時的念頭（self/thought）是以內部刺激開始的循環（H0、H-E）：
 * E＝浮上心頭的那件事，ST＝念頭，RD＝留下的打算，A＝寫下念頭、感受，以及放下與否。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { isHeard, replyOf } from '../recall/retrieve.ts'
import { THOUGHT_KIND, type ThoughtData } from './energy.ts'

export type Cycle = ExternalCycle | InternalCycle

/** 以內部刺激開始的循環：閒置時浮上心頭的念頭。 */
export interface InternalCycle {
  readonly source: 'internal'
  readonly ts: number
  readonly thought: LifeEvent
  readonly complete: { readonly E: boolean; readonly STRD: boolean; readonly A: boolean }
}

export interface ExternalCycle {
  readonly source: 'external'
  readonly ts: number
  readonly session: string
  readonly start: LifeEvent
  readonly end: LifeEvent
  /** 回合結束的原因（completed、error……）。 */
  readonly ending: string
  readonly heard: readonly LifeEvent[]
  readonly recall: LifeEvent | undefined
  readonly decision: LifeEvent | undefined
  readonly replies: readonly LifeEvent[]
  readonly tools: readonly string[]
  readonly outcome: LifeEvent | undefined
  readonly complete: { readonly E: boolean; readonly STRD: boolean; readonly A: boolean }
}

function cycleAt(life: LifeStore, end: LifeEvent): ExternalCycle | undefined {
  if (!end.session) return undefined
  const start = life.lastBefore(end.session, 'dsh/turn/start', end.seq)
  if (!start) return undefined
  const events = life.slice(end.session, start.seq, end.seq)
  const heard = events.filter(isHeard)
  const recall = events.find((e) => e.kind === 'memory/recall' && (e.data as { mode?: string }).mode === 'automatic')
  const decision = events.find((e) => e.kind === 'rd/decision')
  const replies = events.filter((e) => e.kind === 'dsh/assistant/message' && replyOf(e) !== '')
  const tools = events
    .filter((e) => e.kind === 'dsh/tool/call')
    .map((e) => (e.data as { data?: { name?: string } }).data?.name ?? '?')
  const outcome = decision ? life.referencing(decision.id, 'rd/outcome').at(-1) : undefined
  const ending = (end.data as { data?: { reason?: { kind?: string } } }).data?.reason?.kind ?? 'unknown'
  return {
    source: 'external',
    ts: end.ts,
    session: end.session,
    start,
    end,
    ending,
    heard,
    recall,
    decision,
    replies,
    tools,
    outcome,
    complete: { E: heard.length > 0 || recall !== undefined, STRD: decision !== undefined, A: replies.length > 0 || tools.length > 0 },
  }
}

function thoughtCycle(thought: LifeEvent): InternalCycle {
  const t = thought.data as ThoughtData
  return { source: 'internal', ts: thought.ts, thought, complete: { E: t.item !== null, STRD: t.thought !== '', A: true } }
}

/** 最近的幾次循環（對話回合與念頭），由舊到新。 */
export function recentCycles(life: LifeStore, limit: number): Cycle[] {
  const external = life
    .recent(limit, ['dsh/turn/end'])
    .flatMap((end) => {
      const cycle = cycleAt(life, end)
      return cycle ? [cycle] : []
    })
  const internal = life.recent(limit, [THOUGHT_KIND]).map(thoughtCycle)
  return [...external, ...internal].sort((a, b) => a.ts - b.ts).slice(-limit)
}
