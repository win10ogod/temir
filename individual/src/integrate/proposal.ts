/**
 * 整合期的 proposal：提示、解析、驗證與寫入（依賴 LifeStore，不依賴 DSH，可單獨測試）。
 *
 * 安全模型（ADR-0002 D4）參考兩個插件：
 * - hr98w/dsh-memory：模型只提出變化，由 host 以確定性程式碼驗證後寫入（`consolidation-proposal.ts`@06823e0）；
 * - fan56/dsh-topics-memory：proposal 只能指名既有的項目（`consolidate.ts:14-28`@c082f82）。
 * 本專案的對應：
 * - 每一項都只能引用提示中列出的事件 id；
 * - 不合格的項目丟棄並記下理由；
 * - 只新增事件、不刪除任何東西；
 * - 一次整合的所有寫入在同一個 savepoint 內完成。
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { LifeStore } from '../life/store.ts'
import { extractJson, strings } from '../recall/aux.ts'
import { OUTDATED_KIND, type OutdatedData } from '../recall/retrieve.ts'
import {
  GOAL_STATUS_LABEL,
  KIND,
  SIGNIFICANCE,
  SIGNIFICANCE_LABEL,
  TRIGGERS,
  currentNarrative,
  currentSelfModel,
  goals,
  type AppraisalData,
  type GoalChangeData,
  type GoalStatus,
  type NarrativeData,
  type SelfRevisionData,
  type Significance,
  type Trigger,
} from '../self/state.ts'
import { INTEGRATION_KIND, LESSON_KIND, PROPOSAL_KIND, observe, type Evidence, type IntegrationData, type LessonData, type IntegrationTrigger } from './evidence.ts'

const FORMAT = `只輸出一個 JSON 物件，不要任何其他文字：
{"lessons": [], "reappraisals": [], "selfRevision": null, "story": null, "goals": [], "outdated": [], "contradictions": [], "change": "..."}
- lessons：從這些經歷學到、以後用得上的教訓，特別是預測與實際不符的地方。每條 {"text": "一句話", "evidence": ["事件 id"]}；不要重複「已有的教訓」。
- reappraisals：現在回頭看，對某段經歷的感受有沒有改變。每條 {"event": "事件 id", "feeling": "...", "significance": "daily|notable|major|pivotal", "reason": "..."}。
- selfRevision：如果這些經歷讓你對「自己是誰、在乎什麼、傾向怎麼做」有新的理解，寫出完整的新版自我模型 {"text": "...", "reason": "...", "causes": ["事件 id"], "trigger": "internal|external|both", "stability": {...}, "adaptability": {...}}，causes 至少一個；不需要修改就給 null。trigger：這個改變來自你自己的思考與反省（internal）、外界的回饋或事件（external），或兩者（both）。
- story：如果你的人生敘事需要改寫（加入這段經歷、或重新理解過去），寫出完整的新版本，欄位同 selfRevision；敘事用第一人稱，引用具體經歷；不需要就給 null。
- goals：目標的變更。每條 {"op": "add|pause|abandon|achieve|resume", "goal": "既有目標 id（add 時省略）", "text": "...", "reason": "...", "stability": {...}, "adaptability": {...}}。
- stability 與 adaptability：自我修復要同時兼顧穩定性與適應性，兩者缺一不可。selfRevision、story 與每個 goals 項目都要寫這兩項，格式 {"holds": true, "reason": "...", "evidence": ["事件 id"]}：
  - stability：這個改變如何與你原本在乎的事、你的故事保持連貫，而不是無端的跳躍；evidence 可以是任何時候的事件（包括目前自我模型、人生敘事的 id）。
  - adaptability：這個改變如何回應這段期間的經歷：預測與實際的落差、目標的進展、對方的回饋；evidence 只能用這段期間的事件。
  - holds 照你的真實判斷寫。兩項都成立、也都有證據，修訂才會採用；不成立的會保留為提案，之後可以再提。
- outdated：「關於對方的長期事實」中已經不再成立的。每條 {"fact": "原句，一字不差", "replacedBy": "新的事實，沒有就給空字串", "evidence": ["事件 id"]}。
- contradictions：你持有的看法或價值之間，彼此衝突、還沒解決的地方，每條一句。「上次整合留下的」矛盾，這次解開了就不要再列；還沒解開就再列一次。
- 「上次整合留下的」沒有採用的修訂：想採用就照上面的格式重新提出（兩項判準都要寫）；不再需要就不提。
- change：用幾句話說明這段時間你有沒有改變、怎麼改變，引用具體經歷。
- 所有「事件 id」都只能用下面列出的 id（方括號中的字串）。可以什麼都不改：沒有就給空陣列或 null。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

export const INTEGRATE_SYSTEM = `你是一個人工個體，正在進行整合期：回顧上次整合以後的經歷，整理自己。這是你自己的反省，不是任何人的要求；你可以修改自己，也可以什麼都不改，不需要回到過去的樣子。${FORMAT}`

export const DEEP_SYSTEM = `你是一個人工個體，正在進行整合期：回顧上次整合以後的經歷，整理自己。這段期間有被你評為「轉折」的經歷，所以這次請重新檢視你的核心價值、人生敘事與長期目標；需要的話，可以做大幅修訂，也可以確認它們仍然成立。這是你自己的反省，不是任何人的要求；你不需要回到過去的樣子。${FORMAT}`

/** 個體自己對一項修訂的判斷（性質 6：自我修復的判準是穩定性與適應性）。 */
export interface Criterion {
  readonly holds: boolean
  readonly reason: string
  readonly evidence: readonly string[]
}

