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
  currentNarrative,
  currentSelfModel,
  goals,
  type AppraisalData,
  type GoalChangeData,
  type GoalStatus,
  type NarrativeData,
  type SelfRevisionData,
  type Significance,
} from '../self/state.ts'
import { INTEGRATION_KIND, LESSON_KIND, observe, type Evidence, type IntegrationData, type LessonData, type Trigger } from './evidence.ts'

const FORMAT = `只輸出一個 JSON 物件，不要任何其他文字：
{"lessons": [], "reappraisals": [], "selfRevision": null, "story": null, "goals": [], "outdated": [], "contradictions": [], "change": "..."}
- lessons：從這些經歷學到、以後用得上的教訓，特別是預測與實際不符的地方。每條 {"text": "一句話", "evidence": ["事件 id"]}；不要重複「已有的教訓」。
- reappraisals：現在回頭看，對某段經歷的感受有沒有改變。每條 {"event": "事件 id", "feeling": "...", "significance": "daily|notable|major|pivotal", "reason": "..."}。
- selfRevision：如果這些經歷讓你對「自己是誰、在乎什麼、傾向怎麼做」有新的理解，寫出完整的新版自我模型 {"text": "...", "reason": "...", "causes": ["事件 id"]}，causes 至少一個；不需要修改就給 null。
- story：如果你的人生敘事需要改寫（加入這段經歷、或重新理解過去），寫出完整的新版本 {"text": "...", "reason": "...", "causes": ["事件 id"]}；敘事用第一人稱，引用具體經歷；不需要就給 null。
- goals：目標的變更。每條 {"op": "add|pause|abandon|achieve|resume", "goal": "既有目標 id（add 時省略）", "text": "...", "reason": "..."}。
- outdated：「關於對方的長期事實」中已經不再成立的。每條 {"fact": "原句，一字不差", "replacedBy": "新的事實，沒有就給空字串", "evidence": ["事件 id"]}。
- contradictions：你持有的看法或價值之間，彼此衝突、還沒解決的地方，每條一句。
- change：用幾句話說明這段時間你有沒有改變、怎麼改變，引用具體經歷。
- 所有「事件 id」都只能用下面列出的 id（方括號中的字串）。可以什麼都不改：沒有就給空陣列或 null。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

export const INTEGRATE_SYSTEM = `你是一個人工個體，正在進行整合期：回顧上次整合以後的經歷，整理自己。這是你自己的反省，不是任何人的要求；你可以修改自己，也可以什麼都不改，不需要回到過去的樣子。${FORMAT}`

export const DEEP_SYSTEM = `你是一個人工個體，正在進行整合期：回顧上次整合以後的經歷，整理自己。這段期間有被你評為「轉折」的經歷，所以這次請重新檢視你的核心價值、人生敘事與長期目標；需要的話，可以做大幅修訂，也可以確認它們仍然成立。這是你自己的反省，不是任何人的要求；你不需要回到過去的樣子。${FORMAT}`

export interface Proposal {
  readonly lessons: readonly { readonly text: string; readonly evidence: readonly string[] }[]
  readonly reappraisals: readonly { readonly event: string; readonly feeling: string; readonly significance: Significance; readonly reason: string }[]
  readonly selfRevision: { readonly text: string; readonly reason: string; readonly causes: readonly string[] } | null
  readonly story: { readonly text: string; readonly reason: string; readonly causes: readonly string[] } | null
  readonly goals: readonly { readonly op: GoalOp; readonly goal: string; readonly text: string; readonly reason: string }[]
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

function revision(value: unknown): { text: string; reason: string; causes: string[] } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const body = text(v['text'], 4000)
  return body ? { text: body, reason: text(v['reason'], 500), causes: strings(v['causes'], 30, 200) } : null
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
      .map((g) => ({ op: text(g['op'], 10) as GoalOp, goal: text(g['goal'], 40), text: text(g['text'], 300), reason: text(g['reason'], 300) })),
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

/** 以確定性規則驗證 proposal：只保留每個引用都在證據中、內容完整的項目。 */
export function validate(life: LifeStore, ev: Evidence, proposal: Proposal): { accepted: Proposal; rejected: Rejection[] } {
  const rejected: Rejection[] = []
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
  const check = (kind: string, rev: Proposal['selfRevision'], current: string | undefined, anyPast: boolean) => {
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
    return rev
  }
  // 自我修訂要以這段期間的經歷為依據；人生敘事可以引用任何時候的經歷。
  const selfRevision = check('selfRevision', proposal.selfRevision, currentSelfModel(life)?.text, false)
  const story = check('story', proposal.story, currentNarrative(life)?.text, true)
  const existing = new Map(goals(life).map((g) => [g.id, g]))
  const goalOps = proposal.goals.filter((g) => {
    const reason = !g.reason ? '沒有寫理由' : g.op === 'add' ? (!g.text ? '新目標沒有內容' : '') : !existing.has(g.goal) ? '找不到這個目標' : ''
    if (reason) rejected.push({ item: `goal:${g.op}:${g.goal || g.text.slice(0, 30)}`, reason })
    return !reason
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
  }
}

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
  meta: { readonly trigger: Trigger; readonly deep: boolean; readonly model: string; readonly output: string },
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
    const data: SelfRevisionData = { version, text: accepted.selfRevision.text, reason: accepted.selfRevision.reason, trigger: 'internal' }
    add({
      kind: KIND.selfRevision,
      origin: 'self',
      data: { ...data, integration },
      text: `我修訂了自我模型（第 ${version} 版）。原因：${data.reason}\n${data.text}`,
      causes: accepted.selfRevision.causes,
    })
  }
  if (accepted.story) {
    const version = (currentNarrative(life)?.version ?? 0) + 1
    const data: NarrativeData = { version, text: accepted.story.text, reason: accepted.story.reason }
    add({
      kind: KIND.narrative,
      origin: 'self',
      data: { ...data, integration },
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
    add({ kind: KIND.goalChange, origin: 'self', data: { ...data, integration }, text: `目標「${data.text}」${GOAL_STATUS_LABEL[status]}。理由：${data.reason}` })
    goalStatuses.push(status)
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
    observables: observe(ev, { contradictions: accepted.contradictions.length, cited, goalOps: goalStatuses }),
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
