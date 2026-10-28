/**
 * temir-recall：讓記憶參與每一次思考。
 *
 * 每個含有對方新訊息的步驟之前（DSH `agent/pre-step` waterfall）：
 * 1. 線索理解（輔助模型呼叫，見 aux.ts）：擷取這段話的事實與回想線索詞。
 * 2. 混合回憶（retrieve.ts）：原句與線索詞兩條路徑，以 RRF 合併；命中的事實對應回原始經歷。
 * 3. 新 session 的第一句，另外帶入最近一次對話的開頭與結尾。
 * 4. 以「回憶」訊息（source.kind=temir-recall, form=recall）放在對方的訊息之前；DSH 會把它記為
 *    user/message（model-visible means logged）。另寫一筆 `memory/recall` 記下線索、路徑與命中，
 *    供日後分析記憶是否真的影響了決策（hypotheses.md H-M1 的消融實驗）。
 * 個體自己的每則回覆也在背景擷取「我的立場與承諾」，寫成 `memory/facts`，讓之後回想得到自己說過的話。
 * DSH 關閉程序有 5 秒上限（launcher 的 PROCESS_SHUTDOWN_TIMEOUT_MS），背景擷取可能被中斷；
 * 因此每次啟動時補做尚未嘗試過的回覆，回憶前先等補做完成（有上限）。
 * 另提供主動回憶的 `recall` 工具。
 *
 * 設定（消融實驗用）：automatic＝自動回憶；expansion＝線索理解與事實擷取。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '../life/index.ts'
import { runAux, type AuxCall, type AuxPurpose, type AuxRoute } from './aux.ts'
import { FACTS_KIND, clip, hybridRecall, lastConversation, renderRecall, type FactsData } from './retrieve.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'temir-recall': { readonly kind: 'temir-recall' } & ContextFormed
  }
}

export const name = 'temir-recall'
export const inject = ['life', 'tools', 'llm']

export interface Config {
  /** 每步自動回憶（預設開）。 */
  readonly automatic?: boolean
  /** 線索理解與事實擷取的輔助模型呼叫（預設開）。 */
  readonly expansion?: boolean
  /** 自動回憶最多帶入幾段過往片段（預設 8）。 */
  readonly limit?: number
  /** 輔助呼叫的逾時（毫秒，預設 90000；本機模型無法關閉推理，需要較長時間）。 */
  readonly auxTimeoutMs?: number
}

const HEADER =
  '（回憶：以下是系統依目前的情境，從你的生命紀錄中自動取回的片段。它們只是線索，可能不完整，也可能與現在無關；使用前先判斷哪些真的相關、哪些比較新。）'

