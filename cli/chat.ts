/**
 * temir chat：在終端機與個體對話。
 *
 * 透過 DSH 的 SDK 協定（stdio 上的 newline-delimited JSON-RPC，`@deepseek-ai/dsh-sdk-protocol`）
 * 驅動一個帶著個體插件的 DSH 執行期（`dsh --profile sdk --patch individual/cordis.patch.yml`）。
 * 工具審核與個體主動提出的問題都在終端機回答。DSH 的診斷輸出寫到 log 檔，不混進對話。
 *
 * 用法：scripts/temir.sh chat [--model deepseek|local] [--session <id>] [--show-thinking]
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MODELS = {
  deepseek: { provider: 'deepseek-official', model: 'deepseek-flash', patches: [] as string[] },
  local: { provider: 'local-eve', model: 'EVE-27B', patches: [join(repo, 'dsh', 'local-model.patch.yml')] },
} as const
type ModelName = keyof typeof MODELS

const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s)

interface Block {
  readonly type: string
  readonly text?: string
  readonly name?: string
  readonly arguments?: string
}

interface Question {
  readonly id: string
  readonly question: string
  readonly detail?: string
  readonly header?: string
  readonly options?: readonly { readonly label: string; readonly description?: string }[]
  readonly multiSelect?: boolean
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      model: { type: 'string', default: process.env['TEMIR_MODEL'] ?? 'deepseek' },
      session: { type: 'string' },
      'show-thinking': { type: 'boolean', default: false },
    },
  })
  const modelName = values.model as ModelName
  const route = MODELS[modelName]
  if (!route) throw new Error(`未知的模型 ${values.model}；可用：${Object.keys(MODELS).join('、')}`)

  const logDir = join(process.env['TEMIR_CACHE'] ?? join(homedir(), '.cache', 'temir'), 'logs')
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, `chat-${new Date().toISOString().replaceAll(':', '-')}.log`)
  const log = createWriteStream(logPath)

  const patchArgs = [join(repo, 'individual', 'cordis.patch.yml'), ...route.patches].flatMap((p) => ['--patch', p])
  const child = spawn('dsh', ['--profile', 'sdk', ...patchArgs], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
  child.stderr.pipe(log)
  const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)))

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
  // 以有緩衝的逐行迭代器讀取，管線輸入（腳本化測試）時才不會在等待模型時漏掉行。
  const lines = rl[Symbol.asyncIterator]()
  const ask = async (prompt: string): Promise<string | undefined> => {
    process.stdout.write(prompt)
    const next = await lines.next()
    return next.done ? undefined : String(next.value)
  }
  const transport = new JsonRpcLineTransport(child.stdout, child.stdin)
  const sessionId = values.session ?? `session-${randomUUID()}`

  transport.onNotification((method, params) => {
    if (method !== 'session.event' || params['sessionId'] !== sessionId) return
    const event = params['event'] as SessionEvent
    if (event.type === 'user/message') {
      const source = event.data.source as { kind: string }
      if (source.kind === 'temir-recall') {
        const text = (event.data.content as readonly Block[]).map((b) => b.text ?? '').join('')
        const n = text.split('\n').filter((line) => line.startsWith('- [')).length
        console.log(dim(`（自動回憶：取回 ${n} 筆過往片段）`))
      }
    } else if (event.type === 'assistant/message') {
      const blocks = event.data.message.content as readonly Block[]
      for (const block of blocks) {
        if (block.type === 'reasoning' && values['show-thinking'] && block.text) console.log(dim(`（思考）${block.text}`))
        if (block.type === 'text' && block.text?.trim()) console.log(`\n個體> ${block.text.trim()}\n`)
        if (block.type === 'tool-call') console.log(dim(`  ⟳ ${block.name}：${oneLine(block.arguments ?? '', 160)}`))
      }
    } else if (event.type === 'tool/result' && event.data.message.isError) {
      const text = (event.data.message.content as readonly Block[]).map((b) => b.text ?? '').join('')
      console.log(dim(`  ✗ 工具失敗：${oneLine(text, 200)}`))
    }
  })

  transport.onRequest(async (method, params) => {
    if (method === 'approval/request') {
      const reason = params['reason'] ? `（${String(params['reason'])}）` : ''
      const answer = (await ask(`⚠ 個體想使用 ${String(params['toolName'])}${reason}，允許這一次？(y/N) `)) ?? ''
      return { outcome: /^y(es)?$/i.test(answer.trim()) ? 'allowed-once' : 'rejected' }
    }
    if (method === 'user-question/ask') {
      const answers = []
      for (const q of params['questions'] as Question[]) {
        console.log(`\n個體問你${q.header ? `［${q.header}］` : ''}：${q.question}`)
        if (q.detail) console.log(dim(q.detail))
        q.options?.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}${o.description ? dim(` — ${o.description}`) : ''}`))
        const hint = q.options?.length ? `輸入編號${q.multiSelect ? '（可用逗號分隔多個）' : ''}或直接回答` : '回答'
        const raw = ((await ask(`${hint}> `)) ?? '').trim()
        const picks = raw.split(/[,，\s]+/).map((s) => Number.parseInt(s, 10))
        const labels = q.options && picks.every((n) => n >= 1 && n <= q.options!.length)
          ? picks.map((n) => q.options![n - 1]!.label)
          : []
        answers.push(labels.length > 0 ? { id: q.id, selected: labels } : { id: q.id, selected: [], custom: raw })
      }
      return { answers }
    }
    throw new Error(`不支援的請求 ${method}`)
  })

  transport.start()
  await transport.request('initialize', {
    cwd: process.cwd(),
    provider: route.provider,
    model: route.model,
    approvalRequests: true,
    capabilities: { userQuestions: true },
  })
  if (values.session) await transport.request('session/resume', { sessionId })

  console.log(dim(`模型：${route.provider}/${route.model}　session：${sessionId}`))
  console.log(dim(`續談：scripts/temir.sh chat --session ${sessionId}${modelName === 'local' ? ' --model local' : ''}　離開：/exit　診斷 log：${logPath}`))

  try {
    for (;;) {
      const raw = await ask('你> ')
      if (raw === undefined) break // Ctrl-D 或輸入結束
      const line = raw.trim()
      if (!process.stdin.isTTY) console.log(line)
      if (line === '/exit' || line === '/quit') break
      if (!line) continue
      await transport.request('session/prompt', { sessionId, contentBlocks: [{ type: 'text', text: line }] })
      await transport.request('session/wait', { sessionId })
    }
  } catch (error) {
    console.error(error)
  } finally {
    rl.close()
    child.stdin.end() // stdin EOF：DSH SDK 執行期依設計有界地正常關閉
    const code = await exited
    transport.close()
    log.end()
    if (code !== 0) console.error(`DSH 執行期結束碼 ${code}，詳見 ${logPath}`)
  }
}

await main()
