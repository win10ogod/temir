/**
 * 本機 host 的程序管理與 dsh-im 的 Telegram 綁定（改進清單第 10 項；scripts/host.sh 呼叫這裡）。
 *
 * - PID 檔：`<pid> <開始時間>`。開始時間取自 /proc/<pid>/stat（第 22 欄，開機後的 clock ticks）；
 *   結束前確認 PID 還是同一個程序，不會因為 PID 被重用而結束到別的程序。不再用 `pgrep -f` 以樣式結束程序
 *   （曾經兩次結束到代理自己的 shell；session log）。程序以 setsid 啟動時，連同它的程序群組一起結束。
 * - 啟動網址：DSH Web 把啟動用的 token 放在網址的 `token` 參數（dsh-client-connection@0.2.2-alpha.2 lib/index.js:276、442）；
 *   `GET /connect?token=…` 以 302 回應並設定 cookie（同檔 505–538 行）。token 只用來換 cookie，不印出、不寫進檔案。
 * - dsh-im（@xmanrui/dsh-im@5.8.0）的本機管理 API：`POST /api/dsh-im/telegram`，
 *   內容 `{"type":"client-request","rpcId",…,"method":"dsh-im/telegram","payload":{"method","payload"}}`（plugin-src/management-rpc.mjs）；
 *   綁定 `bot.bind-credentials {token}`、存取設定 `bot.access-policy.set {botId, policy}`（plugin-src/host/channels/shared/rpc.mjs、
 *   access-policy-rpc.mjs；policy 的格式見 src/channels/shared/access-policy.mjs）。
 *   安全模式：私聊只允許白名單（只有使用者），群組全部拒絕（ADR-0006；e2e-38）。
 * 金鑰：token 與使用者的 User ID 只從環境變數 TELEGRAM_BOT_TOKEN、TELEGRAM_TEST_USER_ID 讀取（CLAUDE.md 規則 8），輸出中只出現遮罩。
 */
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// ── PID 檔 ──

export interface PidRecord {
  readonly pid: number
  /** /proc/<pid>/stat 的開始時間；讀不到（非 Linux）時為 null。 */
  readonly start: string | null
}

/** /proc/<pid>/stat 中括號之後的欄位（程序名稱可能含空白與括號，所以從最後一個「) 」之後切）。 */
function statFields(pid: number): string[] | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(') ') + 2).trim().split(/\s+/)
  } catch {
    return undefined
  }
}

/** 程序的開始時間（stat 第 22 欄；切掉前兩欄之後是第 20 個）。 */
export function startTime(pid: number): string | null {
  return statFields(pid)?.[19] ?? null
}

/** 程序群組（stat 第 5 欄）。 */
function processGroup(pid: number): number | undefined {
  const g = Number(statFields(pid)?.[2])
  return Number.isInteger(g) ? g : undefined
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function writePid(file: string, pid: number): PidRecord {
  const record = { pid, start: startTime(pid) }
  writeFileSync(file, `${pid} ${record.start ?? '-'}\n`)
  return record
}

/** 讀 PID 檔；不存在或內容不合格時回傳 undefined。 */
export function readPid(file: string): PidRecord | undefined {
  if (!existsSync(file)) return undefined
  const [pid, start] = readFileSync(file, 'utf8').trim().split(/\s+/)
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 1) return undefined
  return { pid: n, start: start && start !== '-' ? start : null }
}

export type PidState = 'missing' | 'running' | 'stale'

/** missing＝沒有 PID 檔；stale＝程序已經不在，或 PID 被別的程序重用（開始時間不同）。 */
export function pidState(file: string): { readonly state: PidState; readonly record?: PidRecord } {
  const record = readPid(file)
  if (!record) return { state: 'missing' }
  if (!alive(record.pid)) return { state: 'stale', record }
  if (record.start !== null && startTime(record.pid) !== record.start) return { state: 'stale', record }
  return { state: 'running', record }
}

/**
 * 結束 PID 檔記下的程序：先 SIGTERM，等 graceMs，還在就 SIGKILL。是程序群組的領頭時連同群組一起結束。
 * PID 檔不存在或已過期時什麼都不結束，只移除過期的 PID 檔。
 */
