/**
 * 故障注入代理（實驗基礎設施，不屬於個體）：驗證 context 模式遇到 MALFORMED_RESPONSE 時的重試（rd/index.ts 的 agent/request-error）。
 *
 * DeepSeek 很少送出不合法的工具參數（context-v1 的 227 個決定中 1 次，context-v2 的 456 個中 0 次），沒有辦法等它自然發生，
 * 所以在 DSH 與 DeepSeek（Anthropic Messages 相容端點）之間加這一層：串流中第一個名為 target 的 tool_use 區塊，
 * 第一個 input_json_delta 的前面加上一個字元，DSH 組出來的工具參數就不是合法的 JSON
 * （dsh-llm-deepseek：「DeepSeek Messages stream: tool input is invalid JSON」，MALFORMED_RESPONSE）。
 * 只弄壞 times 次（預設 1），之後的請求與回應原樣轉送；重試得到的是真實模型的回應。金鑰只轉送，不記錄。
 *
 * DSH 端以環境變數 DEEPSEEK_BASE_URL＝http://127.0.0.1:<port>/anthropic 指向這裡（dsh-llm-deepseek 的 BASE_URL_ENV）。
 *
 * 用法：node experiments/runner/fault-proxy.ts [--port 8788] [--target deliberate] [--times 1] [--log <路徑>] [--pid <路徑>]
 */
import { appendFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { parseArgs } from 'node:util'

const UPSTREAM = 'https://api.deepseek.com'
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'keep-alive'])

/** 一個回應串流的狀態：哪一個區塊是要弄壞的工具呼叫、是否已經弄壞。 */
export interface FaultState {
  readonly target: string
  /** 還可以弄壞幾次（整個代理共用）。 */
  remaining: number
  /** 這個回應中要弄壞的區塊編號。 */
  index?: number
  /** 這個回應中弄壞了的工具呼叫 id。 */
  corrupted?: string
}

/**
 * 處理一個 SSE frame（`event: …\ndata: {...}`，不含結尾的空行）：遇到目標工具的區塊開始時記下編號，
 * 那個區塊的第一個 input_json_delta 前面加上「#」。其他 frame 原樣回傳。
 */
export function corruptFrame(frame: string, state: FaultState): string {
  const lines = frame.split('\n')
  const at = lines.findIndex((l) => l.startsWith('data:'))
  if (at < 0) return frame
  let event: Record<string, unknown>
  try {
    event = JSON.parse(lines[at]!.slice(5).trim()) as Record<string, unknown>
  } catch {
    return frame
  }
  if (event['type'] === 'content_block_start' && state.index === undefined && state.remaining > 0) {
    const block = event['content_block'] as Record<string, unknown> | undefined
    if (block?.['type'] === 'tool_use' && block['name'] === state.target) {
      state.index = event['index'] as number
      state.corrupted = String(block['id'] ?? '')
    }
    return frame
  }
  if (event['type'] === 'content_block_delta' && state.index !== undefined && event['index'] === state.index && state.remaining > 0) {
    const delta = event['delta'] as Record<string, unknown> | undefined
    if (delta?.['type'] === 'input_json_delta' && typeof delta['partial_json'] === 'string') {
      state.remaining--
      lines[at] = `data: ${JSON.stringify({ ...event, delta: { ...delta, partial_json: `#${delta['partial_json']}` } })}`
      return lines.join('\n')
    }
  }
  return frame
}

/** 把 SSE 文字切成完整的 frame（以空行分隔）；回傳完整的 frame 與剩下的不完整部分。 */
export function splitFrames(buffer: string): { readonly frames: string[]; readonly rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  return { frames: parts.slice(0, -1), rest: parts.at(-1) ?? '' }
}

/** 建立代理伺服器（不開始監聽）。shared.remaining 是整個代理還可以弄壞幾次。 */
export function createFaultProxy(upstream: string, target: string, shared: { remaining: number }, log: (entry: Record<string, unknown>) => void): Server {
  return createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const path = req.url ?? '/'
    try {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined && !HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
      }
      const body = Buffer.concat(chunks)
      const response = await fetch(`${upstream}${path}`, {
        method: req.method ?? 'GET',
        headers,
        ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: new Uint8Array(body) }),
      })
      const outHeaders: Record<string, string> = {}
      response.headers.forEach((v, k) => {
        if (!HOP_BY_HOP.has(k) && k !== 'content-encoding') outHeaders[k] = v
      })
      res.writeHead(response.status, outHeaders)
      const sse = (response.headers.get('content-type') ?? '').includes('text/event-stream')
      const state: FaultState = { target, remaining: shared.remaining }
      if (response.body) {
        const decoder = new TextDecoder()
        let buffer = ''
        for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
          if (!sse) {
            res.write(chunk)
            continue
          }
          buffer += decoder.decode(chunk, { stream: true })
          const { frames, rest } = splitFrames(buffer)
          buffer = rest
          for (const frame of frames) res.write(`${corruptFrame(frame, state)}\n\n`)
        }
        if (sse && buffer) res.write(buffer)
      }
      res.end()
      const used = shared.remaining - state.remaining
      shared.remaining = state.remaining
      log({ ts: new Date().toISOString(), method: req.method, path, status: response.status, ...(used > 0 ? { corrupted: state.corrupted, target } : {}) })
    } catch (error) {
      log({ ts: new Date().toISOString(), method: req.method, path, error: String(error) })
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`fault-proxy: ${String(error)}`)
    }
  })
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '8788' },
      target: { type: 'string', default: 'deliberate' },
      times: { type: 'string', default: '1' },
      log: { type: 'string' },
      pid: { type: 'string' },
    },
  })
  const write = (entry: Record<string, unknown>) => {
    const line = JSON.stringify(entry)
    if (values.log) appendFileSync(values.log, `${line}\n`)
    else console.log(line)
  }
  const shared = { remaining: Number(values.times) }
  const server = createFaultProxy(UPSTREAM, values.target!, shared, write)
  server.listen(Number(values.port), '127.0.0.1', () => {
    if (values.pid) writeFileSync(values.pid, String(process.pid))
    write({ ts: new Date().toISOString(), listening: Number(values.port), target: values.target, times: shared.remaining })
  })
}
