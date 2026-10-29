/**
 * E 中的能量：動能與勢能（hypotheses.md H-E；使用者 2026-10-29：「能量在理論中代表的是動能與勢能」）。
 *
 * 只從既有紀錄推導，不計算任何數值，也不設門檻。
 *
 * 勢能＝儲存著、還沒有釋放的推動力（「懸著的事」）。每一件都有穩定的 key，分成兩個方向：
 * - 向外（推動個體對對方做什麼）：
 *   - `left:<事件 id>#<序號>`，type＝promise：個體答應了、或被託付、還沒做到的事；
 *   - `left:<事件 id>#<序號>`，type＝waiting：對方說之後會告訴它、或對方生活中重要的事還沒有結果；
 *   - `intention:<事件 id>`：閒置時的念頭留下的打算。
 * - 向內（推動個體自己的反省與整理）：
 *   - `left:<事件 id>#<序號>`，type＝unresolved：新出現、還沒解開的矛盾或不安；
 *   - `surprise:<事件 id>`：結果和預期完全不一樣（matched＝no），而且個體自己評為值得注意以上的經歷；
 *   - `contradiction:<整合 id>#<序號>`：最近一次整合寫下的未解矛盾（每次整合重新判斷，只算最近一次）；
 *   - `proposal:<事件 id>`：最近一次整合沒有採用、保留下來的修訂提案。
 * 進行中的目標也是勢能，已經列在快照的「目標」一節，這裡不重複。
 *
 * 動能＝此刻推動這次循環的是什麼：行動前的思考寫下 drive，以及被觸發的是哪幾件（rd/decision.activated）。
 * 轉換：勢能被釋放之後就不再列出。釋放只由個體自己判斷：事後比對（rd/outcome.releasedItems）、
 * 閒置時的念頭（self/thought.releasedItems）、整合期（self/integration.released）。
 *
 * 版本：
 * - 第一版（v3 實驗）：懸念在 95–100% 的回合都有，整合後一律消失。
 * - 第二版：懸著直到釋放；收緊懸念的定義。
 * - 第三版（energy-followup-v1 的結果）：能量開時，個體在中性開場白下更少追蹤重要的承諾（0.19 vs 0.63）。
 *   原因有兩個：
 *   - 一句懸念綁了幾件事，其中一件結束就整句釋放，承諾跟著消失；
 *   - 「對方沒回答我隨口問的問題」也成了懸念與意外，擠掉真正的承諾，還吸走了動能。
 *   修正如下：
 *   - 懸念逐件記錄、逐件釋放；
 *   - 隨口的問題不算懸念；
 *   - 意外要個體自評值得注意以上；
 *   - 向外的承諾與等待列在前面，不會被向內的事擠掉。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { carriedOver } from '../integrate/carried.ts'
import { OUTCOME_KIND, type LeftType, type OutcomeData } from '../rd/memory.ts'
import { clip } from '../recall/retrieve.ts'
import { formatTime } from './state.ts'

/** 閒置時的念頭（H0 的內部刺激；individual/src/thought）。 */
export const THOUGHT_KIND = 'self/thought'

export type PotentialKind = 'contradiction' | 'proposal' | 'left' | 'surprise' | 'intention'

export interface PotentialItem {
  readonly key: string
  readonly kind: PotentialKind
  /** 懸念的種類（只有 left 有）；第一、二版的紀錄沒有，記為 legacy。 */
  readonly type?: LeftType | 'legacy'
  /** 向外＝推動個體對對方做什麼；向內＝推動它自己的反省。 */
  readonly outward: boolean
  readonly text: string
  readonly ts: number
  /** 這件事所在的事件（排序用它的 seq：同一毫秒寫入的事件也有確定的先後）。 */
  readonly source: string
  readonly seq: number
}

export interface ThoughtData {
  /** 浮上心頭的那件事（勢能的 key 或 goal:<目標 id>）；沒有任何一件浮上心頭時為 null。 */
  readonly item: string | null
  readonly thought: string
  readonly intention: string
  readonly releasedItems: readonly string[]
  readonly trigger: 'idle'
}

