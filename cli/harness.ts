/**
 * 以 DSH 的 SDK 協定驅動一個 DSH 執行期（stdio 上的 newline-delimited JSON-RPC，
 * `@deepseek-ai/dsh-sdk-protocol`）。互動式 CLI 與實驗執行器共用這一份。
 *
 * 一個 HarnessProcess＝一個 `dsh --profile sdk` 子行程；DSH 的診斷輸出寫進 log 檔，
 * stdout 只承載協定訊框（sdk-app README §stdout is the protocol）。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createWriteStream, type WriteStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const MODELS = {
  deepseek: { provider: 'deepseek-official', model: 'deepseek-flash', patches: [] as readonly string[] },
  local: { provider: 'local-eve', model: 'EVE-27B', patches: [join(REPO, 'dsh', 'local-model.patch.yml')] as readonly string[] },
  nemotron: {
    provider: 'or-nemotron',
    model: 'nvidia/nemotron-3.5-super-vl:free',
    patches: [join(REPO, 'dsh', 'openrouter-model.patch.yml')] as readonly string[],
  },
  /** 付費端點，經 experiments/runner/openrouter-pin.ts 固定為 bf16 供應商（需先啟動代理）。 */
  'nemotron-bf16': {
    provider: 'or-nemotron-bf16',
    model: 'nvidia/nemotron-3.5-super-vl',
    patches: [join(REPO, 'dsh', 'openrouter-bf16.patch.yml')] as readonly string[],
  },
} as const
export type ModelName = keyof typeof MODELS

export const INDIVIDUAL_PATCH = join(REPO, 'individual', 'cordis.patch.yml')

export interface Question {
  readonly id: string
  readonly question: string
  readonly detail?: string
  readonly header?: string
  readonly options?: readonly { readonly label: string; readonly description?: string }[]
  readonly multiSelect?: boolean
}

export interface ApprovalRequest {
  readonly sessionId: string
  readonly toolName: string
  readonly callId?: string
  readonly reason?: string
}

export interface Answer {
  readonly id: string
  readonly selected: readonly string[]
  readonly custom?: string
}

export interface LaunchOptions {
  readonly model: ModelName
  /** 依序疊加的 DSH patch（模型 patch 會自動加在最後）。 */
  readonly patches: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly logPath: string
  readonly onApproval: (request: ApprovalRequest) => Promise<'allowed-once' | 'rejected'>
  readonly onQuestions: (sessionId: string, questions: readonly Question[]) => Promise<readonly Answer[]>
}

export class HarnessProcess {
  readonly model: ModelName
  readonly #child: ChildProcessWithoutNullStreams
  readonly #transport: JsonRpcLineTransport
  readonly #log: WriteStream
  readonly #exited: Promise<number | null>
  readonly #listeners = new Set<(sessionId: string, event: SessionEvent) => void>()

  private constructor(options: LaunchOptions) {
    this.model = options.model
    const route = MODELS[options.model]
    const args = ['--profile', 'sdk', ...[...options.patches, ...route.patches].flatMap((p) => ['--patch', p])]
    this.#log = createWriteStream(options.logPath, { flags: 'a' })
    this.#child = spawn('dsh', args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] })
    this.#child.stderr.pipe(this.#log, { end: false })
    this.#exited = new Promise((done) => this.#child.on('exit', (code) => done(code)))
    this.#transport = new JsonRpcLineTransport(this.#child.stdout, this.#child.stdin)
    this.#transport.onNotification((method, params) => {
      if (method !== 'session.event') return
      for (const listener of this.#listeners) listener(String(params['sessionId']), params['event'] as SessionEvent)
    })
    this.#transport.onRequest(async (method, params) => {
      if (method === 'approval/request') return { outcome: await options.onApproval(params as unknown as ApprovalRequest) }
      if (method === 'user-question/ask') {
        return { answers: await options.onQuestions(String(params['sessionId']), params['questions'] as Question[]) }
      }
      throw new Error(`unsupported host request ${method}`)
    })
  }

  /** 啟動並完成 initialize（初始化會等外掛樹就緒，見 sdk/server README §What SDK clients can do）。 */
  static async start(options: LaunchOptions): Promise<HarnessProcess> {
    const harness = new HarnessProcess(options)
    harness.#transport.start()
    const route = MODELS[options.model]
    await harness.#transport.request('initialize', {
      cwd: options.cwd,
      provider: route.provider,
      model: route.model,
      approvalRequests: true,
      capabilities: { userQuestions: true },
    })
    return harness
  }

  onSessionEvent(listener: (sessionId: string, event: SessionEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async resume(sessionId: string): Promise<void> {
    await this.#transport.request('session/resume', { sessionId })
  }

  /** 送出一則訊息並等到該 session（含其子代理）回到閒置。 */
  async run(sessionId: string, text: string, signal?: AbortSignal): Promise<void> {
    await this.#transport.request('session/prompt', { sessionId, contentBlocks: [{ type: 'text', text }] }, signal)
    await this.#transport.request('session/wait', { sessionId }, signal)
  }

  /** stdin EOF：DSH SDK 執行期依設計有界地正常關閉（等外掛卸載與持久化）。 */
  async close(): Promise<number | null> {
    this.#child.stdin.end()
    const code = await this.#exited
    this.#transport.close()
    await new Promise<void>((done) => this.#log.end(done))
    return code
  }

  /** 強制結束（逾時或錯誤後使用）。 */
  async kill(): Promise<number | null> {
    this.#child.kill('SIGKILL')
    const code = await this.#exited
    this.#transport.close()
    await new Promise<void>((done) => this.#log.end(done))
    return code
  }
}

export interface Block {
  readonly type: string
  readonly text?: string
  readonly name?: string
  readonly arguments?: string
}

export function textOf(blocks: readonly Block[]): string {
  return blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}
