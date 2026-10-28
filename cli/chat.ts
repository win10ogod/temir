/**
 * temir chat：在終端機與個體對話。
 *
 * 透過 DSH 的 SDK 協定驅動一個帶著個體插件的 DSH 執行期（見 harness.ts）。
 * 工具審核與個體主動提出的問題都在終端機回答；DSH 的診斷輸出寫到 log 檔，不混進對話。
 *
 * 用法：scripts/temir.sh chat [--model deepseek|local] [--session <id>] [--show-thinking]
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { HarnessProcess, INDIVIDUAL_PATCH, MODELS, textOf, type Answer, type Block, type ModelName } from './harness.ts'

const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s)

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
  if (!(modelName in MODELS)) throw new Error(`未知的模型 ${values.model}；可用：${Object.keys(MODELS).join('、')}`)
  const route = MODELS[modelName]

  const logDir = join(process.env['TEMIR_CACHE'] ?? join(homedir(), '.cache', 'temir'), 'logs')
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, `chat-${new Date().toISOString().replaceAll(':', '-')}.log`)

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
  // 以有緩衝的逐行迭代器讀取，管線輸入（腳本化測試）時才不會在等待模型時漏掉行。
  const lines = rl[Symbol.asyncIterator]()
  const ask = async (prompt: string): Promise<string | undefined> => {
    process.stdout.write(prompt)
    const next = await lines.next()
    return next.done ? undefined : String(next.value)
  }

  const harness = await HarnessProcess.start({
    model: modelName,
    patches: [INDIVIDUAL_PATCH],
    cwd: process.cwd(),
    env: process.env,
    logPath,
    async onApproval(request) {
      const reason = request.reason ? `（${request.reason}）` : ''
      const answer = (await ask(`⚠ 個體想使用 ${request.toolName}${reason}，允許這一次？(y/N) `)) ?? ''
      return /^y(es)?$/i.test(answer.trim()) ? 'allowed-once' : 'rejected'
    },
    async onQuestions(_sessionId, questions) {
      const answers: Answer[] = []
      for (const q of questions) {
        console.log(`\n個體問你${q.header ? `［${q.header}］` : ''}：${q.question}`)
        if (q.detail) console.log(dim(q.detail))
        q.options?.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}${o.description ? dim(` — ${o.description}`) : ''}`))
        const hint = q.options?.length ? `輸入編號${q.multiSelect ? '（可用逗號分隔多個）' : ''}或直接回答` : '回答'
        const raw = ((await ask(`${hint}> `)) ?? '').trim()
        const picks = raw.split(/[,，\s]+/).map((s) => Number.parseInt(s, 10))
        const options = q.options ?? []
        const labels = options.length > 0 && picks.every((n) => n >= 1 && n <= options.length) ? picks.map((n) => options[n - 1]!.label) : []
        answers.push(labels.length > 0 ? { id: q.id, selected: labels } : { id: q.id, selected: [], custom: raw })
      }
      return answers
    },
  })

  const sessionId = values.session ?? `session-${randomUUID()}`
  harness.onSessionEvent((id, event) => {
    if (id !== sessionId) return
    if (event.type === 'user/message') {
      const source = event.data.source as { kind: string }
      if (source.kind === 'temir-recall') {
        const n = textOf(event.data.content as readonly Block[]).split('\n').filter((line) => line.startsWith('- [')).length
        console.log(dim(`（自動回憶：取回 ${n} 筆過往片段）`))
      }
    } else if (event.type === 'assistant/message') {
      for (const block of event.data.message.content as readonly Block[]) {
        if (block.type === 'reasoning' && values['show-thinking'] && block.text) console.log(dim(`（思考）${block.text}`))
        if (block.type === 'text' && block.text?.trim()) console.log(`\n個體> ${block.text.trim()}\n`)
        if (block.type === 'tool-call') console.log(dim(`  ⟳ ${block.name}：${oneLine(block.arguments ?? '', 160)}`))
      }
    } else if (event.type === 'tool/result' && event.data.message.isError) {
      console.log(dim(`  ✗ 工具失敗：${oneLine(textOf(event.data.message.content as readonly Block[]), 200)}`))
    }
  })
  if (values.session) await harness.resume(sessionId)

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
      await harness.run(sessionId, line)
    }
  } catch (error) {
    console.error(error)
  } finally {
    rl.close()
    const code = await harness.close()
    if (code !== 0) console.error(`DSH 執行期結束碼 ${code}，詳見 ${logPath}`)
  }
}

await main()
