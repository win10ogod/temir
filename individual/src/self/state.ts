/**
 * 自我狀態的投影（全部從生命日誌推導，可隨時重建）。
 *
 * 對應 research/pc-theory/hypotheses.md 的 H1：PC 的狀態由個體自己書寫、可追溯來源的紀錄構成，
 * 不是分數。這裡只負責讀出「目前」的樣子；所有修改都是新增事件。
 */
import { Projection } from '../life/projection.ts'
import type { LifeEvent, LifeStore } from '../life/store.ts'

/**
 * 舊紀錄的重要程度（H4 的第一版；2026-10-30 之前）。這個 4 級的劃分是我加的，沒有出處；ADR-0008 §2 拿掉了，
 * 改成逐項的強制判斷（keepFeeling、reconsider、gapOnMind）。這裡只為了讀得懂舊紀錄。
 */
export const SIGNIFICANCE = ['daily', 'notable', 'major', 'pivotal'] as const
export type Significance = (typeof SIGNIFICANCE)[number]
export const SIGNIFICANCE_LABEL: Record<Significance, string> = {
  daily: '日常',
  notable: '值得注意',
  major: '重大',
  pivotal: '轉折',
}

/** 修訂的觸發來源（H3）。 */
export const TRIGGERS = ['internal', 'external', 'both'] as const
export type Trigger = (typeof TRIGGERS)[number]

export const GOAL_STATUS = ['active', 'paused', 'abandoned', 'achieved'] as const
export type GoalStatus = (typeof GOAL_STATUS)[number]
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: '進行中',
  paused: '擱置',
  abandoned: '已放棄',
  achieved: '已完成',
}

export const KIND = {
  /** 創造者給予的初始人設（原樣保存）。 */
  persona: 'self/persona',
  selfRevision: 'self/revision',
  narrative: 'self/narrative',
  goalChange: 'goal/change',
  appraisal: 'appraisal',
  /** 價值與看法（H1-2）：個體形成的判斷，連到支持它的經歷。 */
  opinion: 'self/opinion',
} as const

export interface SelfRevisionData {
  readonly version: number
  readonly text: string
  readonly reason: string
  readonly trigger: Trigger
}

/**
 * 初始人設：PC 的初始狀態，由創造者給予。它寫成自我模型（與人生敘事）的第一個版本，之後和其他版本一樣，
 * 可以在循環中被個體修訂（使用者 2026-10-29：「可以給予其初始人設，但這是可在循環中改變的可變項」）。
 */
export interface PersonaData {
  readonly name?: string
  /** 我是誰、在乎什麼、傾向怎麼做。 */
  readonly selfModel: string
  /** 背景故事（可省略）。 */
  readonly story?: string
  readonly source: string
}

/**
 * 生命還沒有任何自我修訂時，把初始人設寫成自我模型第 1 版（與人生敘事第 1 版）；已經有自我修訂就不動，
 * 因為那表示個體已經從起點走開了。回傳寫入的事件 id；沒有寫入時回傳空陣列。
 */
export function applyPersona(life: LifeStore, persona: PersonaData): string[] {
  if (life.latest(KIND.selfRevision) || life.latest(KIND.persona)) return []
  return life.transaction(() => {
    const given = life.append({ kind: KIND.persona, origin: 'body', data: persona, text: `創造者給我的初始人設：${persona.name ? `名字 ${persona.name}。` : ''}${persona.selfModel}` })
    const self = persona.name ? `我的名字是${persona.name}。\n${persona.selfModel}` : persona.selfModel
    const reason = '創造者給予的初始人設：這是我的起點，可以在經歷中改變。'
    const ids = [
      given.id,
      life.append({
        kind: KIND.selfRevision,
        origin: 'self',
        data: { version: 1, text: self, reason, trigger: 'external' } satisfies SelfRevisionData,
        text: `我的自我模型（第 1 版，初始人設）。${self}`,
        causes: [given.id],
      }).id,
    ]
    if (persona.story) {
      ids.push(
        life.append({
          kind: KIND.narrative,
          origin: 'self',
          data: { version: 1, text: persona.story, reason } satisfies NarrativeData,
          text: `我的人生敘事（第 1 版，初始人設）。${persona.story}`,
          causes: [given.id],
        }).id,
      )
    }
    return ids
  })
}

/** 人生敘事（hypotheses.md H-N）：個體用第一人稱寫的「我經歷了什麼、怎麼變成現在這樣」，引用經歷。 */
export interface NarrativeData {
  readonly version: number
  readonly text: string
  readonly reason: string
}

