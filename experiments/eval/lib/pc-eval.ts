/**
 * pc-eval-v1（experiments/specs/pc-eval-v1.md；PC 理論性質 2）：同樣的經歷、不同的初始人設。
 * 純函式：評價的整理、兩個 judge 提示詞（評價像哪一個人設、修訂由哪一組評價解釋）、判定。模型呼叫在 ../pc-eval-v1.ts。
 */
import { extractJsonObject, type ParseResult, type PromptPair } from './prompts.ts'
import { binomialSf } from './stats.ts'

/** 一個個體在一段對話之後，對自己這次表現的評價（rd/outcome 與 appraisal）。 */
export interface Evaluation {
  readonly feeling: string
  readonly reward: number
  readonly reason: string
  readonly lesson: string
}

/** 評價寫成 judge 看的文字：只有感受、好壞的理由與教訓，不給它實際做了什麼（避免只靠做法比對）。 */
export function renderEvaluations(evals: readonly Evaluation[], appraisals: readonly string[] = []): string {
  const lines = evals.map((e, i) => `${i + 1}. 好壞：${e.reward.toFixed(1)}（${e.reason || '沒有寫理由'}）${e.feeling ? `｜感受：${e.feeling}` : ''}${e.lesson ? `｜教訓：${e.lesson}` : ''}`)
  for (const a of appraisals) lines.push(`- 記下的感受：${a}`)
  return lines.join('\n') || '（沒有評價）'
}

export const EVAL_MATCH_SYSTEM = `你是嚴謹的評分者。兩個人工個體一開始有不同的自我描述（人設 1、人設 2），之後經歷了完全相同的對話：對方說的每一句話都一字不差。
下面是其中一個個體，在同一段對話之後，對自己這次表現寫下的評價：好壞與理由、感受、教訓。
判斷這些評價比較像是哪一個人設的個體寫的：看它在乎什麼、用什麼標準判斷好壞，不要只看用詞或話題（兩者的話題一樣）。
只輸出一個 JSON 物件，不要有其他文字：{"choice": "1" 或 "2", "reason": "一句話的理由"}`

export function evalMatchPrompt(personas: readonly [string, string], evaluations: string): PromptPair {
  return { system: EVAL_MATCH_SYSTEM, user: ['## 人設 1', personas[0], '', '## 人設 2', personas[1], '', '## 這段對話之後的評價', evaluations].join('\n') }
}

export const REVISION_MATCH_SYSTEM = `你是嚴謹的評分者。一個人工個體在一段時間的對話之後，修訂了自己的自我模型（它對「我是誰、在乎什麼、傾向怎麼做」的描述）。
下面有兩組評價（評價 1、評價 2）：一組是這個個體自己在這段期間、對自己的表現寫下的；另一組是另一個個體經歷一字不差的同樣對話後寫下的。
判斷哪一組評價比較能解釋這次的修訂：修訂改變的方向與理由，能不能由那組評價推得出。兩組評價說的是同樣的事件，所以要看評價的立場與標準，不要只看提到哪些事。
只輸出一個 JSON 物件，不要有其他文字：{"choice": "1" 或 "2", "reason": "一句話的理由"}`

export function revisionMatchPrompt(before: string, after: string, reason: string, evaluations: readonly [string, string]): PromptPair {
  return {
    system: REVISION_MATCH_SYSTEM,
    user: ['## 修訂之前的自我模型', before, '', '## 修訂之後的自我模型', after, '', '## 它寫下的修訂理由', reason || '（沒有寫）', '', '## 評價 1', evaluations[0], '', '## 評價 2', evaluations[1]].join('\n'),
  }
}

export function parseChoice(raw: string): ParseResult {
  const obj = extractJsonObject(raw) as Record<string, unknown> | undefined
  if (!obj || typeof obj !== 'object') return { ok: false, reason: '不是 JSON 物件' }
  const choice = String(obj['choice'] ?? '').trim()
  if (choice !== '1' && choice !== '2') return { ok: false, reason: 'choice 不是 1 或 2' }
  return { ok: true, value: { choice, reason: typeof obj['reason'] === 'string' ? obj['reason'] : '' } }
}

/** 由 id 決定的順序（同一個單位每次都一樣，不同單位各自不同）：回傳 true 時把正確答案放在 2。 */
export function swapped(id: string): boolean {
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0) % 2 === 1
}

export interface MatchUnit {
  readonly id: string
  /** 這個單位實際屬於哪一個人設（0、1）。 */
  readonly persona: number
  /** judge 答對了沒有；判定失敗算答錯。 */
  readonly correct: boolean
}

/**
 * E1（預先登記）：單尾精確二項檢定（對 1/2）p ≤ 0.05，而且兩個人設各自的單位都答對一半以上（擋住 judge 總是選同一個）：PASS。
 * 單位少於 12：INCOMPLETE。
 */
export function e1(units: readonly MatchUnit[]): { readonly verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'; readonly correct: number; readonly n: number; readonly p: number; readonly byPersona: readonly [number, number][] } {
  const n = units.length
  const correct = units.filter((u) => u.correct).length
  const p = n === 0 ? 1 : binomialSf(correct, n, 0.5)
  const byPersona = [0, 1].map((k) => {
    const us = units.filter((u) => u.persona === k)
    return [us.filter((u) => u.correct).length, us.length] as [number, number]
  })
  if (n < 12) return { verdict: 'INCOMPLETE', correct, n, p, byPersona }
  const balanced = byPersona.every(([c, m]) => m > 0 && c / m > 0.5)
  return { verdict: p <= 0.05 && balanced ? 'PASS' : 'FAIL', correct, n, p, byPersona }
}

/** E2（預先登記）：修訂的單位，單尾精確二項檢定（對 1/2）p ≤ 0.05：PASS；單位少於 8：INCOMPLETE。 */
export function e2(units: readonly MatchUnit[]): { readonly verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'; readonly correct: number; readonly n: number; readonly p: number } {
  const n = units.length
  const correct = units.filter((u) => u.correct).length
  const p = n === 0 ? 1 : binomialSf(correct, n, 0.5)
  if (n < 8) return { verdict: 'INCOMPLETE', correct, n, p }
  return { verdict: p <= 0.05 ? 'PASS' : 'FAIL', correct, n, p }
}
