/**
 * temir telegram：讓個體在 Telegram 上與人對話（plan v2 M4；ADR-0006）。
 *
 * - 以 DSH 的 SDK 協定驅動帶著個體插件的 DSH（與 chat.ts 相同，見 harness.ts）；不 fork DSH，也不需要公開網址
 *   （Telegram Bot API 的 getUpdates 長輪詢）。
 * - 每個聊天對應一段 DSH 對話（存在生命資料目錄的 telegram-sessions.json）；同一個聊天的訊息依序處理。
 * - 個體說的每段話都送回那個聊天，包括它主動開口的回合（ADR-0004）。
 * - 只回應白名單（TELEGRAM_ALLOWED_CHAT_IDS）內的聊天：生命紀錄是私人的；不在白名單的聊天只記下 id，不回應。
 * - 工具核准與個體的提問：在聊天中問、等下一則回覆（10 分鐘沒有回覆就拒絕）。
 *   插件的啟用（plugin_activate）一律拒絕：程式碼要在 Web 介面或終端機看過才核准（ADR-0005）。
 * - 金鑰：TELEGRAM_BOT_TOKEN 只放在 ~/.config/temir/secrets.env（scripts/env.sh 載入），不寫進 repo 或 log。
 *
 * 用法：scripts/temir.sh telegram [--model deepseek]
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveHome } from '../individual/src/life/index.ts'
import { HarnessProcess, INDIVIDUAL_PATCH, MODELS, textOf, type Block, type ModelName } from './harness.ts'
import { SessionMap, answerFor, approvalReply, chunkText, formatQuestion, parseAllowed } from './telegram-lib.ts'

interface Update {
  readonly update_id: number
  readonly message?: { readonly chat: { readonly id: number }; readonly text?: string }
}

const REPLY_TIMEOUT_MS = 10 * 60_000

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: 'string', default: process.env['TEMIR_MODEL'] ?? 'deepseek' } } })
  const modelName = values.model as ModelName
  if (!(modelName in MODELS)) throw new Error(`未知的模型 ${values.model}`)
  const token = process.env['TELEGRAM_BOT_TOKEN']
  if (!token) throw new Error('需要 TELEGRAM_BOT_TOKEN：向 @BotFather 建立機器人，把 token 寫進 ~/.config/temir/secrets.env（權限 600）')
  const allowed = parseAllowed(process.env['TELEGRAM_ALLOWED_CHAT_IDS'])
  if (allowed.size === 0) console.error('TELEGRAM_ALLOWED_CHAT_IDS 是空的：不會回應任何聊天。對機器人說一句話，這裡會印出聊天 id，把它加進 secrets.env。')
  const api = async (method: string, body: Record<string, unknown>): Promise<unknown> => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string }
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`)
    return json.result
  }
  const send = async (chat: number, text: string) => {
    for (const part of chunkText(text)) await api('sendMessage', { chat_id: chat, text: part })
  }

  const home = resolveHome(undefined)
  mkdirSync(home, { recursive: true })
  const sessions = new SessionMap(join(home, 'telegram-sessions.json'))
  const logDir = join(process.env['TEMIR_CACHE'] ?? join(homedir(), '.cache', 'temir'), 'logs')
  mkdirSync(logDir, { recursive: true })

  /** 等這個聊天的下一則訊息（核准與提問用）。 */
  const waiting = new Map<number, (text: string) => void>()
  const nextReply = (chat: number) =>
    new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(chat)
        resolve('')
      }, REPLY_TIMEOUT_MS)
      waiting.set(chat, (text) => {
        clearTimeout(timer)
        resolve(text)
      })
    })

  const harness = await HarnessProcess.start({
    model: modelName,
    patches: [INDIVIDUAL_PATCH],
    cwd: process.cwd(),
    env: process.env,
    logPath: join(logDir, `telegram-${new Date().toISOString().replaceAll(':', '-')}.log`),
    async onApproval(request) {
      const chat = sessions.chatOf(request.sessionId)
      if (chat === undefined) return 'rejected'
      if (request.toolName === 'plugin_activate') {
        await send(chat, '（個體想啟用它自己寫的插件。插件的程式碼要在 Web 介面或終端機看過才核准，這裡先拒絕。）')
        return 'rejected'
      }
      await send(chat, `（個體想使用 ${request.toolName}${request.reason ? `：${request.reason}` : ''}。允許這一次嗎？回覆「允許」或「拒絕」。）`)
      return approvalReply(await nextReply(chat)) ?? 'rejected'
    },
    async onQuestions(sessionId, questions) {
      const chat = sessions.chatOf(sessionId)
      const answers = []
      for (const q of questions) {
        if (chat === undefined) {
          answers.push({ id: q.id, selected: [], custom: '（對方現在沒有辦法回答。）' })
          continue
        }
        await send(chat, formatQuestion(q))
        const reply = await nextReply(chat)
        answers.push(reply ? answerFor(q, reply) : { id: q.id, selected: [], custom: '（對方沒有回答。）' })
      }
      return answers
    },
  })
  // 個體說的每段話都送回對應的聊天（包括主動開口的回合）。
  harness.onSessionEvent((sessionId, event) => {
    if (event.type !== 'assistant/message') return
    const chat = sessions.chatOf(sessionId)
    const text = textOf(event.data.message.content as readonly Block[]).trim()
    if (chat !== undefined && text) send(chat, text).catch((error) => console.error(`送出失敗：${error}`))
  })

  const queues = new Map<number, Promise<void>>()
  const enqueue = (chat: number, text: string) => {
    const run = async () => {
      let session = sessions.get(chat)
      if (!session) {
        session = `session-${randomUUID()}`
        sessions.set(chat, session)
      }
      await api('sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => undefined)
      try {
        await harness.run(session, text, AbortSignal.timeout(15 * 60_000))
      } catch (error) {
        await send(chat, `（這一回合出了錯：${error instanceof Error ? error.message : String(error)}）`).catch(() => undefined)
      }
    }
    const task = (queues.get(chat) ?? Promise.resolve()).then(run)
    queues.set(chat, task.catch(() => undefined))
  }

  let stopped = false
  const stop = async () => {
    stopped = true
    await Promise.allSettled([...queues.values()])
    await harness.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
  console.error(`特密爾的 Telegram 通道已啟動（白名單 ${allowed.size} 個聊天）。Ctrl-C 結束。`)

  let offset = 0
  while (!stopped) {
    let updates: Update[] = []
    try {
      updates = (await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] })) as Update[]
    } catch (error) {
      console.error(`getUpdates 失敗：${error}；5 秒後重試`)
      await new Promise((r) => setTimeout(r, 5000))
      continue
    }
    for (const u of updates) {
      offset = u.update_id + 1
      const chat = u.message?.chat.id
      const text = u.message?.text?.trim()
      if (chat === undefined || !text) continue
      if (!allowed.has(chat)) {
        console.error(`未授權的聊天 ${chat}：加進 TELEGRAM_ALLOWED_CHAT_IDS 才會回應`)
        continue
      }
      const pending = waiting.get(chat)
      if (pending) {
        waiting.delete(chat)
        pending(text)
        continue
      }
      if (text === '/start') continue
      enqueue(chat, text)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
