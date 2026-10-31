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
import { INTEGRATION_KIND } from '../integrate/carried.ts'
import { OUTCOME_KIND } from '../rd/memory.ts'
import { THOUGHT_KIND, potentialItems, presentPotential, resolvePotential, unlabel, type ThoughtData } from '../self/energy.ts'
import { DEFAULT_PROCEDURES, PROCEDURE_KIND, procedurePrompt, type Procedure } from '../self/procedure.ts'
import { KIND, appraisalText, formatTime, goals, renderSelfSnapshot, type AppraisalData } from '../self/state.ts'

const THOUGHT_CONTRACT = `只輸出一個 JSON 物件，不要任何其他文字：
{"item": "", "thought": "", "feeling": "", "keepFeeling": false, "reconsider": false, "release": false, "intention": "", "replaces": [], "now": false}
- item：浮上心頭的那件事的編號：「懸著的事」的 P 編號（例如 "P2"），或目標的 id（例如 "g:3fa1c2d4"）。沒有就給空字串，其他欄位也留空或 false。
- thought：你此刻的念頭，第一人稱。
- feeling：這個念頭帶來的感受；沒有就給空字串。
- keepFeeling：feeling 不是空的時必答：要不要把這個感受記下來：true 或 false。
- reconsider：item 不是空的時必答：這個念頭要不要讓你現在就重新檢視自己（核心價值、人生敘事與長期目標）：true 或 false。
- release：item 不是空的時必答：這件事是否可以放下了：true 或 false。目標不在這裡放下。
- intention：下次和對方說話時想做的事，一句；沒有就給空字串。
- replaces：intention 不是空的時必答：這個打算取代了「懸著的事」中的哪幾件（P 編號的陣列，例如同一件事換了寫法、或已經包含在這個打算裡的；被取代的就不再列出）；沒有就給空陣列。
- now：intention 不是空的時必答：要不要現在就主動對對方說，不等對方先開口：true 或 false。`

/** 念頭的系統提示（框架＋念頭做法＋輸出；ADR-0008 §1）。 */
export function thoughtSystem(procedure: Procedure = { name: 'thought', version: 1, text: DEFAULT_PROCEDURES.thought }): string {
  return procedurePrompt('你是一個人工個體。現在沒有人在跟你說話，你有一段安靜的時間。照下面你自己的做法想，輸出照最後一段的格式。', [procedure], THOUGHT_CONTRACT)
}

export const THOUGHT_SYSTEM = thoughtSystem()