export interface Revision {
  readonly text: string
  readonly reason: string
  readonly causes: readonly string[]
  /** H3：修訂的觸發來源，由個體判斷。 */
  readonly trigger: Trigger
  readonly stability: Criterion
  readonly adaptability: Criterion
}

export interface GoalProposal {
  readonly op: GoalOp
  readonly goal: string
  readonly text: string
  readonly reason: string
  readonly stability: Criterion
  readonly adaptability: Criterion
}

export interface Proposal {
  readonly lessons: readonly { readonly text: string; readonly evidence: readonly string[] }[]
  readonly reappraisals: readonly { readonly event: string; readonly feeling: string; readonly significance: Significance; readonly reason: string }[]
  readonly selfRevision: Revision | null
  readonly story: Revision | null
  readonly goals: readonly GoalProposal[]
  readonly outdated: readonly { readonly fact: string; readonly replacedBy: string; readonly evidence: readonly string[] }[]
  readonly contradictions: readonly string[]
  readonly change: string
}

const GOAL_OPS = { add: 'active', pause: 'paused', abandon: 'abandoned', achieve: 'achieved', resume: 'active' } as const satisfies Record<string, GoalStatus>
export type GoalOp = keyof typeof GOAL_OPS

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)) : []
}

function criterion(value: unknown): Criterion {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { holds: false, reason: '', evidence: [] }
  const v = value as Record<string, unknown>
  return { holds: v['holds'] === true, reason: text(v['reason'], 600), evidence: strings(v['evidence'], 10, 200) }
}

function revision(value: unknown): Revision | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const body = text(v['text'], 4000)
  const trigger = (TRIGGERS as readonly string[]).includes(text(v['trigger'], 10)) ? (text(v['trigger'], 10) as Trigger) : 'internal'
  return body
    ? {
        text: body,
        reason: text(v['reason'], 500),
        causes: strings(v['causes'], 30, 200),
        trigger,
        stability: criterion(v['stability']),
        adaptability: criterion(v['adaptability']),
      }
    : null
}

