/**
 * 把 DSH session 事件轉成生命日誌事件。
 *
 * 原則：完整保存（整個 DSH 事件 JSON 存進 data），只挑有意義的文字建立回憶索引。
 * 本專案自己注入的訊息（source.kind 以 `temir-` 開頭）不建立索引，避免「回憶到回憶」。
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { LifeEventInput } from './store.ts'

/** 本專案注入訊息使用的 source kind 前綴。 */
export const TEMIR_SOURCE_PREFIX = 'temir-'

/** 結果本身就是生命紀錄內容的工具；它們的結果不再建立索引，避免回憶到回憶。 */
export const MEMORY_TOOLS: ReadonlySet<string> = new Set(['recall'])

/** 追蹤記憶工具的呼叫，讓對應的 tool/result 只保存不索引。每個 DSH 程序一份。 */
export class IngestState {
  readonly #memoryCalls = new Set<string>()

  noteCall(callId: string, name: string): void {
    if (MEMORY_TOOLS.has(name)) this.#memoryCalls.add(callId)
  }

  /** 回傳並清除：這個結果是否屬於記憶工具。 */
  takeMemoryResult(callId: string): boolean {
    return this.#memoryCalls.delete(callId)
  }
}

const LIMIT = {
  userInjected: 2000,
  replyText: 4000,
  reasoning: 4000,
  toolArgs: 500,
  toolResult: 2000,
} as const

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…（截斷，原文保存在 data）`
}

interface BlockLike {
  readonly type: string
  readonly text?: string
  readonly name?: string
  readonly arguments?: string
}

function textOf(blocks: readonly BlockLike[] | undefined, type: 'text' | 'reasoning' = 'text'): string {
  return (blocks ?? [])
    .filter((b) => b.type === type && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** 回傳 undefined 表示這個事件只保存、不建立回憶索引。 */
function searchableText(event: SessionEvent, state: IngestState): { text?: string; model?: string } {
  switch (event.type) {
    case 'tool/call': {
      state.noteCall(event.data.callId, event.data.name)
      return {}
    }
    case 'user/message': {
      const source = event.data.source as { kind: string }
      if (source.kind.startsWith(TEMIR_SOURCE_PREFIX)) return {}
      const text = textOf(event.data.content as readonly BlockLike[])
      if (!text) return {}
      if (source.kind === 'user') return { text: `對方說：${text}` }
      return { text: `[${source.kind}] ${clip(text, LIMIT.userInjected)}` }
    }
    case 'assistant/message': {
      const message = event.data.message
      const blocks = message.content as readonly BlockLike[]
      const parts: string[] = []
      const reasoning = textOf(blocks, 'reasoning')
      if (reasoning) parts.push(`我想：${clip(reasoning, LIMIT.reasoning)}`)
      const reply = textOf(blocks)
      if (reply) parts.push(`我說：${clip(reply, LIMIT.replyText)}`)
      for (const call of blocks.filter((b) => b.type === 'tool-call')) {
        parts.push(`我使用工具 ${call.name ?? '?'}：${clip(call.arguments ?? '', LIMIT.toolArgs)}`)
      }
      return { ...(parts.length > 0 ? { text: parts.join('\n') } : {}), model: `${message.source.provider}/${message.source.model}` }
    }
    case 'tool/result': {
      if (state.takeMemoryResult(event.data.message.toolCallId)) return {}
      const text = textOf(event.data.message.content as readonly BlockLike[])
      if (!text) return {}
      const status = event.data.message.isError ? '工具失敗' : '工具結果'
      return { text: `${status}：${clip(text, LIMIT.toolResult)}` }
    }
    default:
      return {}
  }
}

/** DSH session 事件 → 生命日誌事件。id 由 session 與序號組成，重播時冪等。 */
export function fromSessionEvent(sessionId: string, event: SessionEvent, state: IngestState): LifeEventInput {
  const { text, model } = searchableText(event, state)
  return {
    id: `${sessionId}#${event.seq}`,
    ts: event.time,
    kind: `dsh/${event.type}`,
    origin: 'session',
    session: sessionId,
    model,
    text,
    data: event,
  }
}
