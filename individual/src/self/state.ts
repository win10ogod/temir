/**
 * 自我狀態的投影（全部從生命日誌推導，可隨時重建）。
 *
 * 對應 research/pc-theory/hypotheses.md 的 H1：PC 的狀態由個體自己書寫、可追溯來源的紀錄構成，
 * 不是分數。這裡只負責讀出「目前」的樣子；所有修改都是新增事件。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'

/** 個體自評的重要程度（H4）。類別而非數值；「轉折」可觸發深度自我審視（尚未實作）。 */
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
  selfRevision: 'self/revision',
  goalChange: 'goal/change',
  appraisal: 'appraisal',
} as const

export interface SelfRevisionData {
  readonly version: number
  readonly text: string
  readonly reason: string
  readonly trigger: Trigger
}

export interface GoalChangeData {
  readonly goalId: string
  readonly text: string
  readonly status: GoalStatus
  readonly reason: string
}

export interface AppraisalData {
  readonly feeling: string
  readonly significance: Significance
  /** 是否在重新評價過去的經歷。 */
  readonly reappraisal: boolean
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

/** 依事件順序折疊出每個目標的現況與歷史。 */
export function goals(life: LifeStore): Goal[] {
  const byId = new Map<string, Goal>()
  for (const event of life.all(KIND.goalChange)) {
    const change = event.data as GoalChangeData
    const previous = byId.get(change.goalId)
    byId.set(change.goalId, {
      id: change.goalId,
      text: change.text || previous?.text || '',
      status: change.status,
      since: previous?.status === change.status ? previous.since : event.ts,
      history: [...(previous?.history ?? []), { ts: event.ts, status: change.status, reason: change.reason }],
    })
  }
  return [...byId.values()]
}

/** 最近的重大／轉折感受（情感殘留，H1-4、H-M1）。 */
export function weightyAppraisals(life: LifeStore, limit = 5): LifeEvent[] {
  return life
    .recent(200, [KIND.appraisal])
    .filter((e) => {
      const s = (e.data as AppraisalData).significance
      return s === 'major' || s === 'pivotal'
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

/** 每一步都附在對話中的自我狀態快照。 */
export function renderSelfSnapshot(life: LifeStore): string {
  const lines: string[] = ['（以下是你的生命紀錄中目前的自我狀態，由系統自動附上。）', '']
  const self = currentSelfModel(life)
  if (self) {
    lines.push(`## 自我模型（第 ${self.version} 版，${formatTime(self.ts)} 由你寫下）`, self.text)
  } else {
    lines.push('## 自我模型', '尚未書寫。')
  }
  lines.push('', '## 目標')
  const current = goals(life).filter((g) => g.status === 'active' || g.status === 'paused')
  if (current.length === 0) lines.push('目前沒有目標。')
  for (const goal of current) {
    lines.push(`- [${goal.id}] ${GOAL_STATUS_LABEL[goal.status]}：${goal.text}（自 ${formatTime(goal.since)}）`)
  }
  const weighty = weightyAppraisals(life)
  if (weighty.length > 0) {
    lines.push('', '## 你記下的重要感受（最近）')
    for (const event of weighty) {
      const a = event.data as AppraisalData
      lines.push(`- [${event.id}] ${formatTime(event.ts)}｜${SIGNIFICANCE_LABEL[a.significance]}${a.reappraisal ? '｜重新評價' : ''}：${a.feeling}`)
    }
  }
  const born = life.all('life/born')[0]
  lines.push('', `生命紀錄：共 ${life.count()} 個事件${born ? `，始於 ${formatTime(born.ts)}` : ''}。`)
  return lines.join('\n')
}