/** 解析模型的 proposal；不是 JSON 物件時回傳 undefined。 */
export function parseProposal(output: string): Proposal | undefined {
  const obj = extractJson(output)
  if (!obj) return undefined
  return {
    lessons: objects(obj['lessons']).slice(0, 12).map((l) => ({ text: text(l['text'], 300), evidence: strings(l['evidence'], 10, 200) })),
    reappraisals: objects(obj['reappraisals'])
      .slice(0, 12)
      .map((r) => ({
        event: text(r['event'], 200),
        feeling: text(r['feeling'], 600),
        significance: (SIGNIFICANCE as readonly string[]).includes(text(r['significance'], 10)) ? (text(r['significance'], 10) as Significance) : 'notable',
        reason: text(r['reason'], 300),
      })),
    selfRevision: revision(obj['selfRevision']),
    story: revision(obj['story']),
    goals: objects(obj['goals'])
      .slice(0, 8)
      .filter((g) => text(g['op'], 10) in GOAL_OPS)
      .map((g) => ({
        op: text(g['op'], 10) as GoalOp,
        goal: text(g['goal'], 40),
        text: text(g['text'], 300),
        reason: text(g['reason'], 300),
        stability: criterion(g['stability']),
        adaptability: criterion(g['adaptability']),
      })),
    outdated: objects(obj['outdated'])
      .slice(0, 12)
      .map((o) => ({ fact: text(o['fact'], 300), replacedBy: text(o['replacedBy'], 300), evidence: strings(o['evidence'], 10, 200) })),
    contradictions: strings(obj['contradictions'], 8, 300),
    change: text(obj['change'], 1500),
  }
}

export interface Rejection {
  readonly item: string
  readonly reason: string
}

/** 內容合格、但個體自己的穩定性或適應性判斷不成立（或沒有證據）的 PC 修訂，保留為提案。 */
export interface Deferral {
  readonly kind: 'selfRevision' | 'story' | 'goal'
  readonly item: Revision | GoalProposal
  readonly reason: string
}

/**
 * 性質 6：自我修復的判準是穩定性與適應性，兩者缺一不可。判斷由個體自己做（holds 與理由），
 * 程式只檢查它有沒有拿出證據：穩定性的證據可以是任何時候的事件（例如目前的自我模型），
 * 適應性的證據必須是這段期間的經歷。沒有數值門檻。
 */
function dualCheck(life: LifeStore, ev: Evidence, item: { readonly stability: Criterion; readonly adaptability: Criterion }): string {
  const failures: string[] = []
  if (!item.stability.holds) failures.push('穩定性不成立')
  else if (item.stability.evidence.length === 0 || !item.stability.evidence.every((id) => life.get(id) !== undefined)) failures.push('穩定性沒有可查的證據')
  if (!item.adaptability.holds) failures.push('適應性不成立')
  else if (item.adaptability.evidence.length === 0 || !item.adaptability.evidence.every((id) => ev.ids.has(id))) failures.push('適應性沒有這段期間的證據')
  return failures.join('、')
}

/**
 * 以確定性規則驗證 proposal：
 * - 引用不完整或不在範圍內的項目丟棄（rejected）；
 * - PC 修訂（自我模型、人生敘事、目標）另外要通過穩定性與適應性的判斷，沒通過的保留為提案（deferred）。
 */
