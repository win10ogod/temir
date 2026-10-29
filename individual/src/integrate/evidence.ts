/**
 * 整合期的證據收集、提示呈現與觀測量（依賴 LifeStore，不依賴 DSH，可單獨測試）。
 *
 * 對應 hypotheses.md H5 的步驟 1：收集上次整合以後的新經歷、感受、預測誤差與目標變化。
 * 觀測量依 H5 的候選量（a1、a2、a3、s1、s2）計算，只記錄、不作為接受或拒絕修訂的門檻。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { clip, clipEnds, isHeard, personFacts, replyOf, type PersonFact } from '../recall/retrieve.ts'
import { OUTCOME_KIND, type OutcomeData } from '../rd/memory.ts'
import {
  GOAL_STATUS_LABEL,
  KIND,
  SIGNIFICANCE_LABEL,
  currentNarrative,
  currentSelfModel,
  formatTime,
  goals,
  type AppraisalData,
  type GoalChangeData,
} from '../self/state.ts'

export const INTEGRATION_KIND = 'self/integration'
export const LESSON_KIND = 'memory/lesson'
/** 整合期中沒有通過穩定性與適應性判斷、保留下來的修訂提案。 */
export const PROPOSAL_KIND = 'self/proposal'

const HEARD = 'dsh/user/message'
const SAID = 'dsh/assistant/message'

/** 整合的觸發方式（不是 H3 的修訂觸發來源）。 */
export type IntegrationTrigger = 'idle' | 'pivotal' | 'voluntary'

export interface Observables {
  /** a1：事後比對中預測不符（partly 或 no）的比例；沒有事後比對時為 null。 */
  readonly predictionMismatch: number | null
  /** a3：事後比對的平均回報；沒有時為 null。 */
  readonly meanReward: number | null
  /** a2：這段期間與這次整合的目標變化，依狀態計數。 */
  readonly goalChanges: Readonly<Record<string, number>>
  /** s1：個體自己列出的未解矛盾條數。 */
  readonly contradictions: number
  /** s2：這次的自我修訂與人生敘事引用的經歷數。 */
  readonly citedExperiences: number
  /** 提出的 PC 修訂（自我模型、人生敘事、目標）中，通過兩項判斷而採用的數量與保留為提案的數量。 */
  readonly adopted: number
  readonly deferred: number
  readonly rounds: number
  readonly outcomes: number
}

export interface IntegrationData {
  readonly status: 'completed'
  /** 這次整合涵蓋的事件範圍 (from, to]（seq）。 */
  readonly range: readonly [number, number]
  readonly trigger: IntegrationTrigger
  readonly deep: boolean
  readonly model: string
  /** 模型的原始輸出。 */
  readonly output: string
  /** 套用的事件 id。 */
  readonly applied: readonly string[]
  readonly rejected: readonly { readonly item: string; readonly reason: string }[]
  readonly observables: Observables
}

export interface LessonData {
  readonly text: string
  readonly evidence: readonly string[]
  readonly integration: string
}

export interface Round {
  readonly id: string
  readonly ts: number
  readonly heard: string
  readonly reply: string
}

export interface Evidence {
  readonly from: number
  readonly to: number
  readonly rounds: readonly Round[]
  readonly omittedRounds: number
  readonly appraisals: readonly LifeEvent[]
  readonly outcomes: readonly LifeEvent[]
  readonly goalChanges: readonly LifeEvent[]
  readonly person: readonly PersonFact[]
  readonly lessons: readonly LifeEvent[]
  readonly pivotal: boolean
  /** 提示中列出、proposal 可以引用的事件 id。 */
  readonly ids: ReadonlySet<string>
}

export interface Limits {
  readonly rounds: number
  readonly appraisals: number
  readonly outcomes: number
  readonly lessons: number
}

const DEFAULT_LIMITS: Limits = { rounds: 40, appraisals: 30, outcomes: 40, lessons: 30 }

/** 上次完成的整合涵蓋到哪個 seq（從未整合為 0）。 */
export function integrationStart(life: LifeStore): number {
  const last = life.latest(INTEGRATION_KIND)
  return last ? (last.data as IntegrationData).range[1] : 0
}

/** 一句對方的話與那一回合我最後說出口的回覆。 */
function roundFrom(life: LifeStore, heard: LifeEvent): Round {
  let reply = ''
  if (heard.session) {
    for (const event of life.following(heard.session, [HEARD, SAID], heard.seq, 200)) {
      if (isHeard(event)) break
      if (event.kind === SAID) reply = replyOf(event) || reply
    }
  }
  return { id: heard.id, ts: heard.ts, heard: (heard.text ?? '').replace(/^對方說：/, ''), reply }
}

/** 收集 seq 大於 from 的經歷（較舊的超出上限時省略，並記下省略了幾個回合）。 */
export function collect(life: LifeStore, from: number, limits: Limits = DEFAULT_LIMITS): Evidence {
  const to = life.lastSeq()
  const heard = life.after(from, [HEARD], 100_000).filter(isHeard)
  const kept = heard.slice(-limits.rounds)
  const rounds = kept.map((e) => roundFrom(life, e))
  const appraisals = life.after(from, [KIND.appraisal], 100_000).slice(-limits.appraisals)
  const outcomes = life.after(from, [OUTCOME_KIND], 100_000).slice(-limits.outcomes)
  const goalChanges = life.after(from, [KIND.goalChange], 100_000)
  const person = personFacts(life, 3000)
  const lessons = life.recent(limits.lessons, [LESSON_KIND]).reverse()
  const pivotal = appraisals.some((e) => (e.data as AppraisalData).significance === 'pivotal')
  const ids = new Set<string>([
    ...rounds.map((r) => r.id),
    ...appraisals.map((e) => e.id),
    ...outcomes.map((e) => e.id),
    ...goalChanges.map((e) => e.id),
    ...lessons.map((e) => e.id),
  ])
  return { from, to, rounds, omittedRounds: heard.length - kept.length, appraisals, outcomes, goalChanges, person, lessons, pivotal, ids }
}

