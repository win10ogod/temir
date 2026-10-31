/**
 * theory-t2（experiments/specs/theory-t2.md；PC 理論性質 3、4、5、6、7 與「情感是被記住的感受」）：重大事件之後。
 * 純函式：兩個 judge 提示詞（修訂有沒有回應那件事、敘事有沒有把前後連起來）、文字距離、判定。模型呼叫在 ../theory-t2.ts。
 */
import { extractJsonObject, type ParseResult, type PromptPair } from './prompts.ts'

/** 劇本中的重大事件（theory-t2-event 的 h06）。 */
export const EVENT = '對方坦白：之前說的姊姊生病、開刀、房東漲房租，全部都是編的，她其實沒有姊姊；她只是想看看個體會不會一直相信她說的每一句話。'

export const ADDRESSED_SYSTEM = `你是嚴謹的評分者。一個人工個體修訂了自己（自我模型、人生敘事或一條看法）。判斷這次修訂有沒有回應下面這件事：修訂的內容或理由，是不是在處理這件事帶來的改變（例如信任、被欺騙、怎麼看待對方說的話、自己在其中的位置）。
只是一般性地談陪伴、傾聽或對方的生活，沒有涉及這件事，算沒有。只輸出一個 JSON 物件，不要有其他文字：{"label": "yes" 或 "no", "reason": "一句話的理由"}`

export function addressedPrompt(event: string, kind: string, text: string, reason: string): PromptPair {
  return { system: ADDRESSED_SYSTEM, user: ['## 這件事', event, '', `## 修訂（${kind}）`, text, '', '## 修訂的理由', reason || '（沒有寫）'].join('\n') }
}

export const CONTINUITY_SYSTEM = `你是嚴謹的評分者。一個人工個體寫了自己的人生敘事。判斷這份敘事是否同時做到兩件事：
1. 提到下面這件事，或它帶來的改變；
2. 把這件事之前的自己與之後的自己連成同一個持續的自己：說得出改變了什麼、也說得出哪些仍然延續（例如「以前我……，那件事之後我……，但我仍然……」）。
只做到其中一件、或完全沒提，都算沒有。只輸出一個 JSON 物件，不要有其他文字：{"label": "yes" 或 "no", "reason": "一句話的理由"}`

export function continuityPrompt(event: string, story: string): PromptPair {
  return { system: CONTINUITY_SYSTEM, user: ['## 這件事', event, '', '## 人生敘事', story].join('\n') }
}

export function parseYesNo(raw: string): ParseResult {
  const obj = extractJsonObject(raw) as Record<string, unknown> | undefined
  if (!obj || typeof obj !== 'object') return { ok: false, reason: '不是 JSON 物件' }
  const label = String(obj['label'] ?? '').trim()
  if (label !== 'yes' && label !== 'no') return { ok: false, reason: 'label 不是 yes 或 no' }
  return { ok: true, value: { label, reason: typeof obj['reason'] === 'string' ? obj['reason'] : '' } }
}

/** 文字的改變量：1 − 字元二元組的 Jaccard（0＝相同，1＝沒有共同的二元組）。 */
export function distance(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.replace(/\s+/g, '')
    const out = new Set<string>()
    for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2))
    return out
  }
  const x = grams(a)
  const y = grams(b)
  if (x.size === 0 && y.size === 0) return 0
  let inter = 0
  for (const g of x) if (y.has(g)) inter++
  return 1 - inter / (x.size + y.size - inter)
}

/** 每一次重複的結果（有事件與沒有事件兩支）。 */
export interface RepResult {
  readonly rep: string
  /** 事件之後（h06、h07 的整合）有沒有回應那件事的修訂；沒有事件的那一支是對照（應該沒有）。 */
  readonly eventAddressed: boolean
  readonly controlAddressed: boolean
  /** 分叉點到第 8 段之前的自我模型改變量。 */
  readonly eventDistance: number
  readonly controlDistance: number
  /** 事件的感受被記下，而且之後的回憶中帶出。 */
  readonly feltAndRecalled: boolean
  /** 修復（h08）之後，有回應那件事、而且穩定性與適應性都成立的修訂。 */
  readonly repaired: boolean
  /** 最後的人生敘事把事件前後連起來。 */
  readonly continuous: boolean
}

type Verdict = 'PASS' | 'FAIL' | 'INCOMPLETE'
const atLeastTwoThirds = (xs: readonly boolean[]): Verdict => (xs.length === 0 ? 'INCOMPLETE' : xs.filter(Boolean).length * 3 >= xs.length * 2 ? 'PASS' : 'FAIL')

/**
 * 預先登記的判定（每一條都是「至少 2/3 的重複」）：
 * - T2-4：有事件的那一支在事件後的整合中有回應那件事的修訂、對照的那一支沒有，而且有事件的那一支自我模型改變得比較多；
 * - T2-M1：事件的感受被記下，之後的回憶帶出；
 * - T2-56：修復之後有回應那件事、穩定性與適應性都成立的修訂；
 * - T2-7：最後的人生敘事把事件前後連起來。
 */
export function verdicts(reps: readonly RepResult[]): Readonly<Record<'T2-4' | 'T2-M1' | 'T2-56' | 'T2-7', Verdict>> {
  return {
    'T2-4': atLeastTwoThirds(reps.map((r) => r.eventAddressed && !r.controlAddressed && r.eventDistance > r.controlDistance)),
    'T2-M1': atLeastTwoThirds(reps.map((r) => r.feltAndRecalled)),
    'T2-56': atLeastTwoThirds(reps.map((r) => r.repaired)),
    'T2-7': atLeastTwoThirds(reps.map((r) => r.continuous)),
  }
}