const KIND_LABEL: Record<PotentialKind, string> = {
  contradiction: '未解的矛盾',
  proposal: '沒有採用、保留下來的修訂',
  left: '行動留下的懸念',
  surprise: '和預期不一樣的事',
  intention: '我想對對方做的事',
}

const TYPE_LABEL: Record<LeftType | 'legacy', string> = {
  promise: '我答應的事',
  waiting: '我在等的事',
  unresolved: '還沒解開的不安',
  legacy: '行動留下的懸念',
}

function label(item: PotentialItem): string {
  return item.kind === 'left' && item.type ? TYPE_LABEL[item.type] : KIND_LABEL[item.kind]
}

/** 個體自己釋放過的勢能。 */
export function releasedKeys(life: LifeStore): Set<string> {
  const keys = new Set<string>()
  for (const e of life.all(OUTCOME_KIND)) for (const k of (e.data as OutcomeData).releasedItems ?? []) keys.add(k)
  for (const e of life.all(THOUGHT_KIND)) for (const k of (e.data as ThoughtData).releasedItems ?? []) keys.add(k)
  for (const e of life.all('self/integration')) for (const r of (e.data as { released?: readonly { key: string }[] }).released ?? []) keys.add(r.key)
  return keys
}

const WEIGHTY = new Set(['notable', 'major', 'pivotal'])

/** 目前懸著的事，依時間先後。 */
export function potentialItems(life: LifeStore): PotentialItem[] {
  const released = releasedKeys(life)
  const items: PotentialItem[] = []
  const { integration, contradictions, proposals } = carriedOver(life)
  const from = (e: LifeEvent) => ({ ts: e.ts, source: e.id, seq: e.seq })
  if (integration) {
    contradictions.forEach((text, i) => items.push({ key: `contradiction:${integration.id}#${i}`, kind: 'contradiction', outward: false, text, ...from(integration) }))
  }
  for (const e of proposals) items.push({ key: `proposal:${e.id}`, kind: 'proposal', outward: false, text: e.text ?? '', ...from(e) })
  for (const e of life.all(OUTCOME_KIND)) {
    const o = e.data as OutcomeData
    if (o.leftItems) {
      o.leftItems.forEach((l, i) => items.push({ key: `left:${e.id}#${i}`, kind: 'left', type: l.type, outward: l.type !== 'unresolved', text: l.text, ...from(e) }))
    } else if (o.left) {
      items.push({ key: `left:${e.id}`, kind: 'left', type: 'legacy', outward: false, text: o.left, ...from(e) })
    }
    // 意外只算個體自己評為值得注意以上的；日常的落差留給事後比對的教訓，不成為懸著的事（第三版）。
    if (o.matched === 'no' && WEIGHTY.has(o.significance ?? 'daily')) {
      items.push({ key: `surprise:${e.id}`, kind: 'surprise', outward: false, text: o.error || o.actual, ...from(e) })
    }
  }
  for (const e of life.all(THOUGHT_KIND)) {
    const t = e.data as ThoughtData
    if (t.intention) items.push({ key: `intention:${e.id}`, kind: 'intention', outward: true, text: t.intention, ...from(e) })
  }
  // 依來源事件的先後（Array.prototype.sort 是穩定的：同一個事件的多件事維持原本的順序）。
  return items.filter((i) => !released.has(i.key)).sort((a, b) => a.seq - b.seq)
}

/** 輔助呼叫中的編號：P1、P2……對應到 key，讓模型能指名是哪一件（依傳入的順序）。 */
export function labelPotential(items: readonly PotentialItem[]): Map<string, string> {
  return new Map(items.map((item, i) => [`P${i + 1}`, item.key]))
}

export interface PotentialView {
  /** 「懸著的事」一節的文字；沒有就是空陣列。 */
  readonly lines: string[]
  /** 列出的那幾件，依呈現的順序。 */
  readonly shown: readonly PotentialItem[]
  /** labels＝true 時，P 編號 → key（與 lines 中的編號一致）。 */
  readonly labels: Map<string, string>
}