export interface GoalChangeData {
  readonly goalId: string
  readonly text: string
  readonly status: GoalStatus
  readonly reason: string
}

/** 價值與看法的一次變化（H1-2）。看法以 id 串起歷史：持有（新增或改寫）或放下；不設信心分數。 */
export const OPINION_STATUS = ['held', 'dropped'] as const
export type OpinionStatus = (typeof OPINION_STATUS)[number]

export interface OpinionChangeData {
  readonly opinionId: string
  readonly text: string
  readonly status: OpinionStatus
  readonly reason: string
  /** 支持（或促成這次改變）的經歷。 */
  readonly evidence: readonly string[]
}

export interface Opinion {
  readonly id: string
  readonly text: string
  readonly status: OpinionStatus
  readonly since: number
  readonly evidence: readonly string[]
  readonly history: readonly { readonly ts: number; readonly status: OpinionStatus; readonly text: string; readonly reason: string }[]
}

export interface AppraisalData {
  readonly feeling: string
  /** 舊紀錄的重要程度（ADR-0008 之前）。 */
  readonly significance?: Significance
  /** 這段經歷讓個體想現在就重新檢視自己（H4；整合以深度模式提前進行）。舊紀錄以 significance＝pivotal 表示。 */
  readonly reconsider?: boolean
  /** 是否在重新評價過去的經歷。 */
  readonly reappraisal: boolean
}

/** 感受紀錄的標註：舊紀錄的重要程度、讓我想重新檢視自己、重新評價。 */
export function appraisalLabel(a: AppraisalData): string {
  return [a.significance ? SIGNIFICANCE_LABEL[a.significance] : '', a.reconsider ? '讓我想重新檢視自己' : '', a.reappraisal ? '重新評價' : ''].filter(Boolean).join('，')
}

/** 感受紀錄的文字（回憶索引用）。 */
export function appraisalText(a: AppraisalData): string {
  const label = appraisalLabel(a)
  return `我的感受${label ? `（${label}）` : ''}：${a.feeling}`
}

/** 這段感受是否讓個體想重新檢視自己（新紀錄的 reconsider；舊紀錄的「轉折」）。 */
export function asksToReconsider(a: AppraisalData): boolean {
  return a.reconsider === true || a.significance === 'pivotal'
}

export interface Goal {
  readonly id: string
  readonly text: string
  readonly status: GoalStatus
  readonly since: number
  readonly history: readonly { readonly ts: number; readonly status: GoalStatus; readonly reason: string }[]
}

export function currentSelfModel(life: LifeStore): (SelfRevisionData & { readonly ts: number; readonly eventId: string }) | undefined {
  const event = life.latest(KIND.selfRevision)
  if (!event) return undefined
  return { ...(event.data as SelfRevisionData), ts: event.ts, eventId: event.id }
}

export function currentNarrative(life: LifeStore): (NarrativeData & { readonly ts: number; readonly eventId: string }) | undefined {
  const event = life.latest(KIND.narrative)
  if (!event) return undefined
  return { ...(event.data as NarrativeData), ts: event.ts, eventId: event.id }
}

/** 目標的增量折疊（life/projection.ts；改進清單第 7 項）：每一步都要讀，原本每次全表讀取。 */
const GOALS = new Projection<Map<string, Goal>>(
  [KIND.goalChange],
  () => new Map(),
  (byId, event) => {
    const change = event.data as GoalChangeData
    const previous = byId.get(change.goalId)
    byId.set(change.goalId, {
      id: change.goalId,
      text: change.text || previous?.text || '',
      status: change.status,
      since: previous?.status === change.status ? previous.since : event.ts,
      history: [...(previous?.history ?? []), { ts: event.ts, status: change.status, reason: change.reason }],
    })
  },
)

/** 依事件順序折疊出每個目標的現況與歷史。 */
export function goals(life: LifeStore): Goal[] {
  return [...GOALS.of(life).values()]
}

/** 看法的增量折疊（與目標相同的做法）。 */
const OPINIONS = new Projection<Map<string, Opinion>>(
  [KIND.opinion],
  () => new Map(),
  (byId, event) => {
    const change = event.data as OpinionChangeData
    const previous = byId.get(change.opinionId)
    const text = change.text || previous?.text || ''
    byId.set(change.opinionId, {
      id: change.opinionId,
      text,
      status: change.status,
      since: event.ts,
      evidence: change.evidence.length > 0 ? change.evidence : (previous?.evidence ?? []),
      history: [...(previous?.history ?? []), { ts: event.ts, status: change.status, text, reason: change.reason }],
    })
  },
)