function textOf(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

export function apply(ctx: Context, config: Config | undefined): void {
  const life = ctx.life
  const automatic = config?.automatic ?? true
  const expansion = config?.expansion ?? true
  const limit = config?.limit ?? 8
  const timeoutMs = config?.auxTimeoutMs ?? 90_000
  const logger = ctx.logger('temir-recall')

  /** pre-step 擷取到的事實，等對應的 user/message 寫進生命日誌後再寫成 memory/facts。 */
  const pendingFacts = new Map<string, readonly string[]>()
  /** 背景擷取（自己的回覆）；卸載前等它們完成，避免程序結束時遺失。 */
  const background = new Set<Promise<void>>()
  ctx.effect(
    () => async () => {
      await Promise.allSettled([...background])
    },
    'temir-recall: finish background extraction',
  )

  async function aux(
    purpose: AuxPurpose,
    route: AuxRoute,
    input: string,
    session: string | undefined,
    causes: readonly string[],
    signal?: AbortSignal,
  ): Promise<AuxCall | undefined> {
    const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    const model = `${route.provider}/${route.model}`
    try {
      const call = await runAux(ctx, purpose, route, input, deadline)
      life.append({
        kind: 'memory/aux',
        origin: 'self',
        session,
        model,
        data: { purpose, ms: call.ms, input: clip(input, 4000), output: call.output, parsed: call.result ?? null },
        causes,
      })
      return call
    } catch (error) {
      if (!life.isOpen) return undefined // 程序正在關閉；下次啟動時補做
      life.append({ kind: 'memory/aux', origin: 'self', session, model, data: { purpose, error: String(error), input: clip(input, 4000) }, causes })
      logger.warn('auxiliary %s call failed: %s', purpose, error)
      return undefined
    }
  }

  /** 擷取自己某則回覆中的立場與承諾。 */
  function extractSaid(sourceEvent: string, session: string, route: AuxRoute, said: string): Promise<void> {
    const task = (async () => {
      const call = await aux('said', route, clip(said, 6000), session, [sourceEvent])
      if (call?.result && call.result.facts.length > 0 && life.isOpen) appendFacts(session, sourceEvent, call.result.facts, 'said')
    })().catch((error: unknown) => logger.error('self-statement extraction failed: %s', error))
    background.add(task)
    void task.finally(() => background.delete(task))
    return task
  }

  /** 補做：最近的回覆中，還沒有任何擷取嘗試（成功或失敗）的那些。 */
  async function catchUp(): Promise<void> {
    const pending = life
      .recent(100, ['dsh/assistant/message'])
      .filter((e) => e.text !== null && e.session !== null && life.referencing(e.id, 'memory/aux').length === 0)
    for (const event of pending.reverse()) {
      const message = (event.data as { data?: { message?: { content?: readonly { type: string; text?: string }[]; source?: AuxRoute } } }).data?.message
      const said = textOf(message?.content ?? []).trim()
      if (!said || !message?.source) continue
      await extractSaid(event.id, event.session!, { provider: message.source.provider, model: message.source.model }, said)
    }
  }
  const caughtUp: Promise<void> = expansion ? catchUp() : Promise.resolve()

  function appendFacts(session: string, source: string, facts: readonly string[], from: FactsData['from']): void {
    const data: FactsData = { facts, from }
    life.append({ kind: FACTS_KIND, origin: 'self', session, data, text: facts.join('\n'), causes: [source] })
  }

  if (automatic || expansion) {
    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const human = decision.messages.filter((m) => m.source.kind === 'user')
      const cue = human.map((m) => textOf(m.content)).join('\n').trim()
      if (!cue) return decision
      const session = payload.agent.session.id

      let keywords: string[] = []
      if (expansion) {
        // 先等啟動時的補做（有上限），讓上一次程序沒做完的自我陳述也能被回想。
        await Promise.race([caughtUp, new Promise((done) => setTimeout(done, timeoutMs))])
        const route = { provider: payload.modelSelection.provider, model: payload.modelSelection.model }
        const call = await aux('heard', route, cue, session, [], payload.signal)
        if (call?.result) {
          keywords = call.result.keywords
          if (call.result.facts.length > 0) for (const m of human) pendingFacts.set(m.id, call.result.facts)
        }
      }
      if (!automatic) return decision

      try {
        const first = life.inSession(session, 'dsh/user/message', 'asc', 1).length === 0
        const last = first ? lastConversation(life, session) : undefined
        const recalled = hybridRecall(life, cue, keywords, { limit, excludeSession: session })
        life.append({
          kind: 'memory/recall',
          origin: 'self',
          session,
          data: {
            mode: 'automatic',
            cue: clip(cue, 500),
            keywords,
            lastSession: last?.session ?? null,
            hits: recalled.map((r) => ({ id: r.event.id, via: r.via, score: r.score })),
          },
          causes: recalled.map((r) => r.event.id),
        })
        if (recalled.length === 0 && !last) return decision
        const recall = createUserMessage({
          content: [{ type: 'text', text: renderRecall(life, recalled, last, HEADER) }],
          source: { kind: 'temir-recall', form: 'recall' },
        })
        return { ...decision, messages: [recall, ...decision.messages] }
      } catch (error) {
        logger.error('automatic recall failed: %s', error)
        return decision
      }
    })

    ctx.on('session/event', (session: Session, event: SessionEvent) => {
      try {
        if (event.type === 'user/message') {
          const facts = pendingFacts.get(event.data.id)
          if (facts) {
            pendingFacts.delete(event.data.id)
            appendFacts(session.id, `${session.id}#${event.seq}`, facts, 'heard')
          }
        } else if (expansion && event.type === 'assistant/message') {
          const said = textOf(event.data.message.content as readonly { type: string; text?: string }[]).trim()
          if (!said) return
          const source = event.data.message.source
          void extractSaid(`${session.id}#${event.seq}`, session.id, { provider: source.provider, model: source.model }, said)
        }
      } catch (error) {
        logger.error('fact bookkeeping failed: %s', error)
      }
    })
  }

  ctx.tools.register(
    defineTool({
      name: 'recall',
      description:
        '在你自己的生命紀錄中搜尋過去的經歷、你說過的話、你的感受、目標與自我修訂。用自然語言描述你想找的東西；多寫幾個可能出現的詞會更容易找到。',
      parameters: {
        query: { type: 'string', required: true, description: '要回想的內容' },
        limit: { type: 'integer', description: '最多回傳幾筆（預設 8）' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const session = exec.agent?.session.id
        const recalled = hybridRecall(life, args.query, [], { limit: args.limit ?? 8 })
        life.append({
          kind: 'memory/recall',
          origin: 'self',
          session,
          data: { mode: 'voluntary', cue: clip(args.query, 500), hits: recalled.map((r) => ({ id: r.event.id, via: r.via, score: r.score })) },
          causes: recalled.map((r) => r.event.id),
        })
        if (recalled.length === 0) return '生命紀錄中沒有找到相關的經歷。（檢索以詞彙比對為主，換個說法或多寫幾個詞可能找得到。）'
        return renderRecall(life, recalled, undefined, `找到 ${recalled.length} 筆相關的經歷：`)
      },
    }),
  )
}
