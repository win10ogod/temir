/**
 * RD 階段的紀錄與經驗記憶（純函式，依賴 LifeStore 但不依賴 DSH，可單獨測試）。
 *
 * - `rd/decision`：行動前的處境描述、候選、口述信心、經驗修正的每一項數值、選擇與當時的自我模型版本。
 * - `rd/outcome`：對某個決定的事後比對：實際做了什麼、發生了什麼、是否符合預測、回報與教訓。
 * JitRL 的記憶 (s, a, G) 從這兩種事件推導，不另外保存，所以回報可以在之後重新評估。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { clip, clipEnds, isHeard, replyOf } from '../recall/retrieve.ts'
import { formatDay } from '../self/state.ts'
import type { Deliberation } from './aux.ts'
import { discountedReturns, jaccard, termSet, type Correction, type Experience, type Neighbor, type Params, type Scored } from './jitrl.ts'

export const DECISION_KIND = 'rd/decision'
export const OUTCOME_KIND = 'rd/outcome'

export interface DecisionData {
  readonly cue: string
  readonly situation: string
  readonly candidates: readonly Scored[]
  readonly chosen: number
  /** V̂(s)；沒有可用的經驗時為 null。 */
  readonly value: number | null
  readonly neighbors: readonly { readonly id: string; readonly similarity: number; readonly judged?: boolean; readonly ret: number }[]
  /** 提示中列出的經驗編號 → rd/decision id。 */
  readonly shown: Readonly<Record<string, string>>
  readonly jitrl: boolean
  readonly params: Params
  readonly selfVersion: number
}

export interface OutcomeData {
  readonly decision: string
  readonly didAction: string
  readonly didKind: string
  readonly actual: string
  readonly matched: 'yes' | 'partly' | 'no'
  readonly error: string
  readonly reward: number
  readonly reason: string
  readonly lesson: string
  readonly selfVersion: number
  readonly heard: string
}

/** 從生命日誌推導 JitRL 的記憶：每個 session 內依時間計算折扣回報，只保留回報已知的決定。 */
export function experiences(life: LifeStore, gamma: number): Experience[] {
  const outcomes = new Map<string, OutcomeData>()
  for (const event of life.all(OUTCOME_KIND)) {
    const data = event.data as OutcomeData
    outcomes.set(data.decision, data) // 同一個決定若被評估多次，以最新的為準
  }
  const bySession = new Map<string, LifeEvent[]>()
  for (const event of life.all(DECISION_KIND)) {
    if (!event.session) continue
    const list = bySession.get(event.session) ?? []
    list.push(event)
    bySession.set(event.session, list)
  }
  const out: Experience[] = []
  for (const decisions of bySession.values()) {
    const returns = discountedReturns(decisions.map((d) => outcomes.get(d.id)?.reward), gamma)
    decisions.forEach((event, i) => {
      const ret = returns[i]
      const outcome = outcomes.get(event.id)
      if (ret === undefined || !outcome) return
      const data = event.data as DecisionData
      const planned = data.candidates[data.chosen]
      // 經驗中的行動是實際採取的做法；主模型可能沒有照準備去做。
      const action = outcome.didAction || planned?.action || ''
      if (!action) return
      out.push({
        id: event.id,
        ts: event.ts,
        cue: data.cue,
        situation: data.situation,
        action,
        kind: outcome.didAction ? outcome.didKind : (planned?.kind ?? '其他'),
        ret,
        outcome: [outcome.actual, outcome.lesson && `教訓：${outcome.lesson}`].filter(Boolean).join('；'),
      })
    })
  }
  return out
}

/**
 * 本 session 最近一個還沒有事後比對、而且就是上一回合的決定。
 * 決定之後只該有它所回應的那一句對方的話；若已經隔了更多回合（例如中間的思考失敗），
 * 現在這句話不是它的結果，就不比對。
 */
export function openDecision(life: LifeStore, session: string): LifeEvent | undefined {
  const last = life.inSession(session, DECISION_KIND, 'desc', 1)[0]
  if (!last || life.referencing(last.id, OUTCOME_KIND).length > 0) return undefined
  const heard = life.following(session, ['dsh/user/message'], last.seq, 10).filter(isHeard)
  return heard.length === 1 ? last : undefined
}

/** 決定之後那一回合我實際說出口的話：決定之後對方的第一句話，到對方下一句話之前我的最後回覆。 */
export function turnReply(life: LifeStore, decision: LifeEvent): string {
  if (!decision.session) return ''
  let heard = false
  let reply = ''
  for (const event of life.following(decision.session, ['dsh/user/message', 'dsh/assistant/message'], decision.seq, 200)) {
    if (isHeard(event)) {
      if (heard) break
      heard = true
    } else if (event.kind === 'dsh/assistant/message' && heard) {
      reply = replyOf(event) || reply
    }
  }
  return reply
}

/** 思考提示中列出的相關經驗：依對方的話與當時的話的相似度，取前 n 個。 */
export function relevantExperiences(cue: string, memory: readonly Experience[], n: number): Experience[] {
  const terms = termSet(cue)
  return memory
    .map((e) => ({ e, s: jaccard(terms, termSet(`${e.cue} ${e.situation}`)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.ts - a.e.ts)
    .slice(0, n)
    .map((x) => x.e)
}

export function renderExperiences(shown: readonly Experience[]): string {
  if (shown.length === 0) return '沒有找到類似的經驗。'
  return shown
    .map((e, i) => `E${i + 1}｜${formatDay(e.ts)}｜處境：${clip(e.situation, 160)}｜我當時：${clip(e.action, 100)}（${e.kind}）｜結果：${clip(e.outcome, 160)}｜回報 ${e.ret.toFixed(2)}`)
    .join('\n')
}

/** 準備訊息：處境、候選（含經驗修正）、選擇與相關經驗。放在對方的話之後，主模型據此行動。 */
export function renderPreparation(delib: Deliberation, correction: Correction, near: readonly Neighbor[]): string {
  const lines = ['（準備：這是你在回應之前的思考與行動準備，不是對方說的話，對方看不到。）', `處境：${delib.situation}`, '你考慮過的做法：']
  correction.scored.forEach((c, i) => {
    const basis = c.support > 0 ? `${c.support} 個相符的經驗` : c.optimistic ? '沒有相符的經驗，傾向嘗試' : '沒有相符的經驗'
    const adjust = c.q === null ? '' : `｜經驗修正 ${c.normalized >= 0 ? '+' : ''}${c.normalized.toFixed(2)}（${basis}）`
    lines.push(`${i + 1}. ${c.action}（${c.kind}）——預期：${c.prediction}｜你的傾向 ${Math.round(c.confidence)}%${adjust}`)
  })
  const chosen = correction.scored[correction.chosen]
  if (chosen) lines.push(`你準備：第 ${correction.chosen + 1} 個做法。你預期：${chosen.prediction}`)
  const shown = near.slice(0, 3)
  if (shown.length > 0) {
    lines.push('過去類似處境的經驗：')
    for (const n of shown) {
      const e = n.experience
      lines.push(`- ${formatDay(e.ts)}｜我當時：${clip(e.action, 100)}｜結果：${clipEnds(e.outcome, 160)}｜回報 ${e.ret.toFixed(2)}`)
    }
  }
  lines.push('（這只是準備；實際怎麼做，由你在回應時決定。）')
  return lines.join('\n')
}