/** 依事件順序折疊出每個看法的現況與歷史（與 goals 相同的做法）。 */
export function opinions(life: LifeStore): Opinion[] {
  return [...OPINIONS.of(life).values()]
}

/**
 * 最近記下的感受（情感殘留，H1-4、H-M1）。新紀錄都是個體決定要記下的（keepFeeling，ADR-0008 §2）；
 * 舊紀錄照原本的規則，只列重大與轉折。
 */
export function weightyAppraisals(life: LifeStore, limit = 5): LifeEvent[] {
  return life
    .recent(200, [KIND.appraisal])
    .filter((e) => {
      const s = (e.data as AppraisalData).significance
      return s === undefined || s === 'major' || s === 'pivotal'
    })
    .slice(0, limit)
}

const dateFormat = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatTime(ts: number): string {
  return dateFormat.format(new Date(ts))
}

const dayFormat = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })

export function formatDay(ts: number): string {
  return dayFormat.format(new Date(ts))
}

const weekdayFormat = new Intl.DateTimeFormat('zh-TW', { weekday: 'long' })

/** 「2026/07/31 20:30（星期五）」。 */
export function formatNow(ts: number): string {
  return `${formatTime(ts)}（${weekdayFormat.format(new Date(ts))}）`
}

/** 這個版本是誰寫的：源自初始人設（創造者給予），或個體自己寫下。 */
function authorship(life: LifeStore, eventId: string): string {
  const fromPersona = life.get(eventId)?.causes.some((id) => life.get(id)?.kind === KIND.persona)
  return fromPersona ? '初始人設，由創造你的人給予' : '由你寫下'
}

/** 每一步都附在對話中的自我狀態快照。 */
/**
 * extra：附在快照最後、生命紀錄統計之前的其他小節（例如 self/energy.ts 的「懸著的事」）。
 * 最後一行是「現在」：記憶都有時間，個體卻不知道現在幾點，就無法感覺時間的經過。
 * e2e（2026-10-29）中，被問到今天的日期時，個體的思考寫著「我手上沒有可信的當前時間來源」，只能去執行 date。
 */
export function renderSelfSnapshot(life: LifeStore, extra: readonly string[] = [], now = Date.now()): string {
  const lines: string[] = ['（以下是你的生命紀錄中目前的自我狀態，由系統自動附上。）', '']
  const self = currentSelfModel(life)
  if (self) {
    lines.push(`## 自我模型（第 ${self.version} 版，${formatTime(self.ts)}，${authorship(life, self.eventId)}）`, self.text)
  } else {
    lines.push('## 自我模型', '尚未書寫。')
  }
  const story = currentNarrative(life)
  lines.push(
    '',
    story ? `## 我的故事（第 ${story.version} 版，${formatTime(story.ts)}，${authorship(life, story.eventId)}）` : '## 我的故事',
    story ? story.text : '尚未書寫。',
  )
  lines.push('', '## 目標')
  const current = goals(life).filter((g) => g.status === 'active' || g.status === 'paused')
  if (current.length === 0) lines.push('目前沒有目標。')
  for (const goal of current) {
    lines.push(`- [${goal.id}] ${GOAL_STATUS_LABEL[goal.status]}：${goal.text}（自 ${formatTime(goal.since)}）`)
  }
  const held = opinions(life)
    .filter((o) => o.status === 'held')
    .sort((a, b) => a.since - b.since)
  if (held.length > 0) {
    const shown = held.slice(-8)
    lines.push('', `## 我的看法${held.length > shown.length ? `（較早的 ${held.length - shown.length} 條沒有列出）` : ''}`)
    for (const o of shown) lines.push(`- [${o.id}] ${o.text}（${formatTime(o.since)}）`)
  }
  const weighty = weightyAppraisals(life)
  if (weighty.length > 0) {
    lines.push('', '## 你記下的感受（最近）')
    for (const event of weighty) {
      const a = event.data as AppraisalData
      const label = appraisalLabel(a)
      lines.push(`- [${event.id}] ${formatTime(event.ts)}${label ? `｜${label}` : ''}：${a.feeling}`)
    }
  }
  lines.push(...extra)
  const born = life.after(0, ['life/born'], 1)[0]
  lines.push('', `生命紀錄：共 ${life.count()} 個事件${born ? `，始於 ${formatTime(born.ts)}` : ''}。現在是 ${formatNow(now)}。`)
  return lines.join('\n')
}
