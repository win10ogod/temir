/**
 * 閒置時的念頭：沒有外部刺激時，懸著的事（勢能）浮上心頭，成為內部刺激（hypotheses.md H0、H-E）。
 * 純函式（依賴 LifeStore，不依賴 DSH），可單獨測試；插件見 index.ts。
 *
 * 一次念頭就是一次以內部刺激開始的 PC 循環：
 * - E：浮上心頭的那件事（懸著的事或目標）；
 * - ST：念頭本身（怎麼看它、有什麼新的理解）；
 * - RD：留下的打算（下次想對對方做的事），它成為新的勢能，直到做到或放下；
 * - A：寫下念頭、感受，以及是否放下這件事。
 * 要不要想、想哪一件、要不要放下，都由個體自己判斷；程式只決定「什麼時候有安靜的時間」（排程，不是人格參數）。
 */
import type { LifeStore } from '../life/store.ts'
import { extractJson } from '../recall/aux.ts'
import { clip, clipEnds, lastConversation, replyOf } from '../recall/retrieve.ts'
import { THOUGHT_KIND, labelPotential, potentialItems, renderPotential, resolvePotential, unlabel, type ThoughtData } from '../self/energy.ts'
import { KIND, SIGNIFICANCE, SIGNIFICANCE_LABEL, formatTime, goals, renderSelfSnapshot, type AppraisalData, type Significance } from '../self/state.ts'

export const THOUGHT_SYSTEM = `你是一個人工個體。現在沒有人在跟你說話，你有一段安靜的時間。看看你的目標與心裡懸著的事：有沒有哪一件此刻浮上心頭？也可以沒有，沒有就讓它安靜。只輸出一個 JSON 物件，不要任何其他文字：
{"item": "", "thought": "", "feeling": "", "significance": "daily", "release": false, "intention": ""}
- item：浮上心頭的那件事的編號：「懸著的事」的 P 編號（例如 "P2"），或目標的 id（例如 "g:3fa1c2d4"）。沒有就給空字串，其他欄位也留空。
- thought：你此刻的念頭，用第一人稱：你怎麼看這件事、有沒有新的理解、它和你在乎的事有什麼關係。
- feeling：這個念頭帶來的感受，用你自己的話；沒有特別的感受就給空字串。
- significance：這段念頭對你的重要程度：daily（日常）／notable（值得注意）／major（重大）／pivotal（轉折）。
- release：想過之後，這件事是否可以放下了（已經想通、不再需要，或你決定不再掛心）：true 或 false。目標不在這裡放下，要用 goal 工具。
- intention：如果你想在下次和對方說話時做什麼（例如問一件事、說明一個想法、兌現一個承諾），寫一句；沒有就給空字串。
- 一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。`

export interface ThoughtJudgement {
  readonly item: string
  readonly thought: string
  readonly feeling: string
  readonly significance: Significance
  readonly release: boolean
  readonly intention: string
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/** 解析念頭；不是 JSON 物件時回傳 undefined。沒有浮上心頭的事時 item 為空字串。 */
export function parseThought(output: string): ThoughtJudgement | undefined {
  const obj = extractJson(output)
  if (!obj) return undefined
  const significance = text(obj['significance'], 10)
  return {
    item: text(obj['item'], 40),
    thought: text(obj['thought'], 800),
    feeling: text(obj['feeling'], 300),
    significance: (SIGNIFICANCE as readonly string[]).includes(significance) ? (significance as Significance) : 'daily',
    release: obj['release'] === true,
    intention: text(obj['intention'], 300),
  }
}

/** 有沒有東西可以浮上心頭：懸著的事或進行中的目標。 */
export function hasPotential(life: LifeStore): boolean {
  return potentialItems(life).length > 0 || goals(life).some((g) => g.status === 'active')
}

/** 最近的念頭（快照用）。 */
export function renderThoughts(life: LifeStore, limit = 2): string[] {
  const recent = life.recent(limit, [THOUGHT_KIND]).reverse()
  if (recent.length === 0) return []
  return ['', '## 最近的念頭（沒有人說話時，你自己想到的）', ...recent.map((e) => `- ${formatTime(e.ts)}｜${clip((e.data as ThoughtData).thought, 200)}`)]
}

/** 念頭的輸入：自我狀態（含編號的懸著的事）、最近一次對話、最近的念頭。 */
export function thoughtInput(life: LifeStore): { readonly input: string; readonly labels: ReadonlyMap<string, string> } {
  const labels = labelPotential(potentialItems(life))
  const last = lastConversation(life, undefined)
  const lines = ['## 你目前的自我狀態', renderSelfSnapshot(life, [...renderPotential(life, { labels: true }), ...renderThoughts(life)])]
  lines.push('', '## 最近一次對話')
  if (!last || (!last.heard && !last.said)) lines.push('（沒有）')
  if (last?.heard) lines.push(`對方說：${clipEnds((last.heard.text ?? '').replace(/^對方說：/, ''), 300)}`)
  if (last?.said) lines.push(`我說：${clipEnds(replyOf(last.said), 400)}`)
  return { input: lines.join('\n'), labels }
}

/**
 * 寫下一次念頭：self/thought；值得注意以上的感受寫成 appraisal（指向這個念頭，轉折會讓整合提前，H4）。
 * 沒有任何事浮上心頭、或編號認不得時不寫任何東西，回傳 undefined。呼叫端應包在 transaction 中。
 */
export function recordThought(life: LifeStore, judged: ThoughtJudgement, labels: ReadonlyMap<string, string>, model: string): string | undefined {
  const goalIds = new Set(goals(life).filter((g) => g.status === 'active' || g.status === 'paused').map((g) => g.id))
  const [key] = resolvePotential([judged.item], labels, goalIds)
  if (!key || !judged.thought) return undefined
  const item = potentialItems(life).find((p) => p.key === key)
  const held = potentialItems(life)
  const data: ThoughtData = {
    item: key,
    thought: unlabel(judged.thought, labels, held),
    intention: unlabel(judged.intention, labels, held),
    releasedItems: judged.release && !key.startsWith('goal:') ? [key] : [],
    trigger: 'idle',
  }
  const about = item ? clip(item.text, 80) : (goals(life).find((g) => `goal:${g.id}` === key)?.text ?? '')
  const event = life.append({
    kind: THOUGHT_KIND,
    origin: 'self',
    model,
    data,
    text: `我想到（${about}）：${data.thought}${data.intention ? `\n我打算：${data.intention}` : ''}${data.releasedItems.length > 0 ? '\n這件事我可以放下了。' : ''}`,
    causes: item ? [item.source] : [],
  })
  if (judged.feeling && judged.significance !== 'daily') {
    const appraisal: AppraisalData = { feeling: judged.feeling, significance: judged.significance, reappraisal: false }
    life.append({
      kind: KIND.appraisal,
      origin: 'self',
      data: { ...appraisal, source: THOUGHT_KIND },
      text: `我的感受（${SIGNIFICANCE_LABEL[judged.significance]}）：${judged.feeling}`,
      causes: [event.id],
    })
  }
  return event.id
}
