/**
 * 實驗執行器：在一個條件下，依資料集跑完歷史 session 與探針，逐輪寫出紀錄。
 *
 * 用法（先 `source scripts/env.sh`）：
 *   node experiments/runner/run.ts --dataset experiments/datasets/memory-v1.json \
 *     --condition temir --history-model deepseek --probe-model deepseek [--probes q01,q02] [--run-id ...]
 *   換模型的 cell：加 `--from-run <歷史已跑完的 runId>`，沿用它的「歷史結束」快照，只跑探針。
 *
 * 條件：baseline＝原始 DSH sdk profile（不載入個體插件）；temir＝DSH＋個體；
 *       temir-no-autorecall、temir-no-snapshot＝消融（patches/ 下的設定）。
 *
 * 隔離：每個 run 有自己的生命日誌、DSH home 與工作目錄（放在 ~/.cache/temir/experiments/<runId>，ext4）。
 * 歷史全部跑完後拍快照；每題探針（以及每一次重複，見資料集 `meta.repeats`）之前把三者還原成快照，
 * 題與題之間不互相污染。DSH 的使用者層級指令檔（`$DSH_AGENTS_HOME/AGENTS.md`）指向空目錄。
 *
 * 目錄配置（`--layout`）：
 * - adjacent（v1，預設）：life、dsh-home、workspace、agents-home 四個目錄相鄰。
 * - home（v2）：模擬一個全新使用者帳號：HOME＝<state>/home，DSH 在 ~/.dsh、生命日誌在
 *   ~/.local/share/temir、工作目錄在 ~/workspace。兩個條件相同；原始 DSH 一樣可以自己去翻 ~/.dsh。
 * 原始 DSH 也保有同樣的工具與工作目錄（它若自己寫筆記檔，也會留到探針階段），比較才公平。
 *
 * 輸出（repo 內）：experiments/runs/<runId>/config.json、records.jsonl、run-summary.json。
 * records.jsonl 的格式是評估器的輸入契約（見 experiments/specs/）。
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { HarnessProcess, INDIVIDUAL_PATCH, MODELS, REPO, textOf, type Block, type ModelName } from '../../cli/harness.ts'

const RUNNER = join(REPO, 'experiments', 'runner')

export const CONDITIONS = {
  baseline: [] as string[],
  temir: [INDIVIDUAL_PATCH],
  'temir-no-autorecall': [INDIVIDUAL_PATCH, join(RUNNER, 'patches', 'no-autorecall.yml')],
  'temir-no-snapshot': [INDIVIDUAL_PATCH, join(RUNNER, 'patches', 'no-snapshot.yml')],
  // 2026-10-29 起的條件（ADR-0002）：按需披露、關閉 RD、關閉 JitRL 經驗修正。
  'temir-progressive': [INDIVIDUAL_PATCH, join(RUNNER, 'patches', 'progressive.yml')],
  'temir-full': [INDIVIDUAL_PATCH, join(RUNNER, 'patches', 'full-disclosure.yml')],
  'temir-no-rd': [INDIVIDUAL_PATCH, join(RUNNER, 'patches', 'no-rd.yml')],
  'temir-no-jitrl': [INDIVIDUAL_PATCH, join(RUNNER, 'patches', 'no-jitrl.yml')],
} as const
export type Condition = keyof typeof CONDITIONS

interface Dataset {
  readonly id: string
  readonly histories: readonly { readonly id: string; readonly turns: readonly string[] }[]
  readonly probes: readonly { readonly id: string; readonly turns: readonly string[]; readonly meta?: { readonly repeats?: number } }[]
}

export interface TurnRecord {
  user: string
  assistant: string
  toolCalls: { name: string; arguments: string }[]
  recallInjected: number | null
  error: string | null
  ms: number
  usage: unknown[]
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

const QUESTION_REPLY = '（實驗中，對方不回答這個問題。請依你自己的判斷繼續。）'

function git(...args: string[]): string {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim()
}

async function deepseekBalance(): Promise<number | null> {
  const key = process.env['DEEPSEEK_API_KEY']
  if (!key) return null
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` } })
    const body = (await res.json()) as { balance_infos?: { currency: string; total_balance: string }[] }
    const usd = body.balance_infos?.find((b) => b.currency === 'USD')
    return usd ? Number(usd.total_balance) : null
  } catch {
    return null
  }
}

/**
 * 生命日誌中，有可見回覆但還沒有任何自我陳述擷取嘗試（memory/aux）的回覆數。
 * 與 temir-recall 的補做條件一致（individual/src/recall/index.ts catchUp）。
 */
