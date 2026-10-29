/**
 * E 中的能量：動能與勢能（hypotheses.md H-E；使用者 2026-10-29：「能量在理論中代表的是動能與勢能」）。
 *
 * 只從既有紀錄推導，不計算任何數值，也不設門檻。
 *
 * 勢能＝儲存著、還沒有釋放的推動力（「懸著的事」）。每一件都有穩定的 key：
 * - `contradiction:<整合 id>#<序號>`：最近一次整合寫下的未解矛盾。每次整合都重新判斷哪些還沒解開，所以只算最近一次。
 * - `proposal:<事件 id>`：最近一次整合沒有採用、保留下來的修訂提案。
 * - `left:<事件 id>`：事後比對寫下「行動留下的懸念」（答應了還沒做的事、在等的回答、新的不安）。
 * - `surprise:<事件 id>`：結果和預期完全不一樣的經歷（事後比對 matched＝no）。
 * - `intention:<事件 id>`：閒置時的念頭留下的打算（下次想對對方做的事）。
 * 進行中的目標也是勢能，已經列在快照的「目標」一節，這裡不重複。
 *
 * 動能＝此刻推動這次循環的是什麼。行動前的思考寫下 drive，以及被觸發的是哪幾件（rd/decision.activated）。
 *
 * 轉換：勢能被釋放之後就不再列出。釋放只能由個體自己判斷，有三個地方：
 * - 事後比對（rd/outcome.releasedItems）；
 * - 閒置時的念頭（self/thought.releasedItems）；
 * - 整合期（self/integration.released）。
 * 第一版（v3 實驗）的懸念在每次整合後一律消失，也不記得是哪件被釋放；v3 中懸念 95–100% 的回合都有，
 * 「懸著的事」總是滿的。第二版改成懸著直到個體自己釋放，並收緊「懸念」的定義（見 rd/aux.ts）。
 */
import type { LifeEvent, LifeStore } from '../life/store.ts'
import { carriedOver } from '../integrate/carried.ts'
import { OUTCOME_KIND, type OutcomeData } from '../rd/memory.ts'
import { clip } from '../recall/retrieve.ts'
import { formatTime } from './state.ts'

/** 閒置時的念頭（H0 的內部刺激；individual/src/thought）。 */
export const THOUGHT_KIND = 'self/thought'

export type PotentialKind = 'contradiction' | 'proposal' | 'left' | 'surprise' | 'intention'

export interface PotentialItem {
  readonly key: string
  readonly kind: PotentialKind
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

/** 個體自己釋放過的勢能。 */
export function releasedKeys(life: LifeStore): Set<string> {
  const keys = new Set<string>()
  for (const e of life.all(OUTCOME_KIND)) for (const k of (e.data as OutcomeData).releasedItems ?? []) keys.add(k)
  for (const e of life.all(THOUGHT_KIND)) for (const k of (e.data as ThoughtData).releasedItems ?? []) keys.add(k)
  for (const e of life.all('self/integration')) for (const r of (e.data as { released?: readonly { key: string }[] }).released ?? []) keys.add(r.key)
  return keys
}

/** 目前懸著的事，依時間先後。 */
export function potentialItems(life: LifeStore): PotentialItem[] {
  const released = releasedKeys(life)
  const items: PotentialItem[] = []
  const { integration, contradictions, proposals } = carriedOver(life)
  const from = (e: LifeEvent) => ({ ts: e.ts, source: e.id, seq: e.seq })
  if (integration) {
    contradictions.forEach((text, i) => items.push({ key: `contradiction:${integration.id}#${i}`, kind: 'contradiction', text, ...from(integration) }))
  }
  for (const e of proposals) items.push({ key: `proposal:${e.id}`, kind: 'proposal', text: e.text ?? '', ...from(e) })
  for (const e of life.all(OUTCOME_KIND)) {
    const o = e.data as OutcomeData
    if (o.left) items.push({ key: `left:${e.id}`, kind: 'left', text: o.left, ...from(e) })
    if (o.matched === 'no') items.push({ key: `surprise:${e.id}`, kind: 'surprise', text: o.error || o.actual, ...from(e) })
  }
  for (const e of life.all(THOUGHT_KIND)) {
    const t = e.data as ThoughtData
    if (t.intention) items.push({ key: `intention:${e.id}`, kind: 'intention', text: t.intention, ...from(e) })
  }
  // 依來源事件的先後（Array.prototype.sort 是穩定的：同一個事件的多件事維持原本的順序）。
  return items.filter((i) => !released.has(i.key)).sort((a, b) => a.seq - b.seq)
}

/** 輔助呼叫中的編號：P1、P2……對應到 key，讓模型能指名是哪一件。 */
export function labelPotential(items: readonly PotentialItem[]): Map<string, string> {
  return new Map(items.map((item, i) => [`P${i + 1}`, item.key]))
}

/**
 * 「懸著的事」一節；沒有就回傳空陣列。
 * labels＝輔助呼叫用：每件前面加上 P 編號，最多列 limit 件。給主模型的快照不加編號，只列最近的 limit 件。
 */
export function renderPotential(life: LifeStore, options: { readonly labels?: boolean; readonly limit?: number } = {}): string[] {
  const items = potentialItems(life)
  if (items.length === 0) return []
  const limit = options.limit ?? (options.labels ? 12 : 8)
  const shown = items.slice(-limit)
  const offset = items.length - shown.length
  const lines = ['', `## 懸著的事（勢能：儲存著、還沒有釋放的推動力；進行中的目標見上${offset > 0 ? `；較早的 ${offset} 件沒有列出` : ''}）`]
  shown.forEach((item, i) => {
    const label = options.labels ? `[P${offset + i + 1}] ` : ''
    lines.push(`- ${label}${KIND_LABEL[item.kind]}（${formatTime(item.ts)}）：${clip(item.text, 160)}`)
  })
  return lines
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
  return text.replace(/\bP(\d+)\b/gu, (label) => {
    const item = byKey.get(labels.get(label) ?? '')
    return item ? `「${clip(item.text, 30)}」` : label
  })
}

/** 某個事件之後，被釋放的那幾件事的說明（狀態檢視用）。 */
export function describeKeys(life: LifeStore, keys: readonly string[]): string[] {
  return keys.map((key) => {
    const [kind, rest = ''] = key.split(/:(.*)/su)
    const id = rest.replace(/#\d+$/u, '')
    const event: LifeEvent | undefined = kind === 'goal' ? undefined : life.get(id)
    return `${KIND_LABEL[kind as PotentialKind] ?? (kind === 'goal' ? '目標' : kind)}${event ? `（${formatTime(event.ts)}）` : ''}`
  })
}