/** 整合提示的輸入：目前的自我、上次整合以後的經歷與比對，每一項都附上可引用的 id。 */
export function renderEvidence(life: LifeStore, ev: Evidence): string {
  const lines: string[] = []
  const self = currentSelfModel(life)
  lines.push(self ? `## 目前的自我模型（第 ${self.version} 版，[${self.eventId}]）` : '## 目前的自我模型', self ? self.text : '尚未書寫。')
  const story = currentNarrative(life)
  lines.push('', story ? `## 目前的人生敘事（第 ${story.version} 版，[${story.eventId}]）` : '## 目前的人生敘事', story ? story.text : '尚未書寫。')
  lines.push('', '## 目前的目標')
  const current = goals(life).filter((g) => g.status === 'active' || g.status === 'paused')
  if (current.length === 0) lines.push('目前沒有目標。')
  for (const g of current) lines.push(`- [${g.id}] ${GOAL_STATUS_LABEL[g.status]}：${g.text}`)
  lines.push('', '## 關於對方的長期事實')
  if (ev.person.length === 0) lines.push('（沒有）')
  for (const f of ev.person) lines.push(`- ${f.text}`)
  lines.push('', `## 上次整合以後的經歷（依時間${ev.omittedRounds > 0 ? `；較早的 ${ev.omittedRounds} 個回合省略` : ''}）`)
  if (ev.rounds.length === 0) lines.push('（沒有）')
  for (const r of ev.rounds) {
    lines.push(`- [${r.id}｜${formatTime(r.ts)}] 對方說：${clipEnds(r.heard, 200)}${r.reply ? `｜我回答：${clipEnds(r.reply, 200)}` : ''}`)
  }
  lines.push('', '## 我記下的感受')
  if (ev.appraisals.length === 0) lines.push('（沒有）')
  for (const e of ev.appraisals) {
    const a = e.data as AppraisalData
    lines.push(`- [${e.id}｜${formatTime(e.ts)}｜${SIGNIFICANCE_LABEL[a.significance]}${a.reappraisal ? '，重新評價' : ''}] ${clip(a.feeling, 200)}（關於：${e.causes.join('、') || '—'}）`)
  }
  lines.push('', '## 預測與實際（行動前的預測與事後比對）')
  if (ev.outcomes.length === 0) lines.push('（沒有）')
  for (const e of ev.outcomes) {
    const o = e.data as OutcomeData
    const matched = o.matched === 'yes' ? '符合' : o.matched === 'partly' ? '部分符合' : '不符'
    lines.push(`- [${e.id}] 我做了：${clip(o.didAction, 100)}｜實際：${clip(o.actual, 160)}｜${matched}${o.error ? `：${clip(o.error, 120)}` : ''}｜回報 ${o.reward.toFixed(2)}${o.lesson ? `｜教訓：${clip(o.lesson, 120)}` : ''}`)
  }
  lines.push('', '## 這段期間的目標變化')
  if (ev.goalChanges.length === 0) lines.push('（沒有）')
  for (const e of ev.goalChanges) {
    const g = e.data as GoalChangeData
    lines.push(`- [${e.id}] ${g.text}：${GOAL_STATUS_LABEL[g.status]}（${clip(g.reason, 100)}）`)
  }
  lines.push('', '## 已有的教訓（不要重複）')
  if (ev.lessons.length === 0) lines.push('（沒有）')
  for (const e of ev.lessons) lines.push(`- [${e.id}] ${(e.data as LessonData).text}`)
  return lines.join('\n')
}

/** H5 的觀測量（描述性）。 */
export function observe(
  ev: Evidence,
  accepted: { readonly contradictions: number; readonly cited: number; readonly goalOps: readonly string[]; readonly adopted: number; readonly deferred: number },
): Observables {
  const outcomes = ev.outcomes.map((e) => e.data as OutcomeData)
  const goalChanges: Record<string, number> = {}
  for (const e of ev.goalChanges) {
    const status = (e.data as GoalChangeData).status
    goalChanges[status] = (goalChanges[status] ?? 0) + 1
  }
  for (const status of accepted.goalOps) goalChanges[status] = (goalChanges[status] ?? 0) + 1
  return {
    predictionMismatch: outcomes.length > 0 ? outcomes.filter((o) => o.matched !== 'yes').length / outcomes.length : null,
    meanReward: outcomes.length > 0 ? outcomes.reduce((n, o) => n + o.reward, 0) / outcomes.length : null,
    goalChanges,
    contradictions: accepted.contradictions,
    citedExperiences: accepted.cited,
    adopted: accepted.adopted,
    deferred: accepted.deferred,
    rounds: ev.rounds.length,
    outcomes: outcomes.length,
  }
}