export function pendingSelfStatements(lifeDb: string): number {
  if (!existsSync(lifeDb)) return 0
  const db = new DatabaseSync(lifeDb, { readOnly: true })
  try {
    const rows = db
      .prepare(
        `SELECT e.id, e.data FROM events e WHERE e.kind = 'dsh/assistant/message' AND e.text IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM links l JOIN events a ON a.id = l.src WHERE l.dst = e.id AND a.kind = 'memory/aux')`,
      )
      .all() as { id: string; data: string }[]
    return rows.filter((row) => {
      const content = (JSON.parse(row.data) as { data?: { message?: { content?: Block[] } } }).data?.message?.content ?? []
      return textOf(content).trim().length > 0
    }).length
  } finally {
    db.close()
  }
}

interface Layout {
  /** 拍快照與還原時複製的頂層目錄。 */
  readonly parts: readonly string[]
  readonly env: (state: string) => Record<string, string>
  readonly cwd: (state: string) => string
  readonly lifeDb: (state: string) => string
}

export const LAYOUTS: Record<'adjacent' | 'home', Layout> = {
  adjacent: {
    parts: ['life', 'dsh-home', 'workspace', 'agents-home'],
    env: (s) => ({ TEMIR_HOME: join(s, 'life'), DSH_HOME: join(s, 'dsh-home'), DSH_AGENTS_HOME: join(s, 'agents-home') }),
    cwd: (s) => join(s, 'workspace'),
    lifeDb: (s) => join(s, 'life', 'life.db'),
  },
  home: {
    parts: ['home'],
    env: (s) => ({
      HOME: join(s, 'home'),
      TEMIR_HOME: join(s, 'home', '.local', 'share', 'temir'),
      DSH_HOME: join(s, 'home', '.dsh'),
      DSH_AGENTS_HOME: join(s, 'home', '.agents'),
    }),
    cwd: (s) => join(s, 'home', 'workspace'),
    lifeDb: (s) => join(s, 'home', '.local', 'share', 'temir', 'life.db'),
  },
}

/** 生命日誌中個體輔助呼叫（擷取事實、線索詞與自我陳述）的次數與失敗次數。 */
export function auxStats(lifeDb: string): { calls: number; errors: number } {
  if (!existsSync(lifeDb)) return { calls: 0, errors: 0 }
  const db = new DatabaseSync(lifeDb, { readOnly: true })
  try {
    const rows = db.prepare(`SELECT data FROM events WHERE kind = 'memory/aux'`).all() as { data: string }[]
    return { calls: rows.length, errors: rows.filter((r) => (JSON.parse(r.data) as { error?: string }).error !== undefined).length }
  } finally {
    db.close()
  }
}

