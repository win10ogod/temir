/**
 * OpenRouter 供應商固定代理（實驗基礎設施，不屬於個體）。
 *
 * 付費的 `nvidia/nemotron-3.5-super-vl` 由多家供應商提供，量化從 fp4 到 bf16 都有，OpenRouter
 * 預設逐請求分流（2026-10-28 查詢 /api/v1/models/<id>/endpoints）。DSH 的 llm-pi-ai 不開放
 * pi-ai 的 `compat.openRouterRouting`（packages/llm/llm-pi-ai/src/catalog.ts 標為 'withhold'），
 * 無法從 DSH 設定指定供應商，所以在 DSH 與 OpenRouter 之間加這一層：把每個 chat completions
 * 請求加上 OpenRouter 的 `provider` 路由，並記錄每個請求實際由哪一家供應商服務。
 * 內容不做任何修改；金鑰只轉送，不記錄。
 *
 * DSH 端的 baseURL 寫成 `http://127.0.0.1:<port>/openrouter.ai/api/v1`：pi-ai 依「baseUrl 含 openrouter.ai」
 * 判定 OpenRouter 格式（推理參數、訊息角色；pi-ai dist/api/openai-completions.js 的 isOpenRouter），
 * 這樣付費與免費兩條路由的請求格式相同。代理轉送前去掉這段前綴。
 *
 * 用法：node experiments/runner/openrouter-pin.ts [--port 8787] [--log <路徑>]
 */
import { appendFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { parseArgs } from 'node:util'

/** 只用 bf16 的供應商，依序嘗試，不退回其他精度（實驗 v2 修正 1）。 */
export const ROUTING = {
  order: ['Crusoe', 'Nebius'],
  quantizations: ['bf16'],
  allow_fallbacks: false,
  require_parameters: true,
} as const

const UPSTREAM = 'https://openrouter.ai'
const PREFIX = '/openrouter.ai'
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'keep-alive'])

/** 為 chat completions 請求加上供應商路由；其他請求原樣轉送。 */
export function pinBody(path: string, body: Buffer): Buffer {
  if (!path.endsWith('/chat/completions') || body.length === 0) return body
  const json = JSON.parse(body.toString('utf8')) as Record<string, unknown>
  json['provider'] = ROUTING
  return Buffer.from(JSON.stringify(json))
}

/** 從回應文字（JSON 或 SSE）中找出實際服務的供應商名稱。 */
export function servedProvider(text: string): string | undefined {
  return /"provider"\s*:\s*"([^"]+)"/.exec(text)?.[1]
}

function main(): void {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '8787' }, log: { type: 'string' } } })
  const log = (entry: Record<string, unknown>) => {
    if (values.log) appendFileSync(values.log, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`)
  }
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const raw = req.url ?? '/'
    const path = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) || '/' : raw
    try {
      const body = pinBody(path, Buffer.concat(chunks))
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined && !HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
      }
      const upstream = await fetch(`${UPSTREAM}${path}`, {
        method: req.method ?? 'GET',
        headers,
        ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: new Uint8Array(body) }),
      })
      const outHeaders: Record<string, string> = {}
      upstream.headers.forEach((v, k) => {
        if (!HOP_BY_HOP.has(k) && k !== 'content-encoding') outHeaders[k] = v
      })
      res.writeHead(upstream.status, outHeaders)
      let provider: string | undefined
      let sniffed = ''
      if (upstream.body) {
        const stream = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream)
        stream.on('data', (chunk: Buffer) => {
          if (provider === undefined && sniffed.length < 65536) {
            sniffed += chunk.toString('utf8')
            provider = servedProvider(sniffed)
          }
        })
        stream.on('end', () => log({ path, status: upstream.status, provider: provider ?? null }))
        stream.pipe(res)
      } else {
        res.end()
        log({ path, status: upstream.status, provider: null })
      }
    } catch (error) {
      log({ path, error: String(error) })
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: `openrouter-pin proxy error: ${String(error)}` } }))
    }
  })
  server.listen(Number(values.port), '127.0.0.1', () => console.log(`openrouter-pin listening on 127.0.0.1:${values.port}`))
}

if (import.meta.main) main()