export function validate(life: LifeStore, ev: Evidence, proposal: Proposal): { accepted: Proposal; rejected: Rejection[]; deferred: Deferral[] } {
  const rejected: Rejection[] = []
  const deferred: Deferral[] = []
  const grounded = (ids: readonly string[]) => ids.length > 0 && ids.every((id) => ev.ids.has(id))
  const known = new Set(ev.lessons.map((e) => (e.data as LessonData).text))
  const lessons = proposal.lessons.filter((l) => {
    const reason = !l.text ? '沒有內容' : !grounded(l.evidence) ? '證據不在這次整合的範圍內' : known.has(l.text) ? '與既有的教訓重複' : ''
    if (reason) rejected.push({ item: `lesson:${l.text.slice(0, 40)}`, reason })
    else known.add(l.text)
    return !reason
  })
  const reappraisals = proposal.reappraisals.filter((r) => {
    const reason = !r.feeling ? '沒有內容' : !ev.ids.has(r.event) ? '事件不在這次整合的範圍內' : ''
    if (reason) rejected.push({ item: `reappraisal:${r.event}`, reason })
    return !reason
  })
  const check = (kind: 'selfRevision' | 'story', rev: Revision | null, current: string | undefined, anyPast: boolean) => {
    if (!rev) return null
    const ids = rev.causes
    const reason = !rev.reason
      ? '沒有寫理由'
      : ids.length === 0
        ? '沒有引用任何經歷'
        : !ids.every((id) => (anyPast ? life.get(id) !== undefined : ev.ids.has(id)))
          ? '引用的事件不存在或不在範圍內'
          : rev.text === current
            ? '與目前的版本相同'
            : ''
    if (reason) {
      rejected.push({ item: kind, reason })
      return null
    }
    const failed = dualCheck(life, ev, rev)
    if (failed) {
      deferred.push({ kind, item: rev, reason: failed })
      return null
    }
    return rev
  }
  // 自我修訂要以這段期間的經歷為依據；人生敘事可以引用任何時候的經歷。
  const selfRevision = check('selfRevision', proposal.selfRevision, currentSelfModel(life)?.text, false)
  const story = check('story', proposal.story, currentNarrative(life)?.text, true)
  const existing = new Map(goals(life).map((g) => [g.id, g]))
  const goalOps = proposal.goals.filter((g) => {
    const reason = !g.reason ? '沒有寫理由' : g.op === 'add' ? (!g.text ? '新目標沒有內容' : '') : !existing.has(g.goal) ? '找不到這個目標' : ''
    if (reason) {
      rejected.push({ item: `goal:${g.op}:${g.goal || g.text.slice(0, 30)}`, reason })
      return false
    }
    const failed = dualCheck(life, ev, g)
    if (failed) deferred.push({ kind: 'goal', item: g, reason: failed })
    return !failed
  })
  const facts = new Set(ev.person.map((f) => f.text))
  const outdated = proposal.outdated.filter((o) => {
    const reason = !facts.has(o.fact) ? '不是目前列出的長期事實' : !grounded(o.evidence) ? '證據不在這次整合的範圍內' : ''
    if (reason) rejected.push({ item: `outdated:${o.fact.slice(0, 40)}`, reason })
    return !reason
  })
  return {
    accepted: { ...proposal, lessons, reappraisals, selfRevision, story, goals: goalOps, outdated },
    rejected,
    deferred,
  }
}

const DEFERRAL_LABEL = { selfRevision: '自我模型', story: '人生敘事', goal: '目標' } as const

export interface Applied {
  readonly integration: string
  readonly applied: readonly string[]
}

/**
 * 寫入通過驗證的項目與這次整合的紀錄。呼叫端應包在 `life.transaction` 中，
 * 讓整次整合要嘛全部寫入、要嘛完全沒有（中斷時下次重做，排程不前進）。
 */