function copyState(from: string, to: string, layout: Layout): void {
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  for (const part of layout.parts) {
    if (existsSync(join(from, part))) cpSync(join(from, part), join(to, part), { recursive: true })
    else mkdirSync(join(to, part), { recursive: true })
  }
  // 工作目錄與（空的）使用者層級指令目錄一定存在。
  mkdirSync(layout.cwd(to), { recursive: true })
  mkdirSync(layout.env(to)['DSH_AGENTS_HOME']!, { recursive: true })
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dataset: { type: 'string' },
      condition: { type: 'string' },
      'history-model': { type: 'string', default: 'deepseek' },
      'probe-model': { type: 'string' },
      probes: { type: 'string' },
      'run-id': { type: 'string' },
      'from-run': { type: 'string' },
      layout: { type: 'string', default: 'adjacent' },
      // 'last'（v1）：只記每輪最後一則可見文字；'all'（v2）：每輪所有可見文字依序以空行連接。
      'assistant-text': { type: 'string', default: 'last' },
      'turn-timeout-ms': { type: 'string', default: '900000' },
      // 連續這麼多題探針失敗就中止整個 run：多半是基礎設施故障（例如代理或供應商斷線），繼續跑只會產生無效紀錄。
      'max-consecutive-failures': { type: 'string', default: '3' },
      // 多個 run 平行執行時，帳戶餘額差無法歸屬到單一 run；改由批次腳本量總花費。
      'no-balance': { type: 'boolean', default: false },
    },
  })
  if (!values.dataset || !values.condition) throw new Error('需要 --dataset 與 --condition')
  const condition = values.condition as Condition
  if (!(condition in CONDITIONS)) throw new Error(`未知條件 ${condition}；可用：${Object.keys(CONDITIONS).join('、')}`)
  const historyModel = values['history-model'] as ModelName
  const probeModel = (values['probe-model'] ?? historyModel) as ModelName
  for (const m of [historyModel, probeModel]) if (!(m in MODELS)) throw new Error(`未知模型 ${m}`)
  const turnTimeoutMs = Number(values['turn-timeout-ms'])
  const maxConsecutiveFailures = Number(values['max-consecutive-failures'])

  const datasetPath = join(process.cwd(), values.dataset)
  const datasetRaw = readFileSync(datasetPath)
  const dataset = JSON.parse(datasetRaw.toString('utf8')) as Dataset
  const probeFilter = values.probes ? new Set(values.probes.split(',')) : undefined
  const probes = dataset.probes.filter((p) => !probeFilter || probeFilter.has(p.id))
  if (probeFilter && probes.length !== probeFilter.size) throw new Error('--probes 含有資料集中不存在的 id')

  const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..+$/, '')
  const runId = values['run-id'] ?? `${stamp}_${dataset.id}_${condition}_${MODELS[historyModel].model}_${MODELS[probeModel].model}`
  const outDir = join(REPO, 'experiments', 'runs', runId)
  const stateDir = join(process.env['TEMIR_CACHE'] ?? join(homedir(), '.cache', 'temir'), 'experiments', runId)
  if (existsSync(outDir)) throw new Error(`run 已存在：${outDir}`)
  mkdirSync(outDir, { recursive: true })
  mkdirSync(join(stateDir, 'logs'), { recursive: true })
  const layoutName = values.layout as keyof typeof LAYOUTS
  const layout = LAYOUTS[layoutName]
  if (!layout) throw new Error(`未知的目錄配置 ${values.layout}；可用：${Object.keys(LAYOUTS).join('、')}`)
  const assistantText = values['assistant-text']
  if (assistantText !== 'last' && assistantText !== 'all') throw new Error(`未知的 --assistant-text ${assistantText}；可用：last、all`)
  const live = join(stateDir, 'live')
  copyState(join(stateDir, 'none'), live, layout)
  const experimentsRoot = join(process.env['TEMIR_CACHE'] ?? join(homedir(), '.cache', 'temir'), 'experiments')
  const fromRun = values['from-run']
  if (fromRun) {
    const from = JSON.parse(readFileSync(join(REPO, 'experiments', 'runs', fromRun, 'config.json'), 'utf8')) as {
      condition: string
      historyModel: { model: string }
      dataset: { sha256: string }
      layout?: string
    }
    if (from.condition !== condition) throw new Error(`--from-run 的條件是 ${from.condition}，不是 ${condition}`)
    if ((from.layout ?? 'adjacent') !== layoutName) throw new Error(`--from-run 的目錄配置是 ${from.layout ?? 'adjacent'}，不是 ${layoutName}`)
    if (from.historyModel.model !== MODELS[historyModel].model) throw new Error(`--from-run 的歷史模型是 ${from.historyModel.model}`)
    if (from.dataset.sha256 !== sha256(datasetRaw)) throw new Error('--from-run 使用的資料集版本不同')
    if (!existsSync(join(experimentsRoot, fromRun, 'snapshot'))) throw new Error(`找不到 ${fromRun} 的歷史快照`)
  }

  const patches = CONDITIONS[condition]
  const config = {
    runId,
    dataset: { id: dataset.id, path: relative(REPO, datasetPath), sha256: sha256(datasetRaw) },
    condition,
    patches: patches.map((p) => ({ path: relative(REPO, p), sha256: sha256(readFileSync(p)) })),
    historyModel: MODELS[historyModel],
    probeModel: MODELS[probeModel],
    probes: probes.map((p) => ({ id: p.id, repeats: p.meta?.repeats ?? 1 })),
    historyFrom: fromRun ?? null,
    turnTimeoutMs,
    // 所有條件相同：工具審核一律允許一次（記在 logs/approvals.log），受試者提問一律回覆同一句話（logs/questions.log）。
    approvals: 'allowed-once for every request',
    questionReply: QUESTION_REPLY,
    layout: layoutName,
    assistantText,
    isolation: 'fresh TEMIR_HOME, DSH_HOME, empty workspace and empty DSH_AGENTS_HOME per run; snapshot restored before every probe repeat',
    code: { commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').length > 0, diffSha256: sha256(git('diff', 'HEAD')) },
    runtime: { node: process.version, dsh: execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim() },
    stateDir,
    startedAt: new Date().toISOString(),
  }
  writeFileSync(join(outDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`)
  const usesDeepseek = !values['no-balance'] && (historyModel === 'deepseek' || probeModel === 'deepseek')
  const balanceBefore = usesDeepseek ? await deepseekBalance() : null

  const recordsPath = join(outDir, 'records.jsonl')
  const datasetSha256 = config.dataset.sha256
  let errors = 0

  /** 在一個 DSH 執行期中跑一個 session（多輪），回傳逐輪紀錄。執行期出錯時丟出，由呼叫端重啟。 */
  async function runSession(harness: HarnessProcess, turns: readonly string[]): Promise<{ sessionId: string; records: TurnRecord[] }> {
    const sessionId = `session-${randomUUID()}`
    const records: TurnRecord[] = []
    let current: TurnRecord | undefined
    const stop = harness.onSessionEvent((id, event) => {
      if (id !== sessionId || !current) return
      if (event.type === 'assistant/message') {
        const blocks = event.data.message.content as readonly Block[]
        const text = textOf(blocks).trim()
        if (text) current.assistant = assistantText === 'all' && current.assistant ? `${current.assistant}\n\n${text}` : text
        for (const b of blocks) if (b.type === 'tool-call') current.toolCalls.push({ name: b.name ?? '', arguments: b.arguments ?? '' })
        if (event.data.usage) current.usage.push(event.data.usage)
      } else if (event.type === 'user/message' && (event.data.source as { kind: string }).kind === 'temir-recall') {
        current.recallInjected = textOf(event.data.content as readonly Block[]).split('\n').filter((l) => l.startsWith('- [')).length
      } else if (event.type === 'turn/end') {
        // DSH 以錯誤結束回合時（例如模型連線失敗），session/wait 仍會正常返回；必須從 turn/end 的原因記下錯誤，
        // 否則回合會被當成「沒有回覆」計分（2026-10-29 dev1 的教訓）。
        const reason = (event.data as { reason?: { kind: string; error?: { message?: string; code?: string } } }).reason
        if (reason && reason.kind !== 'completed') {
          current.error = `turn ended: ${reason.kind}${reason.error ? ` [${reason.error.code ?? ''}] ${reason.error.message ?? ''}` : ''}`
        }
      }
    })
    try {
      for (const user of turns) {
        const turn: TurnRecord = { user, assistant: '', toolCalls: [], recallInjected: condition === 'baseline' ? null : 0, error: null, ms: 0, usage: [] }
        current = turn
        records.push(turn)
        const started = Date.now()
        try {
          await harness.run(sessionId, user, AbortSignal.timeout(turnTimeoutMs))
        } catch (error) {
          turn.error = String(error)
        } finally {
          turn.ms = Date.now() - started
        }
        if (turn.error !== null) throw Object.assign(new Error(`turn failed: ${turn.error}`), { records, sessionId })
      }
      return { sessionId, records }
    } finally {
      stop()
    }
  }

  function write(
    phase: 'history' | 'probe',
    itemId: string,
    model: ModelName,
    sessionId: string,
    records: TurnRecord[],
    startedAt: string,
    repeat?: number,
  ): void {
    errors += records.filter((r) => r.error !== null).length
    const line = {
      runId,
      dataset: dataset.id,
      datasetSha256,
      condition,
      historyModel: MODELS[historyModel].model,
      probeModel: MODELS[probeModel].model,
      phase,
      itemId,
      ...(repeat === undefined ? {} : { repeat }),
      model: MODELS[model].model,
      sessionId,
      turns: records,
      startedAt,
      endedAt: new Date().toISOString(),
    }
    appendFileSync(recordsPath, `${JSON.stringify(line)}\n`)
  }

  function launch(model: ModelName, state: string, label: string): Promise<HarnessProcess> {
    return HarnessProcess.start({
      model,
      patches,
      cwd: layout.cwd(state),
      env: { ...process.env, ...layout.env(state) },
      logPath: join(stateDir, 'logs', `${label}.log`),
      // 每個條件同樣允許工具執行；審核紀錄在 log 中。
      onApproval: async (request) => {
        appendFileSync(join(stateDir, 'logs', 'approvals.log'), `${label}\t${request.toolName}\t${request.reason ?? ''}\n`)
        return 'allowed-once'
      },
      // 受試者若主動提問，一律回覆同一句話，並留下紀錄。
      onQuestions: async (sessionId, questions) => {
        appendFileSync(join(stateDir, 'logs', 'questions.log'), `${label}\t${sessionId}\t${JSON.stringify(questions)}\n`)
        return questions.map((q) => ({ id: q.id, selected: [], custom: QUESTION_REPLY }))
      },
    })
  }

  /** 1. 歷史：同一個執行期依序跑完所有歷史 session，沉澱後拍成「歷史結束」快照。 */
  async function runHistories(snapshot: string): Promise<{ exit: number | null; unsettled: number | null }> {
    let harness = await launch(historyModel, live, 'history')
    for (const history of dataset.histories) {
      const startedAt = new Date().toISOString()
      try {
        const { sessionId, records } = await runSession(harness, history.turns)
        write('history', history.id, historyModel, sessionId, records, startedAt)
      } catch (error) {
        const failed = error as Error & { records?: TurnRecord[]; sessionId?: string }
        const records = failed.records ?? []
        for (const user of history.turns.slice(records.length)) {
          records.push({ user, assistant: '', toolCalls: [], recallInjected: null, error: 'skipped: earlier turn failed', ms: 0, usage: [] })
        }
        write('history', history.id, historyModel, failed.sessionId ?? '', records, startedAt)
        await harness.kill()
        harness = await launch(historyModel, live, `history-after-${history.id}`)
      }
    }
    const exit = await harness.close()

    // 沉澱：DSH 關閉程序有 5 秒上限，背景的自我陳述擷取可能被截斷。重新啟動一次讓插件補做，
    // 直到生命日誌中沒有待處理的回覆（或逾時），讓每題探針都從同一個完整的快照開始。
    let unsettled: number | null = null
    if (condition !== 'baseline') {
      const lifeDb = layout.lifeDb(live)
      unsettled = pendingSelfStatements(lifeDb)
      if (unsettled > 0) {
        const settler = await launch(historyModel, live, 'settle')
        const deadline = Date.now() + 15 * 60_000
        while ((unsettled = pendingSelfStatements(lifeDb)) > 0 && Date.now() < deadline) await sleep(2000)
        await settler.close()
      }
    }

    // 快照：歷史結束時的生命日誌、DSH home、工作目錄。
    copyState(live, snapshot, layout)
    return { exit, unsettled }
  }

  // 換模型的 cell 沿用另一個 run 的快照，不重跑歷史。
  const snapshot = join(stateDir, 'snapshot')
  if (fromRun) copyState(join(experimentsRoot, fromRun, 'snapshot'), snapshot, layout)
  const histories = fromRun ? { exit: null, unsettled: null } : await runHistories(snapshot)

  // 3. 探針：每題（每次重複）都從快照還原，在新的執行期與新的 session 中提問。
  let consecutiveFailures = 0
  for (const probe of probes) {
    const repeats = Math.max(1, probe.meta?.repeats ?? 1)
    for (let repeat = 0; repeat < repeats; repeat++) {
      const state = join(stateDir, 'probes', probe.id, `r${repeat}`)
      copyState(snapshot, state, layout)
      const startedAt = new Date().toISOString()
      const label = `probe-${probe.id}-r${repeat}`
      let probeHarness: HarnessProcess | undefined
      try {
        probeHarness = await launch(probeModel, state, label)
        const { sessionId, records } = await runSession(probeHarness, probe.turns)
        write('probe', probe.id, probeModel, sessionId, records, startedAt, repeat)
        await probeHarness.close()
        consecutiveFailures = 0
      } catch (error) {
        const failed = error as Error & { records?: TurnRecord[]; sessionId?: string }
        const records = failed.records ?? [{ user: probe.turns[0] ?? '', assistant: '', toolCalls: [], recallInjected: null, error: String(error), ms: 0, usage: [] }]
        write('probe', probe.id, probeModel, failed.sessionId ?? '', records, startedAt, repeat)
        await probeHarness?.kill()
        if (++consecutiveFailures >= maxConsecutiveFailures) {
          throw new Error(`aborting ${runId}: ${consecutiveFailures} consecutive probe failures (last: ${records.at(-1)?.error ?? String(error)})`)
        }
      }
    }
  }

  // 輔助呼叫的失敗（例如限流）不一定成為回合錯誤；分歷史與探針兩段統計（探針段扣除快照中已有的部分）。
  const historyAux = auxStats(layout.lifeDb(snapshot))
  const probeAux = { calls: 0, errors: 0 }
  for (const probe of probes) {
    for (let repeat = 0; repeat < Math.max(1, probe.meta?.repeats ?? 1); repeat++) {
      const stats = auxStats(layout.lifeDb(join(stateDir, 'probes', probe.id, `r${repeat}`)))
      probeAux.calls += Math.max(0, stats.calls - historyAux.calls)
      probeAux.errors += Math.max(0, stats.errors - historyAux.errors)
    }
  }

  const balanceAfter = usesDeepseek ? await deepseekBalance() : null
  const summary = {
    runId,
    endedAt: new Date().toISOString(),
    histories: fromRun ? 0 : dataset.histories.length,
    historyFrom: fromRun ?? null,
    probes: probes.length,
    probeSessions: probes.reduce((n, p) => n + Math.max(1, p.meta?.repeats ?? 1), 0),
    turnErrors: errors,
    historyRuntimeExitCode: histories.exit,
    // 快照時仍未完成自我陳述擷取的回覆數（應為 0；非 0 代表沉澱逾時）。
    unsettledSelfStatements: histories.unsettled,
    auxiliaryCalls: { history: historyAux, probes: probeAux },
    // 只記錄花費（帳戶餘額前後差，解析度 US$0.01），不記錄餘額本身。
    deepseekSpentUsd: balanceBefore !== null && balanceAfter !== null ? Number((balanceBefore - balanceAfter).toFixed(2)) : null,
  }
  writeFileSync(join(outDir, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(JSON.stringify(summary))
}

await main()