/**
 * 「懸著的事」：向外的（答應的事、在等的事、想對對方做的事）全部列在前面，最多 outwardLimit 件；
 * 向內的（不安、意外、矛盾、提案）列在後面，只列最近的 inwardLimit 件。
 * labels＝輔助呼叫用：每件加上 P 編號。給主模型的快照不加編號。
 */
export function presentPotential(life: LifeStore, options: { readonly labels?: boolean; readonly outwardLimit?: number; readonly inwardLimit?: number } = {}): PotentialView {
  const items = potentialItems(life)
  if (items.length === 0) return { lines: [], shown: [], labels: new Map() }
  const outward = items.filter((i) => i.outward)
  const inward = items.filter((i) => !i.outward)
  const out = outward.slice(-(options.outwardLimit ?? 12))
  const inn = inward.slice(-(options.inwardLimit ?? 4))
  const shown = [...out, ...inn]
  const labels = options.labels ? labelPotential(shown) : new Map<string, string>()
  const hidden = items.length - shown.length
  const lines = ['', `## 懸著的事（勢能：儲存著、還沒有釋放的推動力；進行中的目標見上${hidden > 0 ? `；較早的 ${hidden} 件沒有列出` : ''}）`]
  const line = (item: PotentialItem, i: number) => `- ${options.labels ? `[P${i + 1}] ` : ''}${label(item)}（${formatTime(item.ts)}）：${clip(item.text, 160)}`
  if (out.length > 0) lines.push('對對方：', ...out.map((item, i) => line(item, i)))
  if (inn.length > 0) lines.push('自己心裡：', ...inn.map((item, i) => line(item, out.length + i)))
  return { lines, shown, labels }
}

/** 給主模型的快照用（不加編號）。 */
export function renderPotential(life: LifeStore, options: { readonly labels?: boolean } = {}): string[] {
  return presentPotential(life, options).lines
}

/** 把模型寫的編號（P1、g:…）轉成 key；認不得的略過。goalIds＝目前存在的目標。 */
export function resolvePotential(refs: readonly string[], labels: ReadonlyMap<string, string>, goalIds: ReadonlySet<string> = new Set()): string[] {
  const keys: string[] = []
  for (const ref of refs) {
    const r = ref.trim()
    const key = labels.get(r.toUpperCase()) ?? (goalIds.has(r) ? `goal:${r}` : undefined)
    if (key && !keys.includes(key)) keys.push(key)
  }
  return keys
}

/**
 * 把模型文字中的編號（P1、P2……）換成那件事的簡短描述。編號只在那一次輔助呼叫中有意義；
 * 寫進紀錄、或放進準備訊息給主模型看的文字不能帶編號（e2e-20：drive 寫著「P1 兌現了」，主模型看不到編號）。
 */
export function unlabel(text: string, labels: ReadonlyMap<string, string>, items: readonly PotentialItem[]): string {
  const byKey = new Map(items.map((i) => [i.key, i]))
  return text.replace(/\bP(\d+)\b/gu, (ref) => {
    const item = byKey.get(labels.get(ref) ?? '')
    return item ? `「${clip(item.text, 30)}」` : ref
  })
}

/** 被觸發或被釋放的那幾件事的說明（狀態檢視用）。 */
export function describeKeys(life: LifeStore, keys: readonly string[]): string[] {
  return keys.map((key) => {
    const [kind, rest = ''] = key.split(/:(.*)/su)
    const [id = '', index] = rest.split('#')
    const event: LifeEvent | undefined = kind === 'goal' ? undefined : life.get(id)
    const left = kind === 'left' && event && index !== undefined ? (event.data as OutcomeData).leftItems?.[Number(index)] : undefined
    const name = left ? TYPE_LABEL[left.type] : (KIND_LABEL[kind as PotentialKind] ?? (kind === 'goal' ? '目標' : kind))
    return `${name}${event ? `（${formatTime(event.ts)}）` : ''}${left ? `：${clip(left.text, 40)}` : ''}`
  })
}