export async function stopPid(file: string, graceMs = 10_000): Promise<'missing' | 'stale' | 'stopped' | 'killed'> {
  const { state, record } = pidState(file)
  if (state !== 'running' || !record) {
    if (state === 'stale') rmSync(file, { force: true })
    return state === 'missing' ? 'missing' : 'stale'
  }
  const target = processGroup(record.pid) === record.pid ? -record.pid : record.pid
  const signal = (s: NodeJS.Signals) => {
    try {
      process.kill(target, s)
    } catch {
      // 已經結束
    }
  }
  signal('SIGTERM')
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && alive(record.pid) && startTime(record.pid) === record.start) await new Promise((r) => setTimeout(r, 100))
  const killed = alive(record.pid) && startTime(record.pid) === record.start
  if (killed) signal('SIGKILL')
  rmSync(file, { force: true })
  return killed ? 'killed' : 'stopped'
}

// ── 啟動網址與 cookie ──

/** 從 dsh web 的輸出找出帶 token 的啟動網址；回傳不帶 token 的網址與 token。 */
export function launchUrl(text: string): { readonly base: string; readonly token: string } | undefined {
  for (const match of text.matchAll(/https?:\/\/[^\s'"<>]+/g)) {
    try {
      const url = new URL(match[0])
      const token = url.searchParams.get('token')
      if (!token) continue
      url.searchParams.delete('token')
      url.hash = ''
      return { base: `${url.origin}${url.pathname}`.replace(/\/$/, ''), token }
    } catch {
      // 不是網址
    }
  }
  return undefined
}

/** /connect 的回應中，Set-Cookie 的第一個 name=value。 */
export function cookieOf(setCookie: string | null): string | undefined {
  const pair = setCookie?.split(';', 1)[0]?.trim()
  return pair && pair.includes('=') ? pair : undefined
}

/** 以啟動用的 token 換 cookie（不跟隨轉址），寫進 cookieFile（權限 600）。 */
export async function connect(base: string, token: string, cookieFile: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const url = new URL(`${base}/connect`)
  url.searchParams.set('token', token)
  const res = await fetchImpl(url, { redirect: 'manual' })
  const cookie = cookieOf(res.headers.get('set-cookie'))
  if (res.status !== 302 || !cookie) throw new Error(`/connect 沒有換到 cookie（HTTP ${res.status}）`)
  writeFileSync(cookieFile, `${cookie}\n`, { mode: 0o600 })
  chmodSync(cookieFile, 0o600)
}

// ── dsh-im 的 Telegram 綁定 ──

export const DSH_IM_TELEGRAM = 'dsh-im/telegram'

/** dsh-im 管理 API 的請求內容（plugin-src/management-rpc.mjs 的 registerManagementRpc 驗證的形狀）。 */
export function managementRequest(method: string, payload: Record<string, unknown>, rpcId: string = randomUUID()): { readonly type: 'client-request'; readonly rpcId: string; readonly method: string; readonly payload: { readonly method: string; readonly payload: Record<string, unknown> } } {
  return { type: 'client-request', rpcId, method: DSH_IM_TELEGRAM, payload: { method, payload } }
}

/** dsh-im 的 validToken：去掉空白後至少 20 字、不超過 4096 字。 */
export function telegramBindRequest(token: string, rpcId?: string) {
  if (token.trim().length < 20 || token.length > 4096) throw new Error('TELEGRAM_BOT_TOKEN 不是有效的 Bot Token')
  return managementRequest('bot.bind-credentials', { token }, rpcId)
}

/** 安全模式的存取設定：私聊只允許白名單中的使用者；群組是空的白名單，也就是全部拒絕。 */
export function safeAccessPolicy(userId: string, canExecuteCommands = false) {
  const id = userId.trim()
  // access-policy.mjs 的 normalizeAccessPolicyUserId：不能是空的、沒有控制字元、最多 256 字。
  if (!id || id.length > 256 || /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/u.test(id)) throw new Error('TELEGRAM_TEST_USER_ID 不是有效的使用者 ID')
  const closed = { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }
  return {
    direct: { mode: 'allowlist', open: closed, allowlist: { users: [{ id, canExecuteCommands }] } },
    group: { mode: 'allowlist', open: closed, allowlist: { users: [] } },
  } as const
}

export function accessPolicyRequest(botId: string, userId: string, options: { readonly canExecuteCommands?: boolean; readonly rpcId?: string } = {}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(botId)) throw new Error('botId 不合格')
  return managementRequest('bot.access-policy.set', { botId, policy: safeAccessPolicy(userId, options.canExecuteCommands ?? false) }, options.rpcId)
}

interface StatusValue {
  readonly bots?: readonly { readonly botId: string; readonly state?: string }[]
}

/** 綁定之後是哪一個機器人：綁定前沒有、綁定後出現的那一個；重新綁定同一個機器人時，只有一個機器人才能確定。 */
export function boundBotId(before: StatusValue, after: StatusValue): string | undefined {
  const old = new Set((before.bots ?? []).map((b) => b.botId))
  const added = (after.bots ?? []).filter((b) => !old.has(b.botId))
  if (added.length === 1) return added[0]!.botId
  return added.length === 0 && after.bots?.length === 1 ? after.bots[0]!.botId : undefined
}

/** 遮罩：只留頭尾各兩個字。 */
export function mask(value: string): string {
  return value.length <= 6 ? '•••' : `${value.slice(0, 2)}•••${value.slice(-2)}`
}

async function rpc(base: string, cookie: string, request: ReturnType<typeof managementRequest>, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(`${base}/api/${DSH_IM_TELEGRAM}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(request) })
  if (!res.ok) throw new Error(`dsh-im 管理 API HTTP ${res.status}（${request.payload.method}）`)
  const body = (await res.json()) as { result?: { ok: boolean; value?: unknown; error?: { code?: string; message?: string } } }
  if (!body.result?.ok) throw new Error(`dsh-im ${request.payload.method} 失敗：${body.result?.error?.code ?? '?'} ${body.result?.error?.message ?? ''}`)
  return body.result.value
}

/** 綁定使用者的機器人，並立刻設為安全模式。回傳 botId。 */
export async function bindTelegram(base: string, cookie: string, env: { readonly token: string; readonly userId: string }, fetchImpl: typeof fetch = fetch): Promise<string> {
  const bind = telegramBindRequest(env.token)
  const policy = (botId: string) => accessPolicyRequest(botId, env.userId)
  const before = (await rpc(base, cookie, managementRequest('connection.status', {}), fetchImpl)) as StatusValue
  const after = (await rpc(base, cookie, bind, fetchImpl)) as StatusValue
  const botId = boundBotId(before, after)
  if (!botId) throw new Error('綁定後無法確定是哪一個機器人（有多個機器人）；請在 dsh-im 的設定頁設定存取模式')
  await rpc(base, cookie, policy(botId), fetchImpl)
  return botId
}

// ── CLI（scripts/host.sh） ──

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command === 'pid-write') {
    writePid(rest[0]!, Number(rest[1]))
    return 0
  }
  if (command === 'pid-status') {
    const { state, record } = pidState(rest[0]!)
    console.log(state === 'running' ? `執行中（PID ${record!.pid}）` : state === 'stale' ? `沒有在執行（PID 檔過期：${record!.pid}）` : '沒有在執行')
    return state === 'running' ? 0 : 3
  }
  if (command === 'pid-stop') {
    const result = await stopPid(rest[0]!)
    console.log({ missing: '沒有在執行（沒有 PID 檔）', stale: '沒有在執行（移除過期的 PID 檔，沒有結束任何程序）', stopped: '已結束', killed: '已強制結束' }[result])
    return 0
  }
  if (command === 'connect') {
    const [log, cookieFile, base] = rest
    const deadline = Date.now() + 60_000
    for (;;) {
      const found = existsSync(log!) ? launchUrl(readFileSync(log!, 'utf8')) : undefined
      if (found) {
        await connect(found.base, found.token, cookieFile!)
        writeFileSync(base!, `${found.base}\n`)
        console.log(`已連線：${found.base}（cookie 存在 ${cookieFile}）`)
        return 0
      }
      if (Date.now() > deadline) throw new Error(`60 秒內沒有在 ${log} 看到啟動網址`)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (command === 'telegram-bind') {
    const [baseFile, cookieFile] = rest
    const token = process.env['TELEGRAM_BOT_TOKEN'] ?? ''
    const userId = process.env['TELEGRAM_TEST_USER_ID'] ?? ''
    if (!token || !userId) throw new Error('需要 TELEGRAM_BOT_TOKEN 與 TELEGRAM_TEST_USER_ID（~/.config/temir/secrets.env）')
    const botId = await bindTelegram(readFileSync(baseFile!, 'utf8').trim(), readFileSync(cookieFile!, 'utf8').trim(), { token, userId })
    console.log(`已綁定 ${botId}，並設為安全模式：私聊只允許 ${mask(userId)}，群組全部拒絕。`)
    return 0
  }
  console.error('用法：node cli/host.ts pid-write <檔> <pid>｜pid-status <檔>｜pid-stop <檔>｜connect <log> <cookie 檔> <網址檔>｜telegram-bind <網址檔> <cookie 檔>')
  return 2
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (error: unknown) => {
      console.error(String((error as Error).message ?? error))
      process.exitCode = 1
    },
  )
}
