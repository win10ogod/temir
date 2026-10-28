/**
 * 實驗執行器：在一個條件下，依資料集跑完歷史 session 與探針，逐輪寫出紀錄。
 *
 * 用法（先 `source scripts/env.sh`）：
 *   node experiments/runner/run.ts --dataset experiments/datasets/memory-v1.json \
 *     --condition temir --history-model deepseek --probe-model deepseek [--probes q01,q02] [--run-id ...]
 *
 * 條件：baseline＝原始 DSH sdk profile（不載入個體插件）；temir＝DSH＋個體；
 *       temir-no-autorecall、temir-no-snapshot＝消融（patches/ 下的設定）。
 *
 * 隔離：每個 run 有自己的生命日誌、DSH home 與工作目錄（放在 ~/.cache/temir/experiments/<runId>，ext4）。
 * 歷史全部跑完後拍快照；每題探針之前把三者還原成快照，題與題之間不互相污染。
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
} as const
export type Condition = keyof typeof CONDITIONS

interface Dataset {
  readonly id: string
  readonly histories: readonly { readonly id: string; readonly turns: readonly string[] }[]
  readonly probes: readonly { readonly id: string; readonly turns: readonly string[] }[]
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

function copyState(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  for (const part of ['life', 'dsh-home', 'workspace']) {
    if (existsSync(join(from, part))) cpSync(join(from, part), join(to, part), { recursive: true })
    else mkdirSync(join(to, part), { recursive: true })
  }
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
      'turn-timeout-ms': { type: 'string', default: '900000' },
    },
  })
  if (!values.dataset || !values.condition) throw new Error('需要 --dataset 與 --condition')
  const condition = values.condition as Condition
  if (!(condition in CONDITIONS)) throw new Error(`未知條件 ${condition}；可用：${Object.keys(CONDITIONS).join('、')}`)
  const historyModel = values['history-model'] as ModelName
  const probeModel = (values['probe-model'] ?? historyModel) as ModelName
  for (const m of [historyModel, probeModel]) if (!(m in MODELS)) throw new Error(`未知模型 ${m}`)
  const turnTimeoutMs = Number(values['turn-timeout-ms'])

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
  const live = join(stateDir, 'live')
  copyState(join(stateDir, 'none'), live)

  const patches = CONDITIONS[condition]
  const config = {
    runId,
    dataset: { id: dataset.id, path: relative(REPO, datasetPath), sha256: sha256(datasetRaw) },
    condition,
    patches: patches.map((p) => ({ path: relative(REPO, p), sha256: sha256(readFileSync(p)) })),
    historyModel: MODELS[historyModel],
    probeModel: MODELS[probeModel],
    probes: probes.map((p) => p.id),
    turnTimeoutMs,
    code: { commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').length > 0, diffSha256: sha256(git('diff', 'HEAD')) },
    runtime: { node: process.version, dsh: execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim() },
    stateDir,
    startedAt: new Date().toISOString(),
  }
  writeFileSync(join(outDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`)
  const usesDeepseek = historyModel === 'deepseek' || probeModel === 'deepseek'
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
        if (text) current.assistant = text
        for (const b of blocks) if (b.type === 'tool-call') current.toolCalls.push({ name: b.name ?? '', arguments: b.arguments ?? '' })
        if (event.data.usage) current.usage.push(event.data.usage)
      } else if (event.type === 'user/message' && (event.data.source as { kind: string }).kind === 'temir-recall') {
        current.recallInjected = textOf(event.data.content as readonly Block[]).split('\n').filter((l) => l.startsWith('- [')).length
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
          throw Object.assign(new Error(`turn failed: ${turn.error}`), { records, sessionId })
        } finally {
          turn.ms = Date.now() - started
        }
      }
      return { sessionId, records }
    } finally {
      stop()
    }
  }

  function write(phase: 'history' | 'probe', itemId: string, model: ModelName, sessionId: string, records: TurnRecord[], startedAt: string): void {
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
      cwd: join(state, 'workspace'),
      env: { ...process.env, TEMIR_HOME: join(state, 'life'), DSH_HOME: join(state, 'dsh-home') },
      logPath: join(stateDir, 'logs', `${label}.log`),
      // 每個條件同樣允許工具執行；審核紀錄在 log 中。
      onApproval: async (request) => {
        appendFileSync(join(stateDir, 'logs', 'approvals.log'), `${label}\t${request.toolName}\t${request.reason ?? ''}\n`)
        return 'allowed-once'
      },
      // 受試者若主動提問，一律回覆同一句話，並留下紀錄。
      onQuestions: async (sessionId, questions) => {
        appendFileSync(join(stateDir, 'logs', 'questions.log'), `${label}\t${sessionId}\t${JSON.stringify(questions)}\n`)
        return questions.map((q) => ({ id: q.id, selected: [], custom: '（實驗中，對方不回答這個問題。請依你自己的判斷繼續。）' }))
      },
    })
  }

  // 1. 歷史：同一個執行期依序跑完所有歷史 session。
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
  const historyExit = await harness.close()

  // 1b. 沉澱：DSH 關閉程序有 5 秒上限，背景的自我陳述擷取可能被截斷。重新啟動一次讓插件補做，
  //     直到生命日誌中沒有待處理的回覆（或逾時），讓每題探針都從同一個完整的快照開始。
  let settleRemaining: number | null = null
  if (condition !== 'baseline') {
    const lifeDb = join(live, 'life', 'life.db')
    settleRemaining = pendingSelfStatements(lifeDb)
    if (settleRemaining > 0) {
      const settler = await launch(historyModel, live, 'settle')
      const deadline = Date.now() + 15 * 60_000
      while ((settleRemaining = pendingSelfStatements(lifeDb)) > 0 && Date.now() < deadline) await sleep(2000)
      await settler.close()
    }
  }

  // 2. 快照：歷史結束時的生命日誌、DSH home、工作目錄。
  const snapshot = join(stateDir, 'snapshot')
  copyState(live, snapshot)

  // 3. 探針：每題從快照還原，在新的執行期與新的 session 中提問。
  for (const probe of probes) {
    const state = join(stateDir, 'probes', probe.id)
    copyState(snapshot, state)
    const startedAt = new Date().toISOString()
    let probeHarness: HarnessProcess | undefined
    try {
      probeHarness = await launch(probeModel, state, `probe-${probe.id}`)
      const { sessionId, records } = await runSession(probeHarness, probe.turns)
      write('probe', probe.id, probeModel, sessionId, records, startedAt)
      await probeHarness.close()
    } catch (error) {
      const failed = error as Error & { records?: TurnRecord[]; sessionId?: string }
      const records = failed.records ?? [{ user: probe.turns[0] ?? '', assistant: '', toolCalls: [], recallInjected: null, error: String(error), ms: 0, usage: [] }]
      write('probe', probe.id, probeModel, failed.sessionId ?? '', records, startedAt)
      await probeHarness?.kill()
    }
  }

  const balanceAfter = usesDeepseek ? await deepseekBalance() : null
  const summary = {
    runId,
    endedAt: new Date().toISOString(),
    histories: dataset.histories.length,
    probes: probes.length,
    turnErrors: errors,
    historyRuntimeExitCode: historyExit,
    // 快照時仍未完成自我陳述擷取的回覆數（應為 0；非 0 代表沉澱逾時）。
    unsettledSelfStatements: settleRemaining,
    // 只記錄花費（帳戶餘額前後差，解析度 US$0.01），不記錄餘額本身。
    deepseekSpentUsd: balanceBefore !== null && balanceAfter !== null ? Number((balanceBefore - balanceAfter).toFixed(2)) : null,
  }
  writeFileSync(join(outDir, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(JSON.stringify(summary))
}

await main()
