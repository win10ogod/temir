/**
 * context 模式的思考，在主 agent 自己的脈絡中重跑（ADR-0009「已知的限制」第 1 項的修正）。
 *
 * context 模式中，思考是主 agent 帶著全部的脈絡（處境描述、整段對話、回憶、自己的推理）以 deliberate 工具做的；
 * 做法的閘門原本以輔助呼叫的格式重跑那次思考（近似）。這裡在那一步把主 agent 實際送出的請求存下來（快照），
 * 閘門對照時，只把那一步的思考通知中做法的段落換成要對照的版本，系統提示、對話、工具、模型與推理等級都不變，再送一次，
 * 取 deliberate 工具的參數作為輸出：與那次真實呼叫的輸出是同一種東西。
 *
 * 快照不是生命紀錄（生命日誌照樣只增不改），是閘門用的快取：個體資料目錄下的 replay/，gzip 的 JSON，
 * 最多 MAX_SNAPSHOTS 個（舊的刪掉）。找不到快照、或換不了做法的段落時，閘門退回輔助呼叫的近似，並記下原因。
 * 快照的格式是 DSH 的請求（GenerateOptions，去掉 signal 與 sessionId）；DSH 改了請求的格式時，舊的快照可能不能用，同樣退回近似。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { LifeStore } from '../life/store.ts'
import type { ModelResult } from '../recall/aux.ts'
import { DELIBERATE_TOOL } from './aux.ts'

/** 最多保留幾個快照（本專案的選擇；閘門取最近的處境與提案依據的經歷，太舊的退回近似）。 */
export const MAX_SNAPSHOTS = 400

/** 重跑時的輸出上限（與輔助呼叫的探測相同；主 agent 的請求本身是 DSH 的預設上限）。 */
export const REPLAY_MAX_TOKENS = 32_000

/** 快照：主 agent 那一步的請求（JSON 可序列化的部分）。 */
export interface ReplayRequest {
  readonly provider: string
  readonly model: string
  readonly messages: readonly Record<string, unknown>[]
  readonly [key: string]: unknown
}

function directory(life: LifeStore): string {
  return join(dirname(life.path), 'replay')
}

/** 存下一個請求，回傳快照的 id（內容的雜湊）；寫不了時回傳 undefined（閘門之後退回近似）。 */
export function saveSnapshot(life: LifeStore, request: Record<string, unknown>): string | undefined {
  try {
    const { signal: _signal, sessionId: _session, ...rest } = request
    const json = JSON.stringify(rest)
    const id = createHash('sha256').update(json).digest('hex').slice(0, 16)
    const dir = directory(life)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${id}.json.gz`)
    if (!existsSync(file)) {
      writeFileSync(file, gzipSync(json))
      prune(dir)
    }
    return id
  } catch {
    return undefined
  }
}

function prune(dir: string): void {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json.gz'))
  if (files.length <= MAX_SNAPSHOTS) return
  const byAge = files.map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t)
  for (const { f } of byAge.slice(0, files.length - MAX_SNAPSHOTS)) unlinkSync(join(dir, f))
}

/** 讀回快照；沒有或壞了時回傳 undefined。 */
export function loadSnapshot(life: LifeStore, id: string): ReplayRequest | undefined {
  try {
    const parsed = JSON.parse(gunzipSync(readFileSync(join(directory(life), `${id}.json.gz`))).toString('utf8')) as ReplayRequest
    return typeof parsed.provider === 'string' && Array.isArray(parsed.messages) ? parsed : undefined
  } catch {
    return undefined
  }
}

const isNotice = (m: Record<string, unknown>) => m['role'] === 'user' && (m['source'] as { kind?: string } | undefined)?.kind === 'temir-rd'

/**
 * 把請求中最後一則思考通知（temir-rd）裡的段落換掉：swaps 是 [原本的文字, 換成的文字]。
 * 之前回合的通知不動（那是當時的歷史）。任何一段原本的文字找不到，就回傳 undefined（不猜）。
 */
export function swapNotice(request: ReplayRequest, swaps: readonly (readonly [string, string])[]): ReplayRequest | undefined {
  const at = request.messages.findLastIndex(isNotice)
  if (at < 0) return undefined
  const notice = request.messages[at]!
  const content = (notice['content'] as { type: string; text?: string }[] | undefined) ?? []
  let text = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  if (swaps.some(([from]) => !text.includes(from))) return undefined
  for (const [from, to] of swaps) if (from !== to) text = text.replace(from, () => to)
  const swapped = { ...notice, content: [{ type: 'text', text }] }
  return { ...request, messages: request.messages.map((m, i) => (i === at ? swapped : m)) }
}

/** 重跑的模型呼叫：快照（已換好做法的段落）→ deliberate 的參數（JSON 文字）。失敗時丟出例外。 */
export type ContextCall = (request: ReplayRequest, signal: AbortSignal) => Promise<ModelResult>

/**
 * 從重跑的回應中取出輸出：deliberate 工具的參數；沒有呼叫 deliberate 時，照實寫下它做了什麼（呼叫了別的工具，或直接說了話）。
 * 純函式，單元測試用。
 */
export function replayOutput(blocks: readonly { readonly type: string; readonly name?: string; readonly arguments?: string; readonly text?: string }[]): string {
  const call = blocks.find((b) => b.type === 'tool-call' && b.name === DELIBERATE_TOOL)
  if (call) return call.arguments ?? ''
  const tools = blocks.filter((b) => b.type === 'tool-call').map((b) => b.name)
  const said = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim()
  return `（沒有呼叫 ${DELIBERATE_TOOL}${tools.length > 0 ? `，呼叫了 ${tools.join('、')}` : ''}${said ? `，直接說：${said.slice(0, 600)}` : ''}）`
}

/** 正式執行用的 ContextCall：經由 DSH 的模型服務送出同一個請求（不帶 sessionId，不影響那段對話）。 */
export function contextCaller(ctx: Context): ContextCall {
  return async (request, signal) => {
    const started = Date.now()
    const maxTokens = Math.min(typeof request['maxTokens'] === 'number' ? request['maxTokens'] : REPLAY_MAX_TOKENS, REPLAY_MAX_TOKENS)
    const assembler = new BlockAssembler()
    const options = { ...request, maxTokens, signal } as unknown as Parameters<Context['llm']['stream']>[0]
    for await (const chunk of ctx.llm.stream(options)) {
      signal.throwIfAborted()
      assembler.push(chunk)
    }
    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') throw new Error(`replay failed: ${finish.kind}${'failure' in finish && finish.failure ? ` ${String((finish.failure as { message?: string }).message ?? '')}` : ''}`)
    const blocks = assembler.blocks() as unknown as Parameters<typeof replayOutput>[0]
    const reasoningChars = blocks.filter((b) => b.type === 'reasoning').reduce((n, b) => n + (b.text ?? '').length, 0)
    const effort = typeof request['reasoningEffort'] === 'string' ? request['reasoningEffort'] : null
    return { output: replayOutput(blocks), ms: Date.now() - started, effort, reasoningChars, usage: assembler.usage ? { ...assembler.usage } : null, finish: finish.kind }
  }
}