export interface ThoughtJudgement {
  readonly item: string
  readonly thought: string
  readonly feeling: string
  /** 要不要記成感受紀錄（取代「不是日常的才記」，ADR-0008 §2）。 */
  readonly keepFeeling: boolean
  /** 要不要現在就重新檢視自己（H4；取代「轉折」）。 */
  readonly reconsider: boolean
  readonly release: boolean
  readonly intention: string
  /** 這個打算取代了哪幾件懸著的事（模型寫的 P 編號，原樣保留；e2e-40：同一個打算換了寫法，一件一件累積下來）。 */
  readonly replaces: readonly string[]
  /** 現在就主動開口（M4 的自發行動）。 */
  readonly now: boolean
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export type ThoughtParse = { readonly ok: true; readonly judgment: ThoughtJudgement } | { readonly ok: false; readonly problems: readonly string[] }

/**
 * 解析念頭（強制判斷，CLAUDE.md 規則 2）：item 不是空的時，reconsider 與 release 必答；有感受時 keepFeeling 必答；
 * 有打算時 now 與 replaces 必答（replaces 只能指名輸入中列出的 P 編號，labels）。缺了就列出問題，由呼叫端附上 thoughtRetryNote 重問一次。
 * 沒有浮上心頭的事時 item 為空字串。
 */
export function parseThought(output: string, labels: ReadonlyMap<string, string> = new Map()): ThoughtParse {
  const obj = extractJson(output)
  if (!obj) return { ok: false, problems: ['不是 JSON 物件'] }
  const item = text(obj['item'], 40)
  const feeling = text(obj['feeling'], 300)
  const intention = text(obj['intention'], 300)
  const problems: string[] = []
  const bool = (key: string) => typeof obj[key] === 'boolean'
  const replaces: string[] = []
  if (item) {
    if (!bool('reconsider')) problems.push('reconsider 不是 true 或 false')
    if (!bool('release')) problems.push('release 不是 true 或 false')
    if (feeling && !bool('keepFeeling')) problems.push('有 feeling，但 keepFeeling 不是 true 或 false')
    if (intention && !bool('now')) problems.push('有 intention，但 now 不是 true 或 false')
    if (intention) {
      if (!Array.isArray(obj['replaces'])) problems.push('有 intention，但 replaces 不是陣列')
      for (const raw of Array.isArray(obj['replaces']) ? (obj['replaces'] as unknown[]) : []) {
        const ref = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
        if (!labels.has(ref)) problems.push(`replaces 的「${String(raw)}」不是列出的懸著的事`)
        else if (!replaces.includes(ref)) replaces.push(ref)
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    judgment: {
      item,
      thought: text(obj['thought'], 800),
      feeling,
      keepFeeling: feeling !== '' && obj['keepFeeling'] === true,
      reconsider: obj['reconsider'] === true,
      release: obj['release'] === true,
      intention,
      replaces: intention ? replaces : [],
      now: intention !== '' && obj['now'] === true,
    },
  }
}

/** 念頭不合格時重問一次所附的說明。 */
export function thoughtRetryNote(problems: readonly string[]): string {
  return `（重寫一次：上一次的輸出不完整。只輸出一個完整的 JSON 物件；item 不是空的時，reconsider 與 release 是 true 或 false，有 feeling 時 keepFeeling 是 true 或 false，有 intention 時 now 是 true 或 false、replaces 是列出的 P 編號的陣列（可以是空的）。不合格的地方：${problems.join('；')}）`
}

/**
 * 算作新經歷的事件：對方或我說的話、事後比對、整合、做法的新版本。念頭本身、它的感受紀錄、輔助呼叫、閘門的探測都不算：
 * e2e-40 中閘門每寫一筆探測就觸發一次念頭，9 次念頭多半在想同一個打算。
 */
export const EXPERIENCE_KINDS: readonly string[] = ['dsh/user/message', 'dsh/assistant/message', OUTCOME_KIND, INTEGRATION_KIND, PROCEDURE_KIND.version]

/** seq 之後有沒有新的經歷（排程用：每段新的經歷之後、再度閒置時，最多一次念頭）。 */
export function newExperienceSince(life: LifeStore, seq: number): boolean {
  return life.after(seq, EXPERIENCE_KINDS, 1).length > 0
}

/** 上一次念頭（或嘗試：念頭的輔助呼叫）的 seq；沒有就是 -1。程序重啟之後，排程從這裡接著算。 */
export function lastThoughtSeq(life: LifeStore): number {
  const thought = life.latest(THOUGHT_KIND)?.seq ?? -1
  const attempt = life.recent(400, ['memory/aux']).find((e) => (e.data as { purpose?: string }).purpose === 'thought')?.seq ?? -1
  return Math.max(thought, attempt)
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

/**
 * 主動開口的事實（ADR-0008 §4）：最近一次主動開口的時間、之後對方有沒有回話、24 小時內開口幾次。
 * 以前是寫死的上限（每 24 小時最多 3 次）；現在要不要開口由念頭的做法判斷，這裡只陳述事實。
 */
export function initiativeFacts(life: LifeStore, now = Date.now()): string[] {
  const sent = life.all(INITIATIVE_KIND).filter((e) => (e.data as InitiativeData).delivered)
  const last = sent.at(-1)
  if (!last) return ['- 你還沒有主動開口過。']
  const replied = life.after(last.seq, ['dsh/user/message'], 50).some((e) => e.text?.startsWith('對方說：'))
  const day = sent.filter((e) => now - e.ts < 24 * 3_600_000).length
  return [`- 最近一次主動開口：${formatTime(last.ts)}；之後對方${replied ? '回過話' : '還沒有回話'}。`, `- 過去 24 小時內主動開口 ${day} 次。`]
}

/** 念頭的輸入：自我狀態（含編號的懸著的事）、最近一次對話、最近的念頭、主動開口的事實。 */
export function thoughtInput(life: LifeStore, now = Date.now()): { readonly input: string; readonly labels: ReadonlyMap<string, string> } {
  const view = presentPotential(life, { labels: true })
  const labels = view.labels
  const last = lastConversation(life, undefined)
  const lines = ['## 你目前的自我狀態', renderSelfSnapshot(life, [...view.lines, ...renderThoughts(life)])]
  lines.push('', '## 最近一次對話')
  if (!last || (!last.heard && !last.said)) lines.push('（沒有）')
  if (last?.heard) lines.push(`對方說：${clipEnds((last.heard.text ?? '').replace(/^對方說：/, ''), 300)}`)
  if (last?.said) lines.push(`我說：${clipEnds(replyOf(last.said), 400)}`)
  lines.push('', '## 主動開口', ...initiativeFacts(life, now))
  return { input: lines.join('\n'), labels }
}

/**
 * 寫下一次念頭：self/thought；個體決定記下的感受寫成 appraisal（指向這個念頭）；reconsider 會讓整合以深度模式提前（H4）。
 * 沒有任何事浮上心頭、或編號認不得時不寫任何東西，回傳 undefined。呼叫端應包在 transaction 中。
 */
export function recordThought(life: LifeStore, judged: ThoughtJudgement, labels: ReadonlyMap<string, string>, model: string): string | undefined {
  const goalIds = new Set(goals(life).filter((g) => g.status === 'active' || g.status === 'paused').map((g) => g.id))
  const [key] = resolvePotential([judged.item], labels, goalIds)
  if (!key || !judged.thought) return undefined
  const item = potentialItems(life).find((p) => p.key === key)
  const held = potentialItems(life)
  const replaced = judged.intention ? resolvePotential(judged.replaces, labels).filter((k) => !k.startsWith('goal:')) : []
  const data: ThoughtData = {
    item: key,
    thought: unlabel(judged.thought, labels, held),
    intention: unlabel(judged.intention, labels, held),
    releasedItems: judged.release && !key.startsWith('goal:') ? [key] : [],
    ...(replaced.length > 0 ? { replacedItems: replaced } : {}),
    trigger: 'idle',
    ...(judged.now && judged.intention ? { now: true } : {}),
    ...(judged.reconsider ? { reconsider: true } : {}),
  }
  const about = item ? clip(item.text, 80) : (goals(life).find((g) => `goal:${g.id}` === key)?.text ?? '')
  const event = life.append({
    kind: THOUGHT_KIND,
    origin: 'self',
    model,
    data,
    text: `我想到（${about}）：${data.thought}${data.intention ? `\n我打算：${data.intention}` : ''}${replaced.length > 0 ? `\n這個打算取代了：${replaced.map((k) => clip(held.find((h) => h.key === k)?.text ?? k, 40)).join('、')}` : ''}${data.releasedItems.length > 0 ? '\n這件事我可以放下了。' : ''}`,
    causes: item ? [item.source] : [],
  })
  if (judged.feeling && judged.keepFeeling) {
    const appraisal: AppraisalData = { feeling: judged.feeling, reappraisal: false, ...(judged.reconsider ? { reconsider: true } : {}) }
    life.append({
      kind: KIND.appraisal,
      origin: 'self',
      data: { ...appraisal, source: THOUGHT_KIND },
      text: appraisalText(appraisal),
      causes: [event.id],
    })
  }
  return event.id
}

/** 主動開口的紀錄（M4）：念頭決定現在就說；delivered＝對話還在、已經送出。 */
export const INITIATIVE_KIND = 'self/initiative'

export interface InitiativeData {
  readonly thought: string
  readonly session: string | null
  readonly intention: string
  readonly delivered: boolean
  readonly reason?: string
}

/**
 * 現在可不可以主動開口：上次主動開口之後，對方要先說過話。這是防止連發的安全保證，不是人格（ADR-0008 §4）：
 * 沒有它，對方不回話時，每段閒置都可能再發一次。要不要說、說什麼、一天說幾次，由個體在念頭中依自己的做法決定
 * （以前另有每 24 小時最多 3 次的上限，是我寫死的，拿掉了；事實列在念頭的輸入中，initiativeFacts）。
 */
export function mayInitiate(life: LifeStore): { readonly ok: boolean; readonly reason?: string } {
  const sent = life.all(INITIATIVE_KIND).filter((e) => (e.data as InitiativeData).delivered)
  const last = sent.at(-1)
  if (last && !life.after(last.seq, ['dsh/user/message'], 50).some((e) => e.text?.startsWith('對方說：'))) return { ok: false, reason: '上次主動開口之後，對方還沒有回話' }
  return { ok: true }
}

/** 主動開口的那一回合的輸入：來源是 temir-thought，不是對方說的話。 */
export function initiativeNote(thought: string, intention: string): string {
  return `（這不是對方說的話：沒有人跟你說話的時候，你想到：${thought}\n你決定現在主動對對方說：${intention}\n對方可能不在，也可能晚點才看到。）`
}

/** 主動開口經 IM 送出的紀錄（dsh-im 的 dshIm.send；ADR-0006）。 */
export const INITIATIVE_IM_KIND = 'self/initiative-im'

export interface ImTarget {
  readonly botId: string
  readonly targetId: string
}

/**
 * 收集主動開口那一回合個體說的話：followup 之後，這段對話的下一個回合就是念頭發起的回合；
 * 回合結束時交出全部的文字（送到 IM 用）。純邏輯，可單獨測試。
 */
export class InitiativeRelay {
  readonly #pending = new Map<string, { thought: string; turn?: number; texts: string[] }>()

  expect(session: string, thought: string): void {
    this.#pending.set(session, { thought, texts: [] })
  }

  /** 觀察 session 事件；念頭發起的回合結束時回傳 { thought, text }。 */
  observe(session: string, event: { readonly type: string; readonly data?: unknown }): { readonly thought: string; readonly text: string } | undefined {
    const state = this.#pending.get(session)
    if (!state) return undefined
    const data = (event.data ?? {}) as { turn?: number; message?: { content?: readonly { type: string; text?: string }[] } }
    if (event.type === 'turn/start' && state.turn === undefined && typeof data.turn === 'number') {
      state.turn = data.turn
      return undefined
    }
    if (state.turn === undefined || (typeof data.turn === 'number' && data.turn !== state.turn)) return undefined
    if (event.type === 'assistant/message') {
      const text = (data.message?.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text!.trim()).filter(Boolean).join('\n')
      if (text) state.texts.push(text)
      return undefined
    }
    if (event.type !== 'turn/end') return undefined
    this.#pending.delete(session)
    const text = state.texts.join('\n\n').trim()
    return text ? { thought: state.thought, text } : undefined
  }
}
