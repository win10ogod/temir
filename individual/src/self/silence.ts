/**
 * 沉默的回合：模型這一步只回傳推理、沒有說出任何話，DSH 就把回合結束了，對方什麼也沒看到
 * （subtraction-v1 q02：4 秒內只有 433 字的推理；dev5 q41：656 秒後只有 643 字的推理）。
 *
 * DSH 在回合結束前發出 `agent/turn-stopping`（serial）：listener 可以 steer，機器重讀 inbox，有新的引導就再跑一步
 * （dsh-agent runtime-types.d.ts 的說明）。這裡在「整個回合都沒有說出話、最後一步也沒有呼叫工具」時提醒一次。
 * 要不要說、說什麼，仍由個體決定；提醒每回合最多一次，不會反覆。
 * 純邏輯（不依賴 DSH），可單獨測試；接線在 index.ts。
 */
export const SILENCE_KIND = 'self/silence'

/** 提醒的內容：只陳述發生了什麼，不指定要說什麼。來源是 temir-self，不會被當成對方的話。 */
export const SILENCE_NOTE = '（這不是對方說的話：你剛才只有思考，沒有說出任何話，對方什麼也沒看到。把你要說的話說出來；如果你決定不說，也簡短說一聲。）'

interface Block {
  readonly type: string
  readonly text?: string
}

/** assistant 訊息有沒有說出話（非空白的文字）、有沒有呼叫工具。 */
export function voiceOf(blocks: readonly Block[]): { readonly text: boolean; readonly tool: boolean } {
  return {
    text: blocks.some((b) => b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0),
    tool: blocks.some((b) => b.type === 'tool-call'),
  }
}

interface TurnVoice {
  turn: number
  /** 這個回合有沒有任何一步說出話。 */
  spoke: boolean
  /** 最後一則 assistant 訊息有沒有呼叫工具。 */
  lastTool: boolean
  /** 這個回合已經有 assistant 訊息。 */
  answered: boolean
  nudged: boolean
}

/** 逐一觀察 session 事件；回合要結束時判斷要不要提醒。以 session 物件為鍵，session 釋放後自動消失。 */
export class SilenceWatch {
  private readonly turns = new WeakMap<object, TurnVoice>()

  observe(session: object, event: { readonly type: string; readonly data?: unknown }): void {
    const data = (event.data ?? {}) as { turn?: number; message?: { content?: readonly Block[] } }
    if (event.type === 'turn/start' && typeof data.turn === 'number') {
      this.turns.set(session, { turn: data.turn, spoke: false, lastTool: false, answered: false, nudged: false })
      return
    }
    if (event.type !== 'assistant/message') return
    const state = this.turns.get(session)
    if (!state || (typeof data.turn === 'number' && data.turn !== state.turn)) return
    const voice = voiceOf(data.message?.content ?? [])
    state.answered = true
    state.spoke ||= voice.text
    state.lastTool = voice.tool
  }

  /** 回合要結束時：整個回合都沒有說出話、最後一步也沒有呼叫工具，就回傳 true（每回合最多一次）。 */
  claim(session: object, turn: number): boolean {
    const state = this.turns.get(session)
    if (!state || state.turn !== turn || state.nudged || !state.answered || state.spoke || state.lastTool) return false
    state.nudged = true
    return true
  }
}