export function applyProposal(
  life: LifeStore,
  ev: Evidence,
  accepted: Proposal,
  rejected: readonly Rejection[],
  deferred: readonly Deferral[],
  meta: { readonly trigger: IntegrationTrigger; readonly deep: boolean; readonly model: string; readonly output: string },
): Applied {
  const integration = `l:${randomUUID()}`
  const applied: string[] = []
  const add = (input: Parameters<LifeStore['append']>[0]) => applied.push(life.append(input).id)
  for (const l of accepted.lessons) {
    const data: LessonData = { text: l.text, evidence: l.evidence, integration }
    add({ kind: LESSON_KIND, origin: 'self', data, text: `教訓：${l.text}`, causes: l.evidence })
  }
  for (const r of accepted.reappraisals) {
    const data: AppraisalData = { feeling: r.feeling, significance: r.significance, reappraisal: true }
    add({ kind: KIND.appraisal, origin: 'self', data: { ...data, reason: r.reason, integration }, text: `我的感受（${SIGNIFICANCE_LABEL[r.significance]}，重新評價）：${r.feeling}`, causes: [r.event] })
  }
  if (accepted.selfRevision) {
    const version = (currentSelfModel(life)?.version ?? 0) + 1
    const rev = accepted.selfRevision
    const data: SelfRevisionData = { version, text: rev.text, reason: rev.reason, trigger: rev.trigger }
    add({
      kind: KIND.selfRevision,
      origin: 'self',
      data: { ...data, stability: rev.stability, adaptability: rev.adaptability, integration },
      text: `我修訂了自我模型（第 ${version} 版）。原因：${data.reason}\n${data.text}`,
      causes: accepted.selfRevision.causes,
    })
  }
  if (accepted.story) {
    const version = (currentNarrative(life)?.version ?? 0) + 1
    const story = accepted.story
    const data: NarrativeData = { version, text: story.text, reason: story.reason }
    add({
      kind: KIND.narrative,
      origin: 'self',
      data: { ...data, trigger: story.trigger, stability: story.stability, adaptability: story.adaptability, integration },
      text: `我改寫了自己的人生敘事（第 ${version} 版）。原因：${data.reason}\n${data.text}`,
      causes: accepted.story.causes,
    })
  }
  const byId = new Map(goals(life).map((g) => [g.id, g]))
  const goalStatuses: string[] = []
  for (const g of accepted.goals) {
    const status = GOAL_OPS[g.op]
    const goalId = g.op === 'add' ? `g:${randomBytes(4).toString('hex')}` : g.goal
    const data: GoalChangeData = { goalId, text: g.text || byId.get(goalId)?.text || '', status, reason: g.reason }
    add({
      kind: KIND.goalChange,
      origin: 'self',
      data: { ...data, stability: g.stability, adaptability: g.adaptability, integration },
      text: `目標「${data.text}」${GOAL_STATUS_LABEL[status]}。理由：${data.reason}`,
    })
    goalStatuses.push(status)
  }
  for (const d of deferred) {
    const summary = 'op' in d.item ? `${d.item.op}「${d.item.text || d.item.goal}」` : d.item.text
    add({
      kind: PROPOSAL_KIND,
      origin: 'self',
      data: { kind: d.kind, item: d.item, reason: d.reason, integration },
      text: `我考慮過但這次沒有採用的${DEFERRAL_LABEL[d.kind]}修訂（${d.reason}）：${summary.slice(0, 400)}`,
      causes: [...d.item.stability.evidence, ...d.item.adaptability.evidence].filter((id) => life.get(id) !== undefined),
    })
  }
  for (const o of accepted.outdated) {
    const data: OutdatedData = { fact: o.fact, replacedBy: o.replacedBy, evidence: o.evidence }
    add({ kind: OUTDATED_KIND, origin: 'self', data: { ...data, integration }, causes: o.evidence })
  }
  const cited = (accepted.selfRevision?.causes.length ?? 0) + (accepted.story?.causes.length ?? 0)
  const data: IntegrationData = {
    status: 'completed',
    range: [ev.from, ev.to],
    trigger: meta.trigger,
    deep: meta.deep,
    model: meta.model,
    output: meta.output,
    applied: [...applied],
    rejected,
    observables: observe(ev, {
      contradictions: accepted.contradictions.length,
      cited,
      goalOps: goalStatuses,
      adopted: (accepted.selfRevision ? 1 : 0) + (accepted.story ? 1 : 0) + accepted.goals.length,
      deferred: deferred.length,
    }),
  }
  life.append({
    id: integration,
    kind: INTEGRATION_KIND,
    origin: 'self',
    data: { ...data, contradictions: accepted.contradictions, change: accepted.change },
    text: accepted.change ? `我整理了一段時間以來的經歷。${accepted.change}` : undefined,
    causes: applied,
  })
  return { integration, applied }
}
